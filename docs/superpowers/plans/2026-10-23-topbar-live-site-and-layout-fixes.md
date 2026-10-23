# Topbar Live Site, Site Config Navigation, and Published DocsLayout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide direct 1-click access to the live published site in the persistent topbar (and editor), provide a clear "Back to editor" return path from Site Configuration, and ensure that selected `docsLayout` styles correctly synchronize and display on the published site.

**Architecture:** 
- A shared `useLiveSiteUrl` hook standardizes domain and URL resolution across studio pages.
- `ProjectLayout` and `EditorPage` headers integrate a consistent "Live Site" external link action, while redundant header buttons on Overview and Publish pages are removed.
- `EditorPage` replaces the static config header in the sidebar and the subtle "Done" canvas button with prominent "Back to editor" controls, suppressing markdown-specific editor buttons while in config mode.
- `DocumentationThemeProvider`, `styles.css`, and publishing query invalidation (`usePublish`, `usePublishAnyway`, `useRollback`, `DeployPipeline`) ensure `docsLayout` updates immediately propagate to `/sites/$projectId`.

**Tech Stack:** TypeScript, React, TanStack Query, TanStack Router, Lucide React, Tailwind CSS / Vanilla CSS, Vitest.

## Global Constraints

- Platform is internal company deployment — NO billing, plan tiers, or public SaaS landing routes.
- Use existing design system components (`Button`, `cn`) and Lucide icons.
- Ensure all clickable links use appropriate ARIA labels and `rel="noreferrer"` on new-window targets.

---

### Task 1: Create `useLiveSiteUrl` Hook and Unit Tests

**Files:**
- Create: `apps/studio/src/features/projects/hooks/useLiveSiteUrl.ts`
- Create: `apps/studio/src/features/projects/hooks/useLiveSiteUrl.test.tsx`
- Modify: `apps/studio/src/features/projects/index.ts`

**Interfaces:**
- Produces: `useLiveSiteUrl(projectId: string): { liveHref: string; liveDomain: string | null; isReady: boolean }`

- [ ] **Step 1: Write the failing unit test**

Create `apps/studio/src/features/projects/hooks/useLiveSiteUrl.test.tsx`:
```tsx
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLiveSiteUrl } from './useLiveSiteUrl';

vi.mock('@cms/sdk/react', () => ({
  useProject: vi.fn(),
  useDomains: vi.fn(),
}));

import { useDomains, useProject } from '@cms/sdk/react';

describe('useLiveSiteUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns custom verified primary domain url when available', () => {
    vi.mocked(useProject).mockReturnValue({
      data: { id: 'proj-1', slug: 'my-project' },
    } as any);
    vi.mocked(useDomains).mockReturnValue({
      data: [{ domain: 'docs.example.com', isPrimary: true, verified: true }],
    } as any);

    const { result } = renderHook(() => useLiveSiteUrl('proj-1'));
    expect(result.current.liveDomain).toBe('docs.example.com');
    expect(result.current.liveHref).toBe('https://docs.example.com');
    expect(result.current.isReady).toBe(true);
  });

  it('falls back to /sites/${projectId} when no custom domain exists', () => {
    vi.mocked(useProject).mockReturnValue({
      data: { id: 'proj-1', slug: 'my-project' },
    } as any);
    vi.mocked(useDomains).mockReturnValue({
      data: [],
    } as any);

    const { result } = renderHook(() => useLiveSiteUrl('proj-1'));
    expect(result.current.liveHref).toBe('/sites/proj-1');
    expect(result.current.isReady).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run typecheck` in `apps/studio`
Expected: FAIL with "Cannot find module './useLiveSiteUrl'"

- [ ] **Step 3: Implement `useLiveSiteUrl`**

Create `apps/studio/src/features/projects/hooks/useLiveSiteUrl.ts`:
```tsx
import { useDomains, useProject } from '@cms/sdk/react';
import { env } from '@/env';

const siteBaseDomain = () => env.VITE_SITE_BASE_DOMAIN?.replace(/^\*\./, '').replace(/\.$/, '') || undefined;
const siteUrl = (domain: string | null, projectId: string) => (domain ? `https://${domain}` : `/sites/${projectId}`);

export function useLiveSiteUrl(projectId: string) {
  const { data: project } = useProject(projectId);
  const { data: domains } = useDomains(projectId);

  const primaryDomain = domains?.find((domain) => domain.isPrimary && domain.verified) ?? domains?.find((domain) => domain.verified);
  const baseDomain = siteBaseDomain();
  const liveDomain = primaryDomain?.domain ?? (project && baseDomain ? `${project.slug}.${baseDomain}` : null);
  const liveHref = siteUrl(liveDomain, projectId);

  return {
    liveHref,
    liveDomain,
    isReady: Boolean(project),
  };
}
```

Export in `apps/studio/src/features/projects/index.ts`:
```tsx
export * from './hooks/useLiveSiteUrl';
```

- [ ] **Step 4: Verify typecheck passes**

Run: `bun run typecheck` in `apps/studio`
Expected: PASS with 0 errors

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/projects/hooks/useLiveSiteUrl.ts apps/studio/src/features/projects/hooks/useLiveSiteUrl.test.tsx apps/studio/src/features/projects/index.ts
git commit -m "feat(studio): add useLiveSiteUrl hook with domain resolution"
```

---

### Task 2: Add "Live Site" Button to `ProjectLayout` Topbar

**Files:**
- Modify: `apps/studio/src/features/projects/components/ProjectLayout.tsx`
- Modify: `apps/studio/src/features/projects/components/ProjectLayout.test.tsx`

**Interfaces:**
- Consumes: `useLiveSiteUrl` from `@/features/projects`

- [ ] **Step 1: Update `ProjectLayout.test.tsx` to assert "Live Site" button**

In `apps/studio/src/features/projects/components/ProjectLayout.test.tsx`:
Add test expectation verifying an external link button with text "Live Site" and `target="_blank"` is rendered in the topbar header.

- [ ] **Step 2: Add "Live Site" button to `ProjectLayout.tsx`**

In `apps/studio/src/features/projects/components/ProjectLayout.tsx`:
Import `ExternalLink` from `lucide-react` and `useLiveSiteUrl` from `@/features/projects`.
Call `const { liveHref } = useLiveSiteUrl(projectId);`.
In both header action clusters (lines 80-97 and lines 137-154), right before the Preview button, add:
```tsx
<Button
  nativeButton={false}
  render={
    // biome-ignore lint/a11y/useAnchorContent: content is merged from the Button children via Base UI's render prop
    <a aria-label="View live published site" href={liveHref} rel="noreferrer" target="_blank" />
  }
  size="sm"
  variant="outline"
  className="h-7 text-xs font-normal gap-1.5"
>
  <ExternalLink className="size-3.5" /> Live Site
</Button>
```

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck` in `apps/studio`
Expected: PASS with 0 errors

- [ ] **Step 4: Commit**

```bash
git add apps/studio/src/features/projects/components/ProjectLayout.tsx apps/studio/src/features/projects/components/ProjectLayout.test.tsx
git commit -m "feat(studio): add Live Site button to ProjectLayout topbar"
```

---

### Task 3: Add "Live Site" Button to `EditorPage` Topbar

**Files:**
- Modify: `apps/studio/src/features/editor/EditorPage.tsx`

**Interfaces:**
- Consumes: `useLiveSiteUrl` from `@/features/projects`

- [ ] **Step 1: Integrate "Live Site" button into `EditorPage.tsx` header**

In `apps/studio/src/features/editor/EditorPage.tsx`:
Import `ExternalLink` from `lucide-react` and `useLiveSiteUrl` from `@/features/projects`.
Call `const { liveHref } = useLiveSiteUrl(projectId);`.
In the header actions cluster (around line 740, right next to the Preview button), render:
```tsx
<Button
  nativeButton={false}
  render={
    // biome-ignore lint/a11y/useAnchorContent: content is merged from the Button children via Base UI's render prop
    <a aria-label="View live published site" href={liveHref} rel="noreferrer" target="_blank" />
  }
  size="sm"
  variant="outline"
  className="h-7 gap-1.5 text-xs font-normal"
>
  <ExternalLink className="size-3.5" />
  <span className="hidden md:inline">Live Site</span>
</Button>
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck` in `apps/studio`
Expected: PASS with 0 errors

- [ ] **Step 3: Commit**

```bash
git add apps/studio/src/features/editor/EditorPage.tsx
git commit -m "feat(editor): add Live Site button to editor header"
```

---

### Task 4: Remove Redundant Buttons in Overview & Publish Pages

**Files:**
- Modify: `apps/studio/src/features/projects/ProjectOverviewPage.tsx`
- Modify: `apps/studio/src/features/projects/ProjectOverviewPage.test.tsx`
- Modify: `apps/studio/src/features/publishing/components/ProjectDeploymentsPage.tsx`
- Modify: `apps/studio/src/features/publishing/components/ProjectDeploymentsPage.test.tsx`

- [ ] **Step 1: Remove "View Site" header button from `ProjectOverviewPage.tsx`**

In `apps/studio/src/features/projects/ProjectOverviewPage.tsx`:
Remove the `<Button render={<a href={liveHref}...>{t('overview.viewSite')}</Button>` block (lines 139–147) from the top header row.
Leave the `<Button render={<Link to="/app/projects/$projectId/editor" />}>{t('overview.openEditor')}</Button>` button intact.
Retain the right-column "Live Site" status card (`lines 380-397`) and `copyLiveUrl`.

- [ ] **Step 2: Update `ProjectOverviewPage.test.tsx`**

Update any test in `ProjectOverviewPage.test.tsx` that specifically checked for the header "View Site" button so tests pass.

- [ ] **Step 3: Remove "View Live Site" header button from `ProjectDeploymentsPage.tsx`**

In `apps/studio/src/features/publishing/components/ProjectDeploymentsPage.tsx`:
Remove the `<Button render={<a href={liveHref}...>View Live Site</Button>` block (lines 183–191).
Leave the `<Button onClick={() => setPublishOpen(true)}>Publish New Version</Button>` button intact.
Retain the 3-column "Live Production" status card (`lines 207-235`).

- [ ] **Step 4: Update `ProjectDeploymentsPage.test.tsx`**

Update test assertions in `ProjectDeploymentsPage.test.tsx`.

- [ ] **Step 5: Run typecheck**

Run: `bun run typecheck` in `apps/studio`
Expected: PASS with 0 errors

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/features/projects/ProjectOverviewPage.tsx apps/studio/src/features/projects/ProjectOverviewPage.test.tsx apps/studio/src/features/publishing/components/ProjectDeploymentsPage.tsx apps/studio/src/features/publishing/components/ProjectDeploymentsPage.test.tsx
git commit -m "refactor(studio): remove redundant header live site buttons from overview and publish pages"
```

---

### Task 5: Implement "Back to Editor" in Site Configuration

**Files:**
- Modify: `apps/studio/src/features/editor/EditorPage.tsx`
- Modify: `apps/studio/src/features/editor/EditorPage.test.tsx` (if applicable)

- [ ] **Step 1: Add "Back to editor" in the sidebar header**

In `apps/studio/src/features/editor/EditorPage.tsx`:
Import `ArrowLeft` from `lucide-react`.
At line 574, where `view === 'config'` is checked in the sidebar header:
Replace `<span className="font-semibold text-xs tracking-tight text-foreground/90">{t('editor.config.heading')}</span>` with:
```tsx
<Button
  variant="ghost"
  size="sm"
  onClick={() => setView('content')}
  className="h-8 gap-1.5 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
  aria-label="Back to editor"
>
  <ArrowLeft className="size-3.5 rtl:rotate-180" />
  <span>Back to editor</span>
</Button>
```

- [ ] **Step 2: Upgrade "Done" to "Back to editor" in canvas config header**

In `apps/studio/src/features/editor/EditorPage.tsx`:
At line 803, replace:
```tsx
<Button variant="ghost" size="sm" onClick={() => setView('content')} className="text-xs h-7">
  Done
</Button>
```
with:
```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => setView('content')}
  className="h-7 gap-1.5 text-xs font-medium"
>
  <ArrowLeft className="size-3.5 rtl:rotate-180" />
  <span>Back to editor</span>
</Button>
```

- [ ] **Step 3: Hide page-editing controls when `view === 'config'`**

In `apps/studio/src/features/editor/EditorPage.tsx`:
In the top header right action cluster (lines 719-746):
When `view === 'config'`, hide `<SaveStatusIndicator />` and `<SegmentedControl>` (since no page document is actively being edited), so the interface stays focused and uncluttered.

- [ ] **Step 4: Run typecheck**

Run: `bun run typecheck` in `apps/studio`
Expected: PASS with 0 errors

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/editor/EditorPage.tsx
git commit -m "feat(editor): add prominent Back to Editor buttons in site configuration view"
```

---

### Task 6: Fix `docsLayout` Application, Query Invalidation, and Route Freshness

**Files:**
- Modify: `packages/site/src/components/documentation-theme-provider.tsx`
- Modify: `packages/sdk/src/react/hooks/deployments.ts`
- Modify: `apps/studio/src/features/publishing/components/DeployPipeline.tsx`
- Modify: `apps/studio/src/routes/sites/$projectId/route.tsx`
- Modify: `apps/studio/src/routes/sites/$projectId/$.tsx`
- Modify: `apps/studio/src/styles.css`

- [ ] **Step 1: Fix layout resolution in `DocumentationThemeProvider`**

In `packages/site/src/components/documentation-theme-provider.tsx`:
Import `resolveDocsLayout` from `@cms/shared/themes`.
Replace line 308:
```tsx
- const docsLayout = theme.layout.docsLayout ?? 'docs';
+ const docsLayout = resolveDocsLayout(theme.layout);
```

- [ ] **Step 2: Add query invalidation on publish & rollback in SDK**

In `packages/sdk/src/react/hooks/deployments.ts`:
In `usePublish`, `usePublishAnyway`, and `useRollback`, add:
```ts
qc.invalidateQueries({ queryKey: ['site', projectId] });
qc.invalidateQueries({ queryKey: ['site-page', projectId] });
```
In `apps/studio/src/features/publishing/components/DeployPipeline.tsx`:
In lines 77 and 108, also invalidate `['site', project.id]` and `['site-page', project.id]`.

- [ ] **Step 3: Fix route loader freshness in `/sites/$projectId`**

In `apps/studio/src/routes/sites/$projectId/route.tsx` and `apps/studio/src/routes/sites/$projectId/$.tsx`:
Replace `staleTime: 'static'` with `staleTime: 5_000` (or remove `staleTime`).
In `route.tsx`, check `projectKnownVersions.get(params.projectId)` when determining `candidate` so non-version initial paths don't pollute query keys with false version params.

- [ ] **Step 4: Update `styles.css` for all layout IDs**

In `apps/studio/src/styles.css`:
Update lines 706-714 to include `#fd-glass-layout`, `[data-documentation-layout="glass"]`, and `[data-documentation-layout="flux"]`:
```css
  #nd-docs-layout,
  #nd-notebook-layout,
  #nd-spacious-layout,
  #fd-glass-layout,
  [data-documentation-layout="docs"],
  [data-documentation-layout="notebook"],
  [data-documentation-layout="spacious"],
  [data-documentation-layout="glass"],
  [data-documentation-layout="flux"] {
    max-width: none;
    width: 100%;
  }
```

- [ ] **Step 5: Run typecheck**

Run: `bun run typecheck` in `apps/studio`
Expected: PASS with 0 errors

- [ ] **Step 6: Commit**

```bash
git add packages/site/src/components/documentation-theme-provider.tsx packages/sdk/src/react/hooks/deployments.ts apps/studio/src/features/publishing/components/DeployPipeline.tsx apps/studio/src/routes/sites/$projectId/route.tsx apps/studio/src/routes/sites/$projectId/$.tsx apps/studio/src/styles.css
git commit -m "fix(site): resolve docsLayout properly, invalidate published cache on deploy, and update layout styles"
```

---

### Task 7: Full Verification and Browser Check

**Files:**
- Verify all modified files

- [ ] **Step 1: Run typechecks across workspace**

Run: `bun run typecheck` in `apps/studio`
Expected: PASS with 0 errors

- [ ] **Step 2: Browser Verification**

Using browser tools:
1. Verify `/app/projects/$projectId/editor`:
   - Topbar displays "Live Site" button linking to `/sites/$projectId` with `target="_blank"`.
   - Click "Site configuration" at bottom of sidebar:
     - Sidebar header displays "Back to editor" button.
     - Canvas subheader displays "Back to editor" button.
     - Click "Back to editor": returns to pages tree and editor canvas.
2. Verify `/app/projects/$projectId` (Overview):
   - Topbar displays "Live Site" button.
   - Header does NOT display redundant "View Site" button.
   - "Live Site" status card is present.
3. Verify `/app/projects/$projectId/deployments`:
   - Topbar displays "Live Site" button.
   - Header does NOT display redundant "View Live Site" button.
4. Verify `/sites/$projectId`:
   - Inspect DOM: `.cms-site-chrome` has correct `data-documentation-layout` and renders active layout shell.
