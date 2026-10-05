# Frontend Architecture Refactor & Legacy Shim Elimination Design

**Date:** 2026-10-05  
**Status:** Approved  
**Scope:** `apps/studio`, `packages/site`, `apps/reader`  

---

## 1. Context and Problem Statement

Following the completion of the directory migration in `FRONTEND_MODULARIZATION_PLAN.md`, an architectural audit revealed residual compatibility shims and dead code dating back to earlier TanStack Start / Nitro SSR framework iterations:

1. **Dead SSR Code:** `custom-domain-rewrite.ts`, `public-route-manifest.ts`, `content-security-policy.ts`, and `request-negotiation.ts` are 100% unused in the Vite SPA architecture. Their remaining test suites (~65 tests) only test dead server middleware.
2. **Dummy / Placeholder Heuristics:** `customDomainOrigin()` in `packages/site/src/lib/site-origin.ts` returns `window.location.origin`, which makes `isCustomDomainSite()` unconditionally return `true` in all browsers. This breaks internal preview URL prefixing (`/sites/$projectId`).
3. **Pseudo-Server-Function Signatures (`*Fn({ data })`):** Client service wrappers in `apps/studio/src/shared/services/site-service.ts` (`getSiteFn`, `getSitePageFn`, etc.) emulate TanStack Start's `createServerFn` parameter envelope (`{ data: { ... } }`) instead of providing idiomatic TypeScript client methods.
4. **Monolithic API Hooks:** `apps/studio/src/shared/hooks/api/mutations.ts` is a 724-line monolith containing editor, project-settings, publishing, and project mutations in a single global file, violating feature slice ownership.

The objective of this refactor is to eliminate all dummy shims and dead code, make `@cms/site` link resolution deterministic via explicit `basePath`, replace `*Fn` wrappers with clean typed services, and move feature-specific API hooks into their respective feature folders.

---

## 2. Invariants

- **Internal Company Deployment:** The platform is strictly for internal company use. No billing, plan tiers, payment gateways, or marketing landing pages.
- **Single-Binary & 4-App Architecture:** `apps/reader` remains the standalone reader SPA (`/`, `/changelog`, `/$slug`) embedded into `apps/runner` (`cms-site.exe`). `apps/studio` remains the internal authoring SPA (`/app`, `/sites/$projectId`).
- **Zero Breakage:** All 48 test files in `apps/studio` and 17 test files in `packages/site` must pass with zero regressions.

---

## 3. Subsystem Designs

### 3.1 Dead Legacy SSR Purge & Alias Cleanup
- **Remove Dead Files:**
  - Delete `apps/studio/src/shared/lib/custom-domain-rewrite.ts` and `custom-domain-rewrite.test.ts`.
  - Delete `apps/studio/src/shared/lib/public-route-manifest.ts` and `public-route-manifest.test.ts`.
  - Delete `apps/studio/src/shared/lib/content-security-policy.ts` and `content-security-policy.test.ts`.
  - Delete `apps/studio/src/shared/lib/request-negotiation.ts` and `request-negotiation.test.ts`.
- **Remove Bridge Aliases:**
  - In `apps/studio/tsconfig.json`, `apps/studio/vite.config.ts`, and `apps/studio/vitest.config.ts`, remove the temporary bridge paths:
    `@/hooks/*`, `@/services/*`, `@/lib/*`.
  - All shared imports must route cleanly through `@/shared` or relative paths.

### 3.2 Decouple `@cms/site` Navigation via Explicit Base Path
- **Remove Heuristic Origin & Domain Modules:**
  - Delete `packages/site/src/lib/site-origin.ts`.
  - Remove `isCustomDomainSite()`, `customDomainOrigin()`, and `siteBasePath()` from `packages/site/src/lib/site-paths.ts`.
- **Deterministic URL Generation:**
  - `siteHref(projectId: string, path?: string, options?: { lang?: string; version?: string; basePath?: string }): string`
  - When `basePath` is provided, URLs prefix with `basePath`.
  - If `basePath` is omitted:
    - In `apps/reader`: defaults to `""` (root-mounted, e.g. `/v2/start?lang=ja`).
    - In `apps/studio`: `basePath` defaults to `/sites/${projectId}` (e.g. `/sites/p1/v2/start?lang=ja`).
- **Context Integration:**
  - `SiteLayout` provides `basePath` down via `SiteContext` so components (`SiteNav`, `SitePageView`, `SiteSearch`, `Markdown`) generate relative links deterministically without inspecting `window.location`.

### 3.3 Replace `*Fn` Pseudo-Server-Functions with Clean Typed Services
- **Site Service (`apps/studio/src/shared/services/site-service.ts`):**
  - Replace `getSiteFn({ data })`, `getSitePageFn({ data })`, `listSiteChangelogFn({ data })`, `getGitPreviewFn({ data })`, `searchSiteFn({ data })`, `answerSiteFn({ data })` with clean idiomatic signatures:
    ```ts
    export const siteService = {
      getSite: (projectId: string, options?: { language?: string; version?: string }) => Promise<SiteShell>,
      getPage: (projectId: string, path: string, options?: { language?: string; version?: string }) => Promise<SitePage>,
      listChangelog: (projectId: string) => Promise<ChangelogEntry[]>,
      getGitPreview: (token: string) => Promise<string>,
      search: (projectId: string, query: string, options?: { language?: string; version?: string; limit?: number }) => Promise<SiteSearchHit[]>,
      answer: (projectId: string, query: string, options?: { language?: string; version?: string }) => Promise<SearchAnswer>,
    };
    ```
- **Auth Session Service:**
  - Delete `apps/studio/src/features/auth/services/session.ts`.
  - Consolidate session retrieval into `authClient.getSession()`.
  - Update route loaders in `routes/app/route.tsx` and `routes/(auth)/route.tsx` to call `authClient.getSession()`.

### 3.4 Distribute Monolithic API Hooks to Feature Slices
Move domain-specific queries and mutations from `apps/studio/src/shared/hooks/api/mutations.ts` and `queries.ts` into owning feature modules:
1. **`features/editor/`**:
   - `services/editor-api.ts`: `useCreatePage`, `useUpdatePage`, `useDeletePage`, `useReorderPages`, `useDraftPreview`, `useCreateBranch`, `useBranches`, `usePage`, `usePages`.
2. **`features/project-settings/`**:
   - `services/settings-api.ts`: `useUpdateProjectConfig`, `useUpdateWorkspaceSettings`, `useAddDomain`, `useDeleteDomain`, `useCreateApiKey`, `useRotateApiKey`, `useDeleteApiKey`, `useUpdateProjectAddon`.
3. **`features/publishing/`**:
   - `services/publishing-api.ts`: `useDeployments`, `usePublish`, `useRollback`, `usePendingChanges`.
4. **`features/projects/`**:
   - `services/projects-api.ts`: `useProjects`, `useProject`, `useCreateProject`, `useDeleteProject`.
5. **`shared/hooks/api/`**:
   - Retain only shared cross-cutting hooks: `useSession`, `useActiveProject`, `useNotifications`, `useMembers`.

---

## 4. Quality Gates and Verification

1. `bun --filter @cms/studio typecheck` (zero TypeScript errors).
2. `bun --filter @cms/studio test` (all active test files pass).
3. `bun --filter @cms/site typecheck` (zero TypeScript errors).
4. `bun --filter @cms/site test` (all active test files pass).
5. `bun --filter @cms/reader typecheck` && `bun --filter @cms/reader build` (emits clean `dist/reader/`).
6. `cargo check -p cms-runner` && `cargo test -p cms-biz --lib export::tests`.
