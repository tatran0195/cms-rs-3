# Frontend Architecture Refactor & Legacy Shim Elimination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate legacy SSR dead code and compatibility shims, decouple `@cms/site` navigation with an explicit `basePath`, replace pseudo-server-functions (`*Fn`) with typed client services, and distribute monolithic API hooks to feature-owned slices.

**Architecture:** Purge dead TanStack Start / Nitro SSR files in `shared/lib`; remove bridge path aliases from `tsconfig.json`, `vite.config.ts`, and `vitest.config.ts`; make `@cms/site` URL generation deterministic via explicit `basePath`; replace `{ data: { ... } }` wrapper shims with typed `siteService` and `authClient.getSession()`; decompose `shared/hooks/api/mutations.ts` into feature-owned services (`editor-api.ts`, `settings-api.ts`, `publishing-api.ts`, `projects-api.ts`).

**Tech Stack:** TypeScript, React 19, Vite, TanStack Router, TanStack Query, Vitest, Bun workspaces.

## Global Constraints

- Platform is exclusively for internal company deployment. No plan, billing, or marketing features.
- Single-binary (`apps/runner` / `cms-site.exe`) and reader (`apps/reader`) remain decoupled from studio (`apps/studio`).
- All tests across `@cms/studio` and `@cms/site` must pass without regressions.
- No dummy/placeholder heuristic functions. Code must be idiomatic, typed, and clean.

---

### Task 1: Dead Legacy SSR Files Purge & Alias Cleanup

**Files:**
- Delete: `apps/studio/src/shared/lib/custom-domain-rewrite.ts`
- Delete: `apps/studio/src/shared/lib/custom-domain-rewrite.test.ts`
- Delete: `apps/studio/src/shared/lib/public-route-manifest.ts`
- Delete: `apps/studio/src/shared/lib/public-route-manifest.test.ts`
- Delete: `apps/studio/src/shared/lib/content-security-policy.ts`
- Delete: `apps/studio/src/shared/lib/content-security-policy.test.ts`
- Delete: `apps/studio/src/shared/lib/request-negotiation.ts`
- Delete: `apps/studio/src/shared/lib/request-negotiation.test.ts`
- Modify: `apps/studio/src/shared/lib/index.ts`
- Modify: `apps/studio/tsconfig.json`
- Modify: `apps/studio/vite.config.ts`
- Modify: `apps/studio/vitest.config.ts`

**Interfaces:**
- Consumes: None (purges unused legacy code)
- Produces: Clean `apps/studio/src/shared/lib` containing only active utilities (`format`, `usage-format`, `shortcut`, `form`, `links`, `languages`, `typography`, `query-client`, `invitations`, `deployment-status`) and single `@/*` alias in tooling.

- [ ] **Step 1: Delete dead SSR library and test files**

Run command to remove the 8 dead files:
```powershell
Remove-Item "apps/studio/src/shared/lib/custom-domain-rewrite.ts"
Remove-Item "apps/studio/src/shared/lib/custom-domain-rewrite.test.ts"
Remove-Item "apps/studio/src/shared/lib/public-route-manifest.ts"
Remove-Item "apps/studio/src/shared/lib/public-route-manifest.test.ts"
Remove-Item "apps/studio/src/shared/lib/content-security-policy.ts"
Remove-Item "apps/studio/src/shared/lib/content-security-policy.test.ts"
Remove-Item "apps/studio/src/shared/lib/request-negotiation.ts"
Remove-Item "apps/studio/src/shared/lib/request-negotiation.test.ts"
```

- [ ] **Step 2: Update `apps/studio/src/shared/lib/index.ts`**

Update `apps/studio/src/shared/lib/index.ts` to export only active libraries:
```ts
export * from './format';
export * from './usage-format';
export * from './shortcut';
export * from './form';
export * from './links';
export * from './languages';
export * from './typography';
export * from './query-client';
export * from './invitations';
export * from './deployment-status';
```

- [ ] **Step 3: Remove bridge aliases from tooling configs**

In `apps/studio/tsconfig.json`:
```json
{
  "extends": "@cms/tsconfig/react.json",
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src", "vite.config.ts"],
  "exclude": ["node_modules", "dist", ".output", ".nitro"]
}
```

In `apps/studio/vite.config.ts`:
```ts
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
```

In `apps/studio/vitest.config.ts`:
```ts
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
```

- [ ] **Step 4: Verify typecheck and tests**

Run:
```bash
bun --filter @cms/studio typecheck
bun --filter @cms/studio test
```
Expected: PASS (44 test files pass, 0 failures).

---

### Task 2: Decouple `@cms/site` Navigation via Explicit Base Path

**Files:**
- Delete: `packages/site/src/lib/site-origin.ts`
- Modify: `packages/site/src/lib/site-paths.ts`
- Modify: `packages/site/src/lib/site-paths.test.ts`
- Modify: `packages/site/src/lib/site-redirects.ts`
- Modify: `packages/site/src/index.ts`
- Modify: `packages/site/src/views/SiteLayout.tsx`
- Modify: `apps/reader/src/router.tsx`
- Modify: `apps/studio/src/routes/sites/$projectId/route.tsx`
- Modify: `apps/studio/src/routes/sites/$projectId/index.tsx`
- Modify: `apps/studio/src/routes/sites/$projectId/changelog.tsx`
- Modify: `apps/studio/src/routes/sites/$projectId/$.tsx`

**Interfaces:**
- Consumes: `basePath` from `SiteLayout` / `useSiteContext()`
- Produces: Deterministic `siteHref(projectId, path, { lang, version, basePath })` without `window.location` heuristics.

- [ ] **Step 1: Delete `packages/site/src/lib/site-origin.ts`**

Run:
```powershell
Remove-Item "packages/site/src/lib/site-origin.ts"
```

- [ ] **Step 2: Refactor `site-paths.ts` to use explicit `basePath`**

In `packages/site/src/lib/site-paths.ts`:
```ts
const cleanPath = (path = ''): string => path.replace(/^\/+|\/+$/g, '');

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const encodeSegment = (segment: string): string => encodeURIComponent(safeDecode(segment));

const splitPath = (path: string): { pathname: string; query: string; fragment: string } => {
  const hashAt = path.indexOf('#');
  const beforeHash = hashAt >= 0 ? path.slice(0, hashAt) : path;
  const fragment = hashAt >= 0 ? path.slice(hashAt) : '';
  const queryAt = beforeHash.indexOf('?');
  return {
    pathname: queryAt >= 0 ? beforeHash.slice(0, queryAt) : beforeHash,
    query: queryAt >= 0 ? beforeHash.slice(queryAt) : '',
    fragment,
  };
};

export function siteLanguageParam(code?: string, defaultCode?: string): string | undefined {
  return code === defaultCode ? undefined : code;
}

export interface SiteHrefOptions {
  lang?: string;
  version?: string;
  basePath?: string;
}

export function siteHref(projectId: string, path = '', options?: SiteHrefOptions): string {
  const { pathname, query, fragment } = splitPath(path);
  const fullPath = [options?.version, cleanPath(pathname)]
    .filter(Boolean)
    .join('/')
    .split('/')
    .filter(Boolean)
    .map(encodeSegment)
    .join('/');

  const prefix = options?.basePath !== undefined ? options.basePath : (projectId ? `/sites/${projectId}` : '');
  const langParam = options?.lang && !new URLSearchParams(query).has('lang') ? `lang=${encodeURIComponent(options.lang)}` : '';
  const search = langParam ? `${query ? `${query}&` : '?'}${langParam}` : query;
  const href = `${prefix}${fullPath ? `/${fullPath}` : ''}` || '/';
  return `${href}${search}${fragment}`;
}
```

- [ ] **Step 3: Update `packages/site/src/lib/site-paths.test.ts`**

Update the unit tests to verify deterministic prefixing with `basePath`:
```ts
import { describe, expect, it } from 'vitest';
import { siteHref, siteLanguageParam } from './site-paths';

describe('siteHref', () => {
  it('prefixes with basePath when provided', () => {
    expect(siteHref('p1', 'guides', { basePath: '' })).toBe('/guides');
    expect(siteHref('p1', 'guides', { basePath: '/sites/p1' })).toBe('/sites/p1/guides');
    expect(siteHref('p1', 'guides', { basePath: '/sites/p1', version: 'v2', lang: 'ja' })).toBe('/sites/p1/v2/guides?lang=ja');
  });

  it('handles default studio prefix when basePath is omitted', () => {
    expect(siteHref('p1', 'intro')).toBe('/sites/p1/intro');
    expect(siteHref('p1', '')).toBe('/sites/p1');
  });

  it('correctly normalizes non-ASCII segments', () => {
    expect(siteHref('p1', 'מדריכים', { basePath: '' })).toBe('/%D7%9E%D7%93%D7%A8%D7%99%D7%9B%D7%99%D7%9D');
  });
});
```

- [ ] **Step 4: Update `packages/site/src/index.ts`**

Remove `customDomainOrigin` and `isCustomDomainSite` exports from `packages/site/src/index.ts`. Export `siteHref`, `siteLanguageParam`, and `type SiteHrefOptions`.

- [ ] **Step 5: Update route consumers in `apps/studio` and `apps/reader`**

In `apps/studio/src/routes/sites/$projectId/*`:
Remove `customDomainOrigin` and `isCustomDomainSite` imports. Use explicit `basePath = '/sites/' + params.projectId` for all site links and redirects.

In `apps/reader/src/router.tsx`:
Ensure `basePath = ""` is passed to `SiteLayout`.

- [ ] **Step 6: Run verification**

Run:
```bash
bun --filter @cms/site typecheck
bun --filter @cms/site test
bun --filter @cms/reader typecheck
bun --filter @cms/studio typecheck
```
Expected: PASS.

---

### Task 3: Replace `*Fn` Pseudo-Server-Functions with Clean Typed Services

**Files:**
- Modify: `apps/studio/src/shared/services/site-service.ts`
- Delete: `apps/studio/src/features/auth/services/session.ts`
- Modify: `apps/studio/src/features/auth/services/auth-client.ts`
- Modify: `apps/studio/src/features/auth/index.ts`
- Modify: `apps/studio/src/routes/app/route.tsx`
- Modify: `apps/studio/src/routes/(auth)/route.tsx`
- Modify: `apps/studio/src/routes/sites/$projectId/route.tsx`
- Modify: `apps/studio/src/routes/sites/$projectId/index.tsx`
- Modify: `apps/studio/src/routes/sites/$projectId/changelog.tsx`
- Modify: `apps/studio/src/routes/sites/$projectId/$.tsx`
- Modify: `apps/studio/src/routes/git-preview.$token.tsx`

**Interfaces:**
- Consumes: Direct typed arguments (`projectId: string, options?: { language?: string; version?: string }`)
- Produces: `siteService` client and `authClient.getSession()`

- [ ] **Step 1: Refactor `apps/studio/src/shared/services/site-service.ts`**

Update `site-service.ts` with direct, typed function signatures:
```ts
import { getData, type ChangelogEntry, type SearchAnswer, type SitePage, type SiteSearchHit, type SiteShell } from '../hooks/api';
import { api } from './api';

export const siteService = {
  getSite: async (projectId: string, options?: { language?: string; version?: string }): Promise<SiteShell> =>
    getData<SiteShell>(
      await api.public.sites[':id'].$get({
        param: { id: projectId },
        query: { ...(options?.language ? { lang: options.language } : {}), ...(options?.version ? { version: options.version } : {}) },
      }),
      'site',
    ),

  getPage: async (projectId: string, path: string, options?: { language?: string; version?: string }): Promise<SitePage> =>
    getData<SitePage>(
      await api.public.sites[':id'].page.$get({
        param: { id: projectId },
        query: {
          path,
          ...(options?.language ? { lang: options.language } : {}),
          ...(options?.version ? { version: options.version } : {}) },
      }),
      'page',
    ),

  listChangelog: async (projectId: string): Promise<ChangelogEntry[]> =>
    getData<ChangelogEntry[]>(await api.public.sites[':id'].changelog.$get({ param: { id: projectId } }), 'changelog'),

  getGitPreview: async (token: string): Promise<string> => {
    const response = await api.public.git.previews[':token'].$get({ param: { token } });
    return JSON.stringify(await getData(response, 'pull-request preview'));
  },

  search: async (
    projectId: string,
    query: string,
    options?: { language?: string; version?: string; limit?: number },
  ): Promise<SiteSearchHit[]> => {
    const result = await getData<{ hits: SiteSearchHit[] }>(
      await api.public.sites[':id'].search.$get({
        param: { id: projectId },
        query: {
          q: query,
          ...(options?.limit ? { limit: String(options.limit) } : {}),
          ...(options?.language ? { lang: options.language } : {}),
          ...(options?.version ? { version: options.version } : {}),
        },
      }),
      'search',
    );
    return result.hits;
  },

  answer: async (
    projectId: string,
    query: string,
    options?: { language?: string; version?: string },
  ): Promise<SearchAnswer> =>
    getData<SearchAnswer>(
      await api.public.sites[':id'].answer.$post({
        param: { id: projectId },
        json: {
          question: query,
          q: query,
          query,
          ...(options?.language ? { lang: options.language } : {}),
          ...(options?.version ? { version: options.version } : {}),
        },
      }),
      'answer',
    ),
};
```

- [ ] **Step 2: Unify `authClient.getSession` and delete `session.ts`**

In `apps/studio/src/features/auth/services/auth-client.ts`, add:
```ts
  getSession: async (): Promise<SessionData | null> => {
    try {
      const res = await fetch('/api/auth/get-session', { credentials: 'include' });
      if (!res.ok) return null;
      const json = await res.json();
      return json?.user ? json : null;
    } catch {
      return null;
    }
  },
```
Delete `apps/studio/src/features/auth/services/session.ts`.
In `apps/studio/src/features/auth/index.ts`, export `authClient` and remove `getSessionFn`.

- [ ] **Step 3: Update all route adapters to use typed service methods**

In `apps/studio/src/routes/app/route.tsx`:
```ts
beforeLoad: async () => {
  const routeSession = await authClient.getSession();
  if (!routeSession) throw redirect({ to: '/sign-in' });
  return { routeSession };
}
```

In `apps/studio/src/routes/(auth)/route.tsx`:
```ts
beforeLoad: async ({ location }) => {
  if (await authClient.getSession()) {
    throw redirect({ to: '/app' });
  }
}
```

In `apps/studio/src/routes/sites/$projectId/*`:
Replace `getSiteFn({ data: ... })` with `siteService.getSite(...)`, `getSitePageFn({ data: ... })` with `siteService.getPage(...)`, and `listSiteChangelogFn({ data: ... })` with `siteService.listChangelog(...)`.

In `apps/studio/src/routes/git-preview.$token.tsx`:
Replace `getGitPreviewFn({ data: ... })` with `siteService.getGitPreview(...)`.

- [ ] **Step 4: Verify typecheck and tests**

Run:
```bash
bun --filter @cms/studio typecheck
bun --filter @cms/studio test
```
Expected: PASS.

---

### Task 4: Distribute Monolithic API Hooks to Feature Slices

**Files:**
- Create: `apps/studio/src/features/editor/services/editor-api.ts`
- Create: `apps/studio/src/features/project-settings/services/settings-api.ts`
- Create: `apps/studio/src/features/publishing/services/publishing-api.ts`
- Create: `apps/studio/src/features/projects/services/projects-api.ts`
- Modify: `apps/studio/src/features/editor/index.ts`
- Modify: `apps/studio/src/features/project-settings/index.ts`
- Modify: `apps/studio/src/features/publishing/index.ts`
- Modify: `apps/studio/src/features/projects/index.ts`
- Modify: `apps/studio/src/shared/hooks/api/mutations.ts`
- Modify: `apps/studio/src/shared/hooks/api/queries.ts`

**Interfaces:**
- Consumes: Base `api` client from `@/shared` and `queryKeys`
- Produces: Feature-owned TanStack Query hooks exported through each feature's public API.

- [ ] **Step 1: Extract `features/editor/services/editor-api.ts`**

Move editor-specific hooks (`useCreatePage`, `useUpdatePage`, `useDeletePage`, `useReorderPages`, `useDraftPreview`, `useCreateBranch`, `useBranches`, `usePage`, `usePages`) into `features/editor/services/editor-api.ts`.
Export from `features/editor/index.ts`.
Update internal editor components to import from `./services/editor-api` or `@/features/editor`.

- [ ] **Step 2: Extract `features/project-settings/services/settings-api.ts`**

Move settings-specific hooks (`useUpdateProjectConfig`, `useUpdateWorkspaceSettings`, `useAddDomain`, `useDeleteDomain`, `useSetPrimaryDomain`, `useVerifyDomain`, `useCreateApiKey`, `useRotateApiKey`, `useDeleteApiKey`, `useUpdateProjectAddon`, `useDeleteProjectAddon`) into `features/project-settings/services/settings-api.ts`.
Export from `features/project-settings/index.ts`.
Update project-settings tab components.

- [ ] **Step 3: Extract `features/publishing/services/publishing-api.ts`**

Move publishing-specific hooks (`useDeployments`, `usePublish`, `useRollback`, `usePendingChanges`, `usePublishAnyway`) into `features/publishing/services/publishing-api.ts`.
Export from `features/publishing/index.ts`.
Update publishing components (`PublishModal`, `PublishControl`, `DeployPipeline`).

- [ ] **Step 4: Extract `features/projects/services/projects-api.ts`**

Move project management hooks (`useProjects`, `useProject`, `useCreateProject`, `useDeleteProject`, `useProjectMembers`) into `features/projects/services/projects-api.ts`.
Export from `features/projects/index.ts`.

- [ ] **Step 5: Trim `shared/hooks/api/mutations.ts` and `queries.ts`**

Retain in `shared/hooks/api/` only genuine cross-cutting hooks:
- `useSession`
- `useActiveProject`
- `useNotifications` / `useMarkNotificationsRead`
- `useMembers` / `useInviteMember` / `useRemoveMember` / `useUpdateMemberRole`

- [ ] **Step 6: Verify typecheck and tests**

Run:
```bash
bun --filter @cms/studio typecheck
bun --filter @cms/studio test
```
Expected: PASS (all tests pass).

---

### Task 5: End-to-End Quality Gates & Validation

**Files:**
- None (verification phase)

- [ ] **Step 1: Run frontend quality gates**

```bash
bun --filter @cms/studio typecheck
bun --filter @cms/studio test
bun --filter @cms/site typecheck
bun --filter @cms/site test
bun --filter @cms/reader typecheck
bun --filter @cms/reader build
```
Expected: All exit with code 0.

- [ ] **Step 2: Run backend quality gates**

```bash
cargo check -p cms-runner
cargo build -p cms-runner
cargo test -p cms-biz --lib export::tests
```
Expected: All exit with code 0.
