# Overview, Analytics & UI Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Project Overview and Analytics into high-density operational cockpits with content health and author activity, fix the topbar divider and publish split button heights, and align Project Preview 1:1 with the published site layout and palette.

**Architecture:** 
1. Refactor `PublishControl` so both the main button and dropdown chevron trigger use the shared design system `<Button size="sm">` primitive for pixel-perfect matching heights.
2. Upgrade `EditorPage`'s vertical separator from `h-4` to `h-7` to span the full visual height of sibling pill buttons.
3. Overhaul `ProjectPreviewPage` to generate `buildNavTree` and render `@cms/site`'s `SiteNav` and inject full `projectThemeCss` so the preview sidebar, colors, and layout match `/sites/$projectId` 1:1.
4. Upgrade `ProjectOverviewPage` with a 5-card operational metric strip, translation coverage progress bar, broken link/draft triage, and recent document changes table.
5. Upgrade `ProjectAnalyticsPage` with search latency, zero-result rate telemetry, and enriched high-density traffic distribution panels.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Base UI, TanStack Router & Query, Lucide React, Vitest.

## Global Constraints
- Platform Purpose: Internal Company Deployment (No plan, pricing, billing, or marketing pages).
- Preserves all existing translation and project data models without schema breakage.
- All code must pass `pnpm tsc --noEmit` and `pnpm biome check --write` without errors.

---

### Task 1: Topbar Divider & Publish Split Button Height Alignment

**Files:**
- Modify: `apps/studio/src/features/editor/EditorPage.tsx:700-715`
- Modify: `apps/studio/src/features/publishing/components/PublishControl.tsx:30-65`
- Create: `apps/studio/src/features/publishing/components/PublishControl.test.tsx`

**Interfaces:**
- Produces: `PublishControl` with uniform `size="sm"` split-button triggers.
- Topbar divider in `EditorPage.tsx` using `className="hidden h-7 sm:block self-center mx-0.5"`.

- [ ] **Step 1: Write failing test for PublishControl height & render consistency**

Create `apps/studio/src/features/publishing/components/PublishControl.test.tsx`:
```tsx
/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '@cms/sdk';
import { PublishControl } from './PublishControl';

vi.mock('@cms/i18n/react', () => ({
  useT: () => (key: string) => key,
}));

vi.mock('@cms/sdk/react', () => ({
  useDeployments: () => ({ data: [] }),
}));

vi.mock('./PublishModal', () => ({
  PublishModal: () => null,
}));

vi.mock('./DeployPipeline', () => ({
  DeployPipeline: () => null,
}));

describe('PublishControl', () => {
  const dummyProject: Project = {
    id: 'proj-123',
    name: 'Test Project',
    slug: 'test-project',
    description: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: null,
  };

  it('renders both the publish button and dropdown trigger using the Button primitive', () => {
    render(<PublishControl project={dummyProject} />);
    const publishBtn = screen.getByRole('button', { name: /project\.publish/i });
    const triggerBtn = screen.getByRole('button', { name: /publish options/i });

    expect(publishBtn).toBeInTheDocument();
    expect(triggerBtn).toBeInTheDocument();
    // Both should contain the data-slot="button" attribute from Base UI Button
    expect(publishBtn).toHaveAttribute('data-slot', 'button');
    expect(triggerBtn).toHaveAttribute('data-slot', 'button');
    expect(triggerBtn.className).toContain('h-7');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cms/studio test PublishControl.test.tsx`
Expected: FAIL because `<DropdownMenuTrigger>` currently renders a raw `<button>` without `data-slot="button"`.

- [ ] **Step 3: Update PublishControl and EditorPage**

Modify `apps/studio/src/features/publishing/components/PublishControl.tsx`:
Wrap `<DropdownMenuTrigger>` with `<Button>` primitive using Base UI's `render` prop:
```tsx
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="sm"
                variant="outline"
                className="h-7 rounded-s-none border-s-0 px-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label="Publish options"
              >
                <ChevronDown className="size-3 opacity-70" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-52">
```

Modify `apps/studio/src/features/editor/EditorPage.tsx`:
Update the vertical separator from `className="hidden h-4 sm:block"` to:
```tsx
<Separator orientation="vertical" className="hidden h-7 sm:block self-center mx-0.5" />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cms/studio test PublishControl.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add apps/studio/src/features/publishing/components/PublishControl.tsx apps/studio/src/features/publishing/components/PublishControl.test.tsx apps/studio/src/features/editor/EditorPage.tsx
git commit -m "fix(ui): align topbar divider and publish split button heights"
```

---

### Task 2: Project Preview Sidebar & Theme Palette 1:1 Alignment

**Files:**
- Modify: `apps/studio/src/features/projects/ProjectPreviewPage.tsx`
- Create: `apps/studio/src/features/projects/ProjectPreviewPage.test.tsx`

**Interfaces:**
- Consumes: `buildNavTree` from `@cms/shared`, `SiteNav`, `projectThemeCss`, `projectThemeStyle`, `projectThemeVariables`, `resolveProjectTheme`, `DocumentationThemeProvider` from `@cms/site`.
- Produces: `ProjectPreviewPage` rendering real `SiteNav` sidebar hierarchy and complete theme CSS stylesheet.

- [ ] **Step 1: Write failing test for ProjectPreviewPage**

Create `apps/studio/src/features/projects/ProjectPreviewPage.test.tsx`:
```tsx
/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectPreviewPage } from './ProjectPreviewPage';

vi.mock('@cms/i18n/react', () => ({
  useT: () => (key: string) => key,
}));

vi.mock('@cms/sdk/react', () => ({
  useProject: () => ({
    data: {
      id: 'proj-1',
      name: 'Preview Site',
      slug: 'preview-site',
      config: { styling: { primaryColor: '#3b82f6' } },
    },
  }),
  useLanguages: () => ({
    data: [{ id: 'lang-en', code: 'en', label: 'English', isDefault: true, direction: 'LTR' }],
  }),
  useBranches: () => ({
    data: [{ id: 'br-main', name: 'main', isDefault: true }],
  }),
  usePages: () => ({
    data: [
      { id: 'p1', title: 'Getting Started', path: 'getting-started', kind: 'PAGE', hidden: false, position: 0, parentId: null },
      { id: 'g1', title: 'Guides', path: 'guides', kind: 'GROUP', hidden: false, position: 1, parentId: null },
      { id: 'p2', title: 'Advanced', path: 'guides/advanced', kind: 'PAGE', hidden: false, position: 0, parentId: 'g1' },
    ],
    isPending: false,
  }),
  usePage: () => ({
    data: { id: 'p1', title: 'Getting Started', content: '# Hello Preview', path: 'getting-started' },
    isPending: false,
  }),
}));

describe('ProjectPreviewPage', () => {
  it('renders SiteNav and injects theme CSS into DocumentationThemeProvider', () => {
    const { container } = render(
      <ProjectPreviewPage
        projectId="proj-1"
        search={{}}
        onUpdateSearch={vi.fn()}
      />,
    );

    // SiteNav renders nav element with docs aria-label
    expect(screen.getByRole('navigation', { name: /docs/i })).toBeInTheDocument();
    // Theme CSS style tag should be injected inside the provider
    const styleEl = container.querySelector('style');
    expect(styleEl).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cms/studio test ProjectPreviewPage.test.tsx`
Expected: FAIL because `SiteNav` is not yet rendered and style tag is missing.

- [ ] **Step 3: Update ProjectPreviewPage implementation**

Modify `apps/studio/src/features/projects/ProjectPreviewPage.tsx`:
1. Import `buildNavTree` from `@cms/shared` and `SiteNav`, `projectThemeCss`, `projectThemeStyle`, `projectThemeVariables`, `resolveProjectTheme` from `@cms/site`.
2. Construct `navTree = useMemo(() => buildNavTree(pages ?? [], activeLanguage?.code), [pages, activeLanguage?.code]);`.
3. Pass `css={projectThemeCss(theme, previewMode)}` to `DocumentationThemeProvider`.
4. Render `SiteNav` in the sidebar slot with `nodes={navTree}`, `projectId={projectId}`, `currentPath={selected?.path ?? ''}`, `lang={activeLanguage?.code}`, and `version={activeBranchId}`.
5. Keep the scope selects (branch and language switchers) compact and polished in the sidebar header.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cms/studio test ProjectPreviewPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add apps/studio/src/features/projects/ProjectPreviewPage.tsx apps/studio/src/features/projects/ProjectPreviewPage.test.tsx
git commit -m "feat(preview): align preview sidebar and theme palette with published site"
```

---

### Task 3: High-Density Operational Project Overview Page

**Files:**
- Modify: `apps/studio/src/features/projects/ProjectOverviewPage.tsx`
- Create: `apps/studio/src/features/projects/ProjectOverviewPage.test.tsx`

**Interfaces:**
- Consumes: `useProject`, `usePages`, `useLanguages`, `useDeployments`, `useDomains`, `useProjectAnalytics`, `useProjectMembers` from `@cms/sdk/react`.
- Produces: High-density operational dashboard featuring:
  - 5 KPI metric cards: Total Pages, Translation Coverage %, Content Health / Broken Links, Deploys & Members, 30d Pageviews.
  - Translation Completeness progress per active language.
  - Content issue triage card with direct link to editor.
  - Operational two-column hub: Left = Recent Document Updates table; Right = Live site status and deployment timeline.

- [ ] **Step 1: Write failing test for ProjectOverviewPage**

Create `apps/studio/src/features/projects/ProjectOverviewPage.test.tsx`:
```tsx
/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectOverviewPage } from './ProjectOverviewPage';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: any) => <a href="#" {...props}>{children}</a>,
  useNavigate: () => vi.fn(),
}));

vi.mock('@cms/i18n/react', () => ({
  useT: () => (key: string, params?: any) => {
    if (params?.version) return `${key} ${params.version}`;
    return key;
  },
}));

vi.mock('@cms/sdk/react', () => ({
  useProject: () => ({ data: { id: 'p1', name: 'Test Docs', slug: 'test-docs' } }),
  usePages: () => ({
    data: [
      { id: '1', title: 'Page 1', path: 'p1', kind: 'PAGE', languageCode: 'en', updatedAt: new Date().toISOString() },
      { id: '2', title: 'Page 2', path: 'p2', kind: 'PAGE', languageCode: 'en', updatedAt: new Date().toISOString() },
      { id: '3', title: 'Page 1 ES', path: 'p1', kind: 'PAGE', languageCode: 'es', updatedAt: new Date().toISOString() },
    ],
  }),
  useLanguages: () => ({
    data: [
      { id: 'l1', code: 'en', label: 'English', isDefault: true },
      { id: 'l2', code: 'es', label: 'Spanish', isDefault: false },
    ],
  }),
  useProjectMembers: () => ({ data: { members: [{ id: 'm1' }] } }),
  useDeployments: () => ({
    data: [{ id: 'd1', version: 3, status: 'READY', createdAt: new Date().toISOString() }],
  }),
  useDomains: () => ({ data: [] }),
  useProjectAnalytics: () => ({ data: { totalViews: 120, timeseries: [] }, isPending: false }),
  usePublishAnyway: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe('ProjectOverviewPage', () => {
  it('renders high-density operational metrics, translation progress, and recent changes', () => {
    render(<ProjectOverviewPage projectId="p1" />);

    // Verify presence of Translation coverage metric
    expect(screen.getByText(/translation/i)).toBeInTheDocument();
    // Verify presence of content health card
    expect(screen.getByText(/content health/i)).toBeInTheDocument();
    // Verify presence of recent updates
    expect(screen.getByText(/Page 1/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cms/studio test ProjectOverviewPage.test.tsx`
Expected: FAIL because translation progress and content health cards are not yet in `ProjectOverviewPage`.

- [ ] **Step 3: Implement High-Density ProjectOverviewPage**

Modify `apps/studio/src/features/projects/ProjectOverviewPage.tsx`:
1. Use `useLanguages(projectId)` alongside existing hooks.
2. Calculate:
   - Default language pages count vs localized pages count per active language.
   - Translation coverage percentage: `Math.round((localizedPages / (totalDefaultPages * secondaryLanguagesCount)) * 100)`.
   - Broken link / content issues count from `publishIssuesOf(latestDeployment)` or broken internal links detection.
3. Replace top layout with:
   - 5 KPI metric cards in a grid: Pages, Translation %, Content Health, Deployments, 30d Pageviews.
   - Translation Completeness progress bar card showing coverage breakdown per locale.
   - Content Health indicator showing 0 issues (green check) or warning banner if broken links exist.
   - Operational two-column split: Left = Rich Recent Document Updates list with page icon, title, path, and direct editor link; Right = Live site card (domain, copy button) + Latest deployment card with direct "Publish" action.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cms/studio test ProjectOverviewPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add apps/studio/src/features/projects/ProjectOverviewPage.tsx apps/studio/src/features/projects/ProjectOverviewPage.test.tsx
git commit -m "feat(overview): build high-density operational dashboard with content health and translation progress"
```

---

### Task 4: High-Density Project Analytics Page

**Files:**
- Modify: `apps/studio/src/features/analytics/ProjectAnalyticsPage.tsx`
- Create: `apps/studio/src/features/analytics/ProjectAnalyticsPage.test.tsx`

**Interfaces:**
- Consumes: `useProjectAnalytics` from `@cms/sdk/react`, `useAnalyticsFilters` from `./context/AnalyticsProvider`.
- Produces: Enhanced high-density analytics dashboard with search latency, zero-result rate %, traffic bar charts, and AI telemetry.

- [ ] **Step 1: Write failing test for ProjectAnalyticsPage**

Create `apps/studio/src/features/analytics/ProjectAnalyticsPage.test.tsx`:
```tsx
/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectAnalyticsPage } from './ProjectAnalyticsPage';

vi.mock('@cms/i18n/react', () => ({
  useT: () => (key: string) => key,
}));

vi.mock('@cms/sdk/react', () => ({
  useProjectAnalytics: () => ({
    data: {
      availability: 'available',
      totalViews: 450,
      uniqueVisitors: 210,
      timeseries: [{ date: '2026-10-20', views: 40 }],
      topPages: [{ path: 'intro', views: 180 }],
      topSearches: [{ query: 'auth', count: 12 }],
      languages: [{ language: 'en', views: 300 }],
      noAnswerReasons: [],
      searches: {
        total: 50,
        zeroResults: 5,
        queryTerms: 'legacy',
        clickedResults: 40,
        averageLatencyMs: 38,
      },
      ai: {
        answersCompleted: 15,
        answersFailed: 1,
        costMicros: 2000,
      },
    },
    isPending: false,
    isError: false,
  }),
}));

describe('ProjectAnalyticsPage', () => {
  it('renders search average latency and zero-result search rate in KPI strip', () => {
    render(<ProjectAnalyticsPage projectId="p1" />);

    expect(screen.getByText(/averageLatencyMs|latency/i)).toBeInTheDocument();
    expect(screen.getByText(/38ms|38/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cms/studio test ProjectAnalyticsPage.test.tsx`
Expected: FAIL because average search latency KPI is not in the top metric strip.

- [ ] **Step 3: Implement High-Density ProjectAnalyticsPage**

Modify `apps/studio/src/features/analytics/ProjectAnalyticsPage.tsx`:
1. Expand the top KPI cards into a 5-card grid:
   - Pageviews
   - Unique Visitors
   - Search Queries
   - Zero-Result Rate % (calculated as `searches.total ? Math.round((searches.zeroResults / searches.total) * 100) : 0`)
   - Average Search Latency (formatted as `${data?.searches.averageLatencyMs ?? 0}ms`)
2. Upgrade `ListCard` presentations with relative percentage progress bars for `topPages` and `languages`.
3. Add search conversion insights (clicked results vs total searches).
4. Add sleek empty states with helpful microcopy when metrics are zero.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cms/studio test ProjectAnalyticsPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add apps/studio/src/features/analytics/ProjectAnalyticsPage.tsx apps/studio/src/features/analytics/ProjectAnalyticsPage.test.tsx
git commit -m "feat(analytics): add search latency, conversion rate, and high-density traffic distribution"
```

---

### Task 5: End-to-End Verification & Lint Cleanliness

**Files:**
- None (verification across all modified files)

- [ ] **Step 1: Run Vitest across studio tests**

Run: `pnpm --filter @cms/studio test`
Expected: All tests pass.

- [ ] **Step 2: Run TypeScript Typecheck**

Run: `pnpm --filter @cms/studio typecheck`
Expected: 0 type errors.

- [ ] **Step 3: Run Biome linter & formatter**

Run: `pnpm biome check --write`
Expected: Clean linting and format.

- [ ] **Step 4: Commit any formatting or lint fixes**

```bash
git commit -am "chore: format and lint verification"
```
