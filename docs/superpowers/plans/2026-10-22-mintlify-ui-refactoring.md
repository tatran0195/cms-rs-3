# Mintlify-Style UI Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the CMS Studio UI to match Mintlify's 3-column layout: a persistent left activity rail, a clean navigation sidebar with pinned footer pills, and a distraction-free document editor with a consolidated top bar.

**Architecture:** 
1. Build a persistent `ActivityRail` component (~48px) in `@/features/workspace` providing one-click access to Home, Search, Deployments, Analytics, and Settings.
2. Update `EditorSidebarPanel` to feature a clean "Navigation" header and pinned footer pills (`Site configuration` and `+ New page`).
3. Consolidate `EditorPage`'s dual toolbars into a single top action bar (sidebar toggle, quick command pill, save status, compact mode switcher, preview, and Mintlify-style `Publish ▾` button) while eliminating the secondary canvas toolbar.
4. Update `ProjectLayout` to render `ActivityRail` continuously across `/editor` and project routes.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, TanStack Router, Lucide React, Vitest, React Testing Library.

## Global Constraints
- Internal company platform scope: DO NOT re-introduce any Plan, Billing, or Pricing features.
- No marketing or public landing routes.
- Preserve existing navigation primitives (Navbar Tabs as root sections, Anchors, Links, Groups, Pages).
- All changes must pass `biome check --write` and `tsc --noEmit` without errors or lint regressions.

---

### Task 1: Build the `ActivityRail` Component and Tests

**Files:**
- Create: `apps/studio/src/features/workspace/components/ActivityRail.tsx`
- Create: `apps/studio/src/features/workspace/components/ActivityRail.test.tsx`
- Modify: `apps/studio/src/features/workspace/components/index.ts` (export `ActivityRail`)

**Interfaces:**
- Produces:
  ```tsx
  export interface ActivityRailProps {
    projectId: string;
    onOpenSearch?: () => void;
    onOpenDeploy?: () => void;
  }
  export function ActivityRail(props: ActivityRailProps): JSX.Element;
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/studio/src/features/workspace/components/ActivityRail.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActivityRail } from './ActivityRail';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: any) => (
    <a href={typeof to === 'string' ? to : '#'} {...props}>
      {children}
    </a>
  ),
  useRouterState: () => ({ location: { pathname: '/app/projects/test-project/editor' } }),
}));

vi.mock('@cms/i18n/react', () => ({
  useLocale: () => ({ t: (k: string) => k }),
  useT: () => (k: string) => k,
}));

vi.mock('./NotificationsPopover', () => ({
  NotificationsPopover: () => <button aria-label="notifications">Notifications</button>,
}));

vi.mock('./SidebarAccountFooter', () => ({
  SidebarAccountFooter: () => <div>AccountFooter</div>,
}));

describe('ActivityRail', () => {
  it('renders navigation links and triggers search and deploy actions', () => {
    const onOpenSearch = vi.fn();
    const onOpenDeploy = vi.fn();

    render(
      <ActivityRail
        projectId="test-project"
        onOpenSearch={onOpenSearch}
        onOpenDeploy={onOpenDeploy}
      />,
    );

    expect(screen.getByRole('link', { name: /project\.overview|overview/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /project\.analytics|analytics/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /project\.settings|settings/i })).toBeInTheDocument();

    const searchBtn = screen.getByRole('button', { name: /search/i });
    fireEvent.click(searchBtn);
    expect(onOpenSearch).toHaveBeenCalledTimes(1);

    const deployBtn = screen.getByRole('button', { name: /deployments|publish/i });
    fireEvent.click(deployBtn);
    expect(onOpenDeploy).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```powershell
pnpm --filter @cms/studio test apps/studio/src/features/workspace/components/ActivityRail.test.tsx
```
Expected: FAIL (Cannot find module `./ActivityRail`).

- [ ] **Step 3: Implement `ActivityRail.tsx`**

Create `apps/studio/src/features/workspace/components/ActivityRail.tsx`:
```tsx
import { Button } from '@cms/design-system/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@cms/design-system/components/ui/tooltip';
import { cn } from '@cms/design-system/lib/utils';
import { useLocale } from '@cms/i18n/react';
import { Link, useRouterState } from '@tanstack/react-router';
import { BarChart3, LayoutDashboard, Rocket, Search, Settings } from 'lucide-react';
import { NotificationsPopover } from './NotificationsPopover';
import { SidebarAccountFooter } from './SidebarAccountFooter';

export interface ActivityRailProps {
  projectId: string;
  onOpenSearch?: () => void;
  onOpenDeploy?: () => void;
}

export function ActivityRail({ projectId, onOpenSearch, onOpenDeploy }: ActivityRailProps) {
  const { t } = useLocale();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isHome = pathname === `/app/projects/${projectId}`;
  const isAnalytics = pathname.startsWith(`/app/projects/${projectId}/analytics`);
  const isSettings = pathname.startsWith(`/app/projects/${projectId}/settings`);

  return (
    <aside
      className="flex h-screen w-12 shrink-0 flex-col items-center justify-between border-border border-e bg-sidebar/95 py-3 select-none"
      aria-label="Activity Rail"
    >
      {/* Top: Brand Logo */}
      <div className="flex flex-col items-center gap-4">
        <Link
          to="/app"
          className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400"
          title={t('nav.overview')}
        >
          <svg className="size-4.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.4z" />
          </svg>
        </Link>

        {/* Navigation Items */}
        <nav className="flex flex-col items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger render={<span />}>
              <Link
                to="/app/projects/$projectId"
                params={{ projectId }}
                aria-label={t('project.overview')}
                className={cn(
                  'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                  isHome && 'bg-muted text-foreground font-medium',
                )}
              >
                <LayoutDashboard className="size-4" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">{t('project.overview')}</TooltipContent>
          </Tooltip>

          {onOpenSearch ? (
            <Tooltip>
              <TooltipTrigger render={<span />}>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={onOpenSearch}
                  aria-label={t('dashboard.search.placeholder')}
                  className="size-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Search className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{t('dashboard.search.placeholder')}</TooltipContent>
            </Tooltip>
          ) : null}

          {onOpenDeploy ? (
            <Tooltip>
              <TooltipTrigger render={<span />}>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={onOpenDeploy}
                  aria-label={t('project.deployments')}
                  className="size-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Rocket className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{t('project.deployments')}</TooltipContent>
            </Tooltip>
          ) : null}

          <Tooltip>
            <TooltipTrigger render={<span />}>
              <Link
                to="/app/projects/$projectId/analytics"
                params={{ projectId }}
                aria-label={t('project.analytics')}
                className={cn(
                  'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                  isAnalytics && 'bg-muted text-foreground font-medium',
                )}
              >
                <BarChart3 className="size-4" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">{t('project.analytics')}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger render={<span />}>
              <Link
                to="/app/projects/$projectId/settings"
                params={{ projectId }}
                aria-label={t('project.settings')}
                className={cn(
                  'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                  isSettings && 'bg-muted text-foreground font-medium',
                )}
              >
                <Settings className="size-4" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">{t('project.settings')}</TooltipContent>
          </Tooltip>
        </nav>
      </div>

      {/* Bottom: Notifications & Account */}
      <div className="flex flex-col items-center gap-2">
        <NotificationsPopover />
        <SidebarAccountFooter />
      </div>
    </aside>
  );
}
```

Export `ActivityRail` in `apps/studio/src/features/workspace/components/index.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run:
```powershell
pnpm --filter @cms/studio test apps/studio/src/features/workspace/components/ActivityRail.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/studio/src/features/workspace/components/ActivityRail.tsx apps/studio/src/features/workspace/components/ActivityRail.test.tsx apps/studio/src/features/workspace/components/index.ts; git commit -m "feat(studio): add ActivityRail component and tests"
```

---

### Task 2: Refactor `EditorSidebarPanel` with Clean Header & Pinned Action Pills

**Files:**
- Modify: `apps/studio/src/features/editor/components/editor-sidebar-panel.tsx`
- Modify: `apps/studio/src/features/editor/components/editor-sidebar-panel.test.tsx`

**Interfaces:**
- Produces:
  - Header with `Navigation` title and collapse button.
  - Tree body with tabs, groups, and pages.
  - Pinned footer with `Site configuration` button and full-width `+ New page` primary action button.

- [ ] **Step 1: Write the failing test**

Update `editor-sidebar-panel.test.tsx` to assert the presence of `Site configuration` and `New page` pinned footer buttons:
```tsx
it('renders pinned footer actions for site configuration and new page', () => {
  render(
    <EditorSidebarPanel
      projectId="test-proj"
      selectedId={null}
      languages={[{ id: 'en', code: 'en', name: 'English', isDefault: true, position: 0 }]}
      languagesPending={false}
      activeLanguageId="en"
      onSelectLanguage={vi.fn()}
      onSelectPage={vi.fn()}
      onAddPage={vi.fn()}
      onInsertPage={vi.fn()}
      onAddGroup={vi.fn()}
      onOpenPageSettings={vi.fn()}
      onAddLanguage={vi.fn()}
      onLanguageSettings={vi.fn()}
      onManageNavbar={vi.fn()}
      onOpenSiteConfig={vi.fn()}
    />,
  );

  expect(screen.getByRole('button', { name: /site configuration/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /new page/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```powershell
pnpm --filter @cms/studio test apps/studio/src/features/editor/components/editor-sidebar-panel.test.tsx
```
Expected: FAIL (`onOpenSiteConfig` or footer buttons not found).

- [ ] **Step 3: Update `EditorSidebarPanel`**

In `apps/studio/src/features/editor/components/editor-sidebar-panel.tsx`:
1. Add `onOpenSiteConfig?: () => void` to `EditorSidebarPanelProps`.
2. Add pinned footer container at the bottom:
```tsx
<div className="mt-auto shrink-0 border-border border-t p-2.5 flex flex-col gap-1.5 bg-sidebar/50">
  <Button
    variant="outline"
    size="sm"
    className="w-full justify-start gap-2 text-xs font-normal"
    onClick={onOpenSiteConfig}
  >
    <SlidersHorizontal className="size-3.5" />
    <span>{t('editor.siteConfiguration')}</span>
  </Button>
  <DropdownMenu open={createMenuOpen} onOpenChange={setCreateMenuOpen}>
    <DropdownMenuTrigger render={<span />}>
      <Button size="sm" className="w-full justify-center gap-1.5 text-xs font-medium">
        <Plus className="size-3.5" />
        <span>{t('editor.newPage')}</span>
      </Button>
    </DropdownMenuTrigger>
    {/* Render existing unified creation menu */}
  </DropdownMenu>
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```powershell
pnpm --filter @cms/studio test apps/studio/src/features/editor/components/editor-sidebar-panel.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/studio/src/features/editor/components/editor-sidebar-panel.tsx apps/studio/src/features/editor/components/editor-sidebar-panel.test.tsx; git commit -m "feat(editor): add pinned footer with site configuration and new page pills"
```

---

### Task 3: Streamline `EditorPage` Top Bar & Remove Secondary Toolbar

**Files:**
- Modify: `apps/studio/src/features/editor/EditorPage.tsx`
- Modify: `apps/studio/src/features/editor/EditorPage.test.tsx` (if applicable)

**Changes:**
1. Remove the secondary canvas toolbar row (`div className="flex min-h-12 ..."`).
2. Move the segmented mode control (`Visual | Rich text | Markdown`) into the main top action bar.
3. Add search command shortcut pill `[ 🔍 Search or jump to... Ctrl+K ]` to the top bar.
4. Style the `Publish` button matching Mintlify (`Publish ▾` with changes count badge).

- [ ] **Step 1: Write test verifying top bar elements and lack of secondary bar**

Test in `EditorPage.test.tsx` that the editor renders the mode control in the header and does not render the secondary toolbar row.

- [ ] **Step 2: Run test to verify current state**

Run:
```powershell
pnpm --filter @cms/studio test apps/studio/src/features/editor/
```

- [ ] **Step 3: Update `EditorPage.tsx`**

1. Integrate the `CommandPalette` trigger in the top bar:
```tsx
<button
  type="button"
  onClick={() => setPaletteOpen(true)}
  className="hidden sm:flex h-8 items-center gap-2 rounded-lg border border-input bg-transparent px-3 text-muted-foreground text-xs shadow-xs outline-none transition-colors hover:bg-muted/50"
>
  <Search className="size-3.5" />
  <span>{t('dashboard.search.placeholder')}</span>
  <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl+K</kbd>
</button>
```
2. Move `SegmentedControl` (`Visual | Rich text | Markdown`) directly into the header's right action zone next to `SaveStatusIndicator`.
3. In `PublishControl`, render Mintlify-style bordered button (`Publish ▾`).
4. Remove the secondary toolbar `<div className="flex min-h-12 flex-wrap items-center gap-1 border-border border-b px-2 py-1.5 ...">`.

- [ ] **Step 4: Run test to verify it passes**

Run:
```powershell
pnpm --filter @cms/studio test apps/studio/src/features/editor/
```
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/studio/src/features/editor/EditorPage.tsx; git commit -m "refactor(editor): consolidate top action bar and remove secondary toolbar"
```

---

### Task 4: Integrate `ActivityRail` into `ProjectLayout` & Route Shell

**Files:**
- Modify: `apps/studio/src/features/projects/components/ProjectLayout.tsx`
- Modify: `apps/studio/src/features/projects/components/ProjectLayout.test.tsx`

**Changes:**
1. Wrap the project layout with `ActivityRail`.
2. Connect `onOpenSearch` to trigger the global `CommandPalette`.
3. Connect `onOpenDeploy` to open the `DeployPipeline` modal in-place.
4. Keep the activity rail stable across `/editor` and other project sub-routes.

- [ ] **Step 1: Write test verifying `ActivityRail` presence in `ProjectLayout`**

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Update `ProjectLayout.tsx`**

Update `ProjectLayout.tsx` to render:
```tsx
<div className="flex h-screen overflow-hidden">
  <ActivityRail
    projectId={projectId}
    onOpenSearch={() => setPaletteOpen(true)}
    onOpenDeploy={() => setDeployOpen(true)}
  />
  <div className="flex-1 flex overflow-hidden">
    {children}
  </div>
  <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
  {deployOpen && project ? <DeployPipelineDialog project={project} open={deployOpen} onOpenChange={setDeployOpen} /> : null}
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```powershell
pnpm --filter @cms/studio test apps/studio/src/features/projects/components/ProjectLayout.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/studio/src/features/projects/components/ProjectLayout.tsx; git commit -m "feat(projects): integrate ActivityRail into ProjectLayout"
```

---

### Task 5: End-to-End Verification & Lint/Typecheck Validation

**Files:**
- All modified files

- [ ] **Step 1: Run Biome linter and formatter**

Run:
```powershell
pnpm biome check apps/studio/src
```
Expected: PASS (0 errors).

- [ ] **Step 2: Run TypeScript typecheck**

Run:
```powershell
pnpm --filter @cms/studio exec tsc --noEmit
```
Expected: PASS (0 errors).

- [ ] **Step 3: Run full test suite for studio**

Run:
```powershell
pnpm --filter @cms/studio test
```
Expected: All tests PASS.

- [ ] **Step 4: Browser verification using `browser_subagent`**

Capture screenshot of the refactored editor in browser (`http://localhost:4310/app/projects/34c59d77-9474-439f-918e-40193594770d/editor`) to verify visual alignment with Mintlify.

- [ ] **Step 5: Commit any final polish**

```powershell
git commit -m "chore: final verification for Mintlify UI refactoring"
```
