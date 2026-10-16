# Restore Sites Reader UI & Advanced Settings Exports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the canonical Sites Reader UI layout (centered wide search pill, right-aligned Version/Language/Theme switchers, single sticky sidebar, custom navAnchors, `<main className="min-w-0">`) while preserving the new multi-level `SiteNavTabs` cascading menus, and restore the missing "Exports" section under Advanced Settings in Studio with `@cms/sdk` React hooks.

**Architecture:** In `@cms/site`, refactor `SiteLayout.tsx` to restore the Mintlify-style header architecture (brand on left, centered search pill in the middle, nav links on right-center, and switchers/actions on far right) and eliminate the nested `<aside>` regression in the sidebar slot while keeping the second-row `SiteNavTabs`. In `@cms/sdk`, implement React hooks for exports queries/mutations. In `apps/studio`, port `ExportsSection` and restore `'exports'` under the `'advanced'` group in `ProjectSettingsPage.tsx`.

**Tech Stack:** React 19, TypeScript, `@tanstack/react-query`, `@tanstack/react-router`, `@cms/site`, `@cms/sdk`, `@cms/design-system`, Tailwind CSS v4, Lucide React, Vitest.

## Global Constraints

- **No Plan, Billing, or Pricing Features**: Do not introduce billing, payment tiers, or subscription limits.
- **No Marketing / Landing Pages**: Platform is internal-company documentation.
- **Preserve New Nested Tabs**: Retain the new `SiteNavTabs` cascading flyout menu navigation underneath the header.
- **Strict Lint & Typecheck**: Code must pass `bun run typecheck` and `vitest run` across affected packages.

---

### Task 1: Restore Header Layout & Fix Sidebar Structure in `@cms/site`

**Files:**
- Modify: `packages/site/src/views/SiteLayout.tsx`
- Test: `packages/site/src/views/SiteLayout.test.tsx`

**Interfaces:**
- Consumes:
  - `SiteLayoutProps` from `packages/site/src/views/SiteLayout.tsx`
  - `SiteNavTabs` from `packages/site/src/components/site-nav-tabs.tsx`
  - `VersionSwitcher` from `packages/site/src/components/version-switcher.tsx`
  - `LanguageSwitcher` from `packages/site/src/components/language-switcher.tsx`
  - `SiteNav` from `packages/site/src/components/site-nav.tsx`
  - `hasIcon`, `PageIcon` from `packages/site/src/components/page-icon.tsx`
- Produces:
  - Cleaned `SiteLayout` rendering centered search pill, right-aligned switchers/theme/CTA, `SiteNavTabs` sub-row, single sidebar with `navAnchors`, and `<main className="min-w-0">`.

- [ ] **Step 1: Write unit test in `packages/site/src/views/SiteLayout.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SiteLayout } from './SiteLayout';
import type { SiteShell } from '../types';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useRouterState: () => '/sites/proj1',
  Outlet: () => <div data-testid="outlet">Content</div>,
}));

vi.mock('../context/site-analytics-provider', () => ({
  SiteAnalyticsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('SiteLayout header & sidebar structure', () => {
  const mockSite: SiteShell = {
    project: {
      id: 'proj1',
      name: 'Acme Docs',
      slug: 'acme-docs',
      description: 'Acme documentation',
      config: {
        navbar: {
          showSearch: true,
          anchors: [{ label: 'API Reference', href: '/api', icon: 'book' }],
        },
      },
      primaryDomain: null,
    },
    nav: [
      { id: 'p1', title: 'Getting Started', slug: 'getting-started', kind: 'PAGE' },
    ],
    languages: [
      { code: 'en', label: 'English', direction: 'LTR', isDefault: true, enabled: true },
      { code: 'fr', label: 'Français', direction: 'LTR', isDefault: false, enabled: true },
    ],
    versions: [
      { id: 'v1', name: 'v1.0', slug: 'v1.0', isDefault: true, version: 1 },
      { id: 'v2', name: 'v2.0', slug: 'v2.0', isDefault: false, version: 2 },
    ],
    activeLanguage: 'en',
    activeVersion: 'v1.0',
    languageConfig: null,
    version: 1,
    generatedAt: new Date().toISOString(),
    openapi: null,
  };

  it('renders centered search pill and places version/language switchers in the right toolbar', () => {
    const { container } = render(<SiteLayout site={mockSite} projectId="proj1" />);
    
    // Check that centered search container exists
    const searchContainer = container.querySelector('.justify-center');
    expect(searchContainer).not.toBeNull();

    // Check that nested aside does NOT exist in navigation slot
    const asideElements = container.querySelectorAll('aside');
    // HarborTemplate provides exactly 1 sidebar aside (and 1 for toc on wide screens if applicable)
    // No aside should have an aside child!
    asideElements.forEach((aside) => {
      expect(aside.querySelector('aside')).toBeNull();
    });

    // Check that nav anchors render
    expect(screen.getByText('API Reference')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --filter @cms/site test src/views/SiteLayout.test.tsx`
Expected: FAIL (nested aside exists, centered search container missing).

- [ ] **Step 3: Update `SiteLayout.tsx` with restored layout**

In `packages/site/src/views/SiteLayout.tsx`:
1. Restore centered search bar:
   ```tsx
   {/* Centered search (Mintlify-style); collapses to an icon on phones. */}
   <div className="hidden min-w-0 flex-1 justify-center px-2 sm:flex">
     {showSearch ? (
       <button
         type="button"
         onClick={() => setSearchOpen(true)}
         className="hidden h-9 w-full max-w-md cursor-pointer items-center gap-2.5 rounded-full border border-border/80 bg-muted/50 px-4 text-muted-foreground text-sm transition-colors hover:border-foreground/25 hover:bg-muted sm:flex"
       >
         <Search className="size-3.5 shrink-0" />
         <span className="truncate">{config?.search?.placeholder ?? t('search')}</span>
         <kbd
           className="ms-auto hidden shrink-0 rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] md:inline-flex"
           dir="ltr"
         >
           {searchHotkey === 'slash' ? '/' : searchShortcut}
         </kbd>
       </button>
     ) : null}
   </div>

   {showSearch ? (
     <button
       type="button"
       onClick={() => setSearchOpen(true)}
       className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:hidden"
       aria-label={t('search')}
     >
       <Search className="size-4" />
     </button>
   ) : null}
   ```
2. Move `VersionSwitcher` and `LanguageSwitcher` to the right-side cluster:
   ```tsx
   <div className="ms-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-1.5 sm:flex-nowrap">
     <LanguageSwitcher languages={languages} activeCode={activeLanguage?.code ?? ''} onChange={changeLanguage} />
     <VersionSwitcher versions={versions} activeSlug={activeVersion} onChange={changeVersion} lang={activeLanguage?.code} />
     <button
       type="button"
       onClick={toggleSiteTheme}
       className="grid size-9 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
       aria-label={t('toggleTheme')}
     >
       {siteTheme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
     </button>
     {ctaLabel && ctaUrl ? (
       <a
         href={ctaUrl}
         target="_blank"
         rel="noreferrer"
         className="ms-1 hidden h-9 cursor-pointer items-center rounded-full bg-primary px-4 font-medium text-primary-foreground text-sm shadow-sm transition-opacity hover:opacity-90 sm:inline-flex"
       >
         {ctaLabel}
       </a>
     ) : null}
   </div>
   ```
3. Keep the second-row `SiteNavTabs`:
   ```tsx
   {navTabs.length > 0 && (
     <div className="border-border/60 border-t py-1">
       <div className="mx-auto flex max-w-[90rem] items-center px-4 sm:px-6">
         <SiteNavTabs
           tabs={navTabs}
           currentPath={effectiveCurrentPath}
           projectId={projectId}
           lang={navigationLanguage}
           version={activeVersionPrefix}
           basePath={basePrefix}
         />
       </div>
     </div>
   )}
   ```
4. Restore `navAnchors` and remove the nested `<aside>` from `navigation` slot:
   ```tsx
   navigation={
     <>
       {navAnchors.length > 0 ? (
         <ul className="mb-4 space-y-1 border-border/60 border-b pb-5">
           {navAnchors.map((anchor) => (
             <li key={`${anchor.label}-${anchor.href}`}>
               <a
                 href={resolveNavHref(anchor.href)}
                 target={anchor.external ? '_blank' : undefined}
                 rel={anchor.external ? 'noreferrer' : undefined}
                 className="group flex items-center gap-3 rounded-lg px-2 py-1.5 font-medium text-muted-foreground text-sm transition-colors hover:text-foreground"
               >
                 <span className="grid size-6 shrink-0 place-items-center rounded-md border border-border bg-card shadow-2xs transition-colors group-hover:border-primary/40 group-hover:text-primary">
                   {hasIcon(anchor.icon) ? <PageIcon name={anchor.icon} className="size-3.5" /> : <Link2 className="size-3.5" />}
                 </span>
                 <span className="truncate">{anchor.label}</span>
               </a>
             </li>
           ))}
         </ul>
       ) : null}
       <SiteNav
         nodes={site?.nav ?? []}
         projectId={projectId}
         currentPath={effectiveCurrentPath}
         lang={navigationLanguage}
         version={activeVersionPrefix}
       />
     </>
   }
   ```
5. Wrap `content` slot in semantic `<main className="min-w-0">`:
   ```tsx
   content={
     <main className="min-w-0">
       <SitePageAlternatesContext.Provider value={pageAlternatesContext}>
         {children ?? <Outlet />}
       </SitePageAlternatesContext.Provider>
     </main>
   }
   ```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run --filter @cms/site test`
Expected: PASS (all tests pass).

---

### Task 2: Implement React Hooks for Exports in `@cms/sdk`

**Files:**
- Create: `packages/sdk/src/react/hooks/exports.ts`
- Modify: `packages/sdk/src/react/hooks/index.ts`
- Modify: `packages/sdk/src/react/index.ts`
- Test: `packages/sdk/src/react/hooks/exports.test.ts`

**Interfaces:**
- Consumes:
  - `cmsClient.exports` from `@cms/sdk` (`packages/sdk/src/resources/exports.ts`)
  - `@tanstack/react-query`
- Produces:
  - `useListExportJobs(params?: { limit?: number; offset?: number })`
  - `useListExportSchedules(projectId: string)`
  - `useCreateExportSchedule(projectId: string)`
  - `useUpdateExportSchedule(projectId: string)`
  - `useDeleteExportSchedule(projectId: string)`
  - `useRunExportSchedule(projectId: string)`
  - `useCreateExportJob()`

- [ ] **Step 1: Write test in `packages/sdk/src/react/hooks/exports.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import * as exportsHooks from './exports';

describe('SDK Exports Hooks', () => {
  it('exports all expected export hooks', () => {
    expect(exportsHooks.useListExportSchedules).toBeDefined();
    expect(exportsHooks.useCreateExportSchedule).toBeDefined();
    expect(exportsHooks.useUpdateExportSchedule).toBeDefined();
    expect(exportsHooks.useDeleteExportSchedule).toBeDefined();
    expect(exportsHooks.useListExportJobs).toBeDefined();
    expect(exportsHooks.useCreateExportJob).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --filter @cms/sdk test src/react/hooks/exports.test.ts`
Expected: FAIL (file not found).

- [ ] **Step 3: Implement `packages/sdk/src/react/hooks/exports.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCmsClient } from '../context';
import type { ExportJob, ExportSchedule } from '../../resources/exports';

export const exportQueryKeys = {
  all: ['exports'] as const,
  jobs: (params?: Record<string, unknown>) => [...exportQueryKeys.all, 'jobs', params] as const,
  schedules: (projectId: string) => [...exportQueryKeys.all, 'schedules', projectId] as const,
};

export function useListExportJobs(params?: { limit?: number; offset?: number }) {
  const client = useCmsClient();
  return useQuery({
    queryKey: exportQueryKeys.jobs(params),
    queryFn: () => client.exports.listJobs(params),
  });
}

export function useListExportSchedules(projectId: string) {
  const client = useCmsClient();
  return useQuery({
    queryKey: exportQueryKeys.schedules(projectId),
    queryFn: () => client.exports.listSchedules(projectId),
    enabled: Boolean(projectId),
  });
}

export function useCreateExportSchedule(projectId: string) {
  const client = useCmsClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => client.exports.createSchedule(projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: exportQueryKeys.schedules(projectId) });
    },
  });
}

export function useUpdateExportSchedule(projectId: string) {
  const client = useCmsClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ scheduleId, payload }: { scheduleId: string; payload: Record<string, unknown> }) =>
      client.exports.updateSchedule(scheduleId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: exportQueryKeys.schedules(projectId) });
    },
  });
}

export function useDeleteExportSchedule(projectId: string) {
  const client = useCmsClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scheduleId: string) => client.exports.deleteSchedule(scheduleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: exportQueryKeys.schedules(projectId) });
    },
  });
}

export function useRunExportSchedule(projectId: string) {
  const client = useCmsClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scheduleId: string) => client.exports.runSchedule(projectId, scheduleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: exportQueryKeys.jobs() });
    },
  });
}

export function useCreateExportJob() {
  const client = useCmsClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => client.exports.createJob(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: exportQueryKeys.jobs() });
    },
  });
}
```

- [ ] **Step 4: Export hooks from `packages/sdk/src/react/hooks/index.ts` and `packages/sdk/src/react/index.ts`**

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run --filter @cms/sdk test`
Expected: PASS.

---

### Task 3: Port `ExportsSection` to Studio Project Settings

**Files:**
- Create: `apps/studio/src/features/project-settings/components/exports-section.tsx`
- Test: `apps/studio/src/features/project-settings/components/exports-section.test.tsx`

**Interfaces:**
- Consumes:
  - Hooks from `@cms/sdk/react` (`useListExportSchedules`, `useCreateExportSchedule`, `useListExportJobs`, etc.)
  - `@cms/i18n/react`
  - `@cms/design-system` UI components (`Button`, `Switch`, `Badge`, `Input`, `Label`, `Select`)
- Produces:
  - `<ExportsSection projectId={projectId} />` component with One-Time exports, Recurring Schedules, and Export History.

- [ ] **Step 1: Write unit test in `apps/studio/src/features/project-settings/components/exports-section.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExportsSection } from './exports-section';

vi.mock('@cms/sdk/react', () => ({
  useListExportSchedules: () => ({ data: [], isLoading: false }),
  useListExportJobs: () => ({ data: [], isLoading: false }),
  useCreateExportSchedule: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateExportJob: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteExportSchedule: () => ({ mutate: vi.fn(), isPending: false }),
  useRunExportSchedule: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe('ExportsSection', () => {
  it('renders section navigation and one-time export surface', () => {
    render(<ExportsSection projectId="proj-123" />);
    expect(screen.getByText(/Export/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/studio/src/features/project-settings/components/exports-section.test.tsx`
Expected: FAIL (file not found).

- [ ] **Step 3: Implement `ExportsSection.tsx`**

Port and adapt `nibleaf-o/apps/app/src/components/project-settings/exports-section.tsx` using `@cms/sdk/react` and `@cms/design-system`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/studio/src/features/project-settings/components/exports-section.test.tsx`
Expected: PASS.

---

### Task 4: Wire `exports` Section into `ProjectSettingsPage.tsx`

**Files:**
- Modify: `apps/studio/src/features/project-settings/ProjectSettingsPage.tsx`
- Modify: `apps/studio/src/features/project-settings/index.ts`
- Test: `apps/studio/src/features/project-settings/ProjectSettingsPage.test.tsx`

**Interfaces:**
- Consumes:
  - `<ExportsSection>` from `./components/exports-section`
  - `Archive` icon from `lucide-react`
- Produces:
  - Updated `SECTIONS` with `{ id: 'exports', group: 'advanced', icon: Archive }`
  - Updated `SectionId` containing `'exports'`
  - Updated `ActiveSection` rendering `<ExportsSection projectId={projectId} />`

- [ ] **Step 1: Write/Update test in `apps/studio/src/features/project-settings/ProjectSettingsPage.test.tsx`**

Verify that `exports` appears in the sidebar items under the `advanced` group and renders `ExportsSection` when active.

- [ ] **Step 2: Update `ProjectSettingsPage.tsx`**

Add `'exports'` to `SectionId`:
```tsx
export type SectionId =
  | 'general'
  | 'languages'
  | 'domain'
  | 'authentication'
  | 'search'
  | 'addons'
  | 'git'
  | 'openapi'
  | 'contentImport'
  | 'members'
  | 'apiKeys'
  | 'usage'
  | 'integrations'
  | 'notifications'
  | 'exports'
  | 'danger';
```

Add to `SECTIONS`:
```tsx
  { id: 'exports', group: 'advanced', icon: Archive },
  { id: 'danger', group: 'advanced', icon: TriangleAlert },
```

Add to `ActiveSection`:
```tsx
  exports: <ExportsSection key={`exports-${projectId}`} projectId={projectId} />,
```

- [ ] **Step 3: Run typecheck and tests across workspace**

Run: `bun run typecheck`
Expected: PASS without any errors.

---

### Task 5: End-to-End Visual Verification

**Files:**
- Verify in browser: `http://localhost:4310/sites/674a181f-5f07-4920-9f66-2f0fd54f5144`
- Verify in browser: `http://localhost:4310/app/projects/674a181f-5f07-4920-9f66-2f0fd54f5144/settings?section=exports`

- [ ] **Step 1: Verify reader header layout**
  - Search pill is centered and responsive.
  - Nested navbar tabs (`SiteNavTabs`) render beneath header with cascading flyouts.
  - Switchers are in the right-side cluster.
  - No double right border on the sidebar.
- [ ] **Step 2: Verify Advanced Settings**
  - "Advanced" group in settings sidebar displays both "Exports" and "Danger Zone".
  - Clicking "Exports" loads the one-time, schedules, and history surfaces.
