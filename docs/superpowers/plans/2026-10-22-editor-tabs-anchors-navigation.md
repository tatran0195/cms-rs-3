# Editor Navigation Redesign: Unified Creation Menu, Root Tab Sections, & Settings Dialogs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Studio Editor sidebar by replacing the stacked 4-row control bar with a clean header, a unified node creation dropdown (`New Page`, `New Group`, `New Tab`, `New Anchor`, `New Link`), root Tab sections in the page tree, and dedicated Settings Dialogs for Tabs, Anchors, and Links, while removing the tabs field from Project Settings Navbar.

**Architecture:** Tabs, anchors, and links continue to persist to `config.navbar.tabs`, `config.navbar.anchors`, and `config.navbar.links` via `useUpdateLanguage` and `useUpdateProjectConfig`. In the editor sidebar, configured tabs group pages by URL path prefix (e.g. `/docs`, `/api`) as collapsible root tree sections. Pinned anchors render at the top. The Project Settings Navbar form is cleaned up to remove the bulky `TabsTreeEditor`.

**Tech Stack:** React 19, TypeScript, Vitest, `@testing-library/react`, `@tanstack/react-query` v5, `@cms/design-system`, `@cms/validators`, `@cms/sdk`, Lucide icons, Biome.

## Global Constraints

- Internal company deployment only: DO NOT add any billing, plans, pricing tiers, or marketing pages.
- Zero regression on published site: `packages/site/src/views/SiteLayout.tsx` reads `config?.navbar?.tabs` which must remain valid `NavTabItem[]`.
- All tests must pass: `bun test` in `apps/studio`.
- Typecheck and Biome must pass with 0 errors: `bun run typecheck` and `bun run check`.

---

### Task 1: Remove Tabs from Project Settings Navbar Form & Safeguard Tabs Persistence

**Files:**
- Modify: `apps/studio/src/features/project-settings/components/navbar/navbar-scope-form.tsx:84-89`
- Modify: `apps/studio/src/features/project-settings/components/navbar/project-navbar-form.tsx:37-62`
- Modify: `apps/studio/src/features/project-settings/components/navbar/language-navbar-form.tsx:32-62`
- Modify: `apps/studio/src/features/project-settings/components/navbar/types.ts:28-35`
- Test: `apps/studio/src/features/project-settings/components/navbar/navbar-scope-form.test.tsx`

**Interfaces:**
- Consumes: `NavbarValues` from `types.ts`, `Project` and `Language` configs.
- Produces: `NavbarScopeForm` without the `tabs` field; `ProjectNavbarForm` and `LanguageNavbarForm` preserving existing `tabs` array when updating navbar settings.

- [ ] **Step 1: Write the failing test for `NavbarScopeForm` without tabs**

Create `apps/studio/src/features/project-settings/components/navbar/navbar-scope-form.test.tsx`:
```tsx
/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NavbarScopeForm } from './navbar-scope-form';

vi.mock('@cms/i18n/react', () => ({
  useT: () => (key: string) => key,
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Array<ReturnType<typeof createRoot>> = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }
  document.body.replaceChildren();
});

describe('NavbarScopeForm', () => {
  it('renders navbar fields without tabs editor', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <NavbarScopeForm
          initial={{
            ctaLabel: 'Get Started',
            ctaUrl: 'https://example.com',
            links: [],
            anchors: [],
          }}
          onSave={vi.fn()}
        />,
      );
    });

    expect(container.textContent).not.toContain('settings.navbar.tabs.label');
    expect(container.querySelector('[data-testid="tabs-tree-editor"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/studio/src/features/project-settings/components/navbar/navbar-scope-form.test.tsx`
Expected: FAIL due to `tabs` property missing on initial or tabs field present.

- [ ] **Step 3: Update `types.ts`, `navbar-scope-form.tsx`, `project-navbar-form.tsx`, and `language-navbar-form.tsx`**

In `apps/studio/src/features/project-settings/components/navbar/types.ts`:
Remove `tabs` from `NavbarValues`:
```ts
export interface NavbarValues {
  ctaLabel: string;
  ctaUrl: string;
  links: NavRow[];
  anchors: AnchorRow[];
}
```

In `apps/studio/src/features/project-settings/components/navbar/navbar-scope-form.tsx`:
Remove `TabsTreeEditor` import and lines 84-88 rendering the tabs field.

In `apps/studio/src/features/project-settings/components/navbar/project-navbar-form.tsx`:
Update `initial` to not include `tabs`, and in `onSave`:
```tsx
      onSave={(value) =>
        saveConfigSection(update, {
          navbar: {
            ctaLabel: value.ctaLabel.trim() || undefined,
            ctaUrl: value.ctaUrl.trim() || undefined,
            links: cleanRows(value.links),
            tabs: navbar.tabs, // Preserve existing tabs
            anchors: cleanAnchorRows(value.anchors),
            showSearch,
            changelog: showChangelog,
          },
        })
      }
```

In `apps/studio/src/features/project-settings/components/navbar/language-navbar-form.tsx`:
Update `initial` without `tabs`, and in `onSave`:
```tsx
        if (override.tabs && override.tabs.length > 0) {
          navbar.tabs = override.tabs; // Preserve existing tabs
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test apps/studio/src/features/project-settings/components/navbar/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/project-settings/components/navbar/
git commit -m "refactor: remove tabs from navbar settings form and preserve tabs in config"
```

---

### Task 2: Implement `TabSettingsDialog`

**Files:**
- Create: `apps/studio/src/features/editor/components/tab-settings-dialog.tsx`
- Create: `apps/studio/src/features/editor/components/tab-settings-dialog.test.tsx`

**Interfaces:**
- Consumes: `NavTabItem` from `@cms/validators`, `useUpdateLanguage`, `useUpdateProjectConfig` from `@cms/sdk/react`.
- Produces: `TabSettingsDialog` component supporting Create, Edit, Base Path validation, and Delete.

- [ ] **Step 1: Write the failing test for `TabSettingsDialog`**

Create `apps/studio/src/features/editor/components/tab-settings-dialog.test.tsx`:
```tsx
/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TabSettingsDialog } from './tab-settings-dialog';

const mockMutateAsync = vi.fn().mockResolvedValue({});

vi.mock('@cms/sdk/react', () => ({
  useUpdateLanguage: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
  useUpdateProjectConfig: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

vi.mock('@cms/i18n/react', () => ({
  useT: () => (key: string) => key,
}));

describe('TabSettingsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders create mode inputs and auto-slugifies base path', async () => {
    render(
      <TabSettingsDialog
        projectId="proj-1"
        languageId="lang-en"
        existingTabs={[]}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/Name/i)).toBeDefined();
    const nameInput = screen.getByLabelText(/Name/i) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'API Reference' } });

    const pathInput = screen.getByLabelText(/Base Path/i) as HTMLInputElement;
    expect(pathInput.value).toBe('/api-reference');
  });

  it('renders edit mode with delete button for existing tab', async () => {
    render(
      <TabSettingsDialog
        projectId="proj-1"
        languageId="lang-en"
        tab={{ label: 'Docs', href: '/docs' }}
        existingTabs={[{ label: 'Docs', href: '/docs' }]}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /Delete Tab/i })).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/studio/src/features/editor/components/tab-settings-dialog.test.tsx`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `TabSettingsDialog`**

Create `apps/studio/src/features/editor/components/tab-settings-dialog.tsx`:
- Accepts `projectId`, `languageId`, `tab?: NavTabItem`, `existingTabs: NavTabItem[]`, `open`, `onOpenChange`.
- Form state: `label`, `href`, `icon`, `external`.
- In create mode (`!tab`), typing `label` auto-computes `href` as `/${slugify(label)}` unless the user has manually edited `href`.
- Ensures `href` starts with `/` if not external.
- Validates against duplicate `href` values.
- On save:
  - If editing, replaces tab in `existingTabs`.
  - If creating, appends tab to `existingTabs`.
  - Calls `updateLanguage.mutateAsync({ id: languageId, body: { config: { navbar: { tabs: nextTabs } } } })` or project config.
- On delete:
  - Removes tab from `existingTabs` and mutates.
  - Displays toast and closes dialog.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/studio/src/features/editor/components/tab-settings-dialog.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/editor/components/tab-settings-dialog.tsx apps/studio/src/features/editor/components/tab-settings-dialog.test.tsx
git commit -m "feat: add TabSettingsDialog component with create, edit, and delete support"
```

---

### Task 3: Implement `AnchorSettingsDialog` & `LinkSettingsDialog`

**Files:**
- Create: `apps/studio/src/features/editor/components/anchor-settings-dialog.tsx`
- Create: `apps/studio/src/features/editor/components/anchor-settings-dialog.test.tsx`
- Create: `apps/studio/src/features/editor/components/link-settings-dialog.tsx`
- Create: `apps/studio/src/features/editor/components/link-settings-dialog.test.tsx`

**Interfaces:**
- Consumes: `NavAnchor` and `NavLink` from `@cms/validators`, `useUpdateLanguage`, `useUpdateProjectConfig`.
- Produces: `AnchorSettingsDialog` and `LinkSettingsDialog` dialog components.

- [ ] **Step 1: Write the failing tests for `AnchorSettingsDialog` and `LinkSettingsDialog`**

Create `apps/studio/src/features/editor/components/anchor-settings-dialog.test.tsx`:
```tsx
/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnchorSettingsDialog } from './anchor-settings-dialog';

const mockMutate = vi.fn().mockResolvedValue({});

vi.mock('@cms/sdk/react', () => ({
  useUpdateLanguage: () => ({ mutateAsync: mockMutate, isPending: false }),
  useUpdateProjectConfig: () => ({ mutateAsync: mockMutate, isPending: false }),
}));

vi.mock('@cms/i18n/react', () => ({
  useT: () => (key: string) => key,
}));

describe('AnchorSettingsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders anchor inputs in create mode', () => {
    render(
      <AnchorSettingsDialog
        projectId="proj-1"
        languageId="lang-en"
        existingAnchors={[]}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/Label/i)).toBeDefined();
    expect(screen.getByLabelText(/URL/i)).toBeDefined();
  });
});
```

Create `apps/studio/src/features/editor/components/link-settings-dialog.test.tsx`:
```tsx
/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LinkSettingsDialog } from './link-settings-dialog';

const mockMutate = vi.fn().mockResolvedValue({});

vi.mock('@cms/sdk/react', () => ({
  useUpdateLanguage: () => ({ mutateAsync: mockMutate, isPending: false }),
  useUpdateProjectConfig: () => ({ mutateAsync: mockMutate, isPending: false }),
}));

vi.mock('@cms/i18n/react', () => ({
  useT: () => (key: string) => key,
}));

describe('LinkSettingsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders link inputs in create mode', () => {
    render(
      <LinkSettingsDialog
        projectId="proj-1"
        languageId="lang-en"
        existingLinks={[]}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/Label/i)).toBeDefined();
    expect(screen.getByLabelText(/URL/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test apps/studio/src/features/editor/components/anchor-settings-dialog.test.tsx apps/studio/src/features/editor/components/link-settings-dialog.test.tsx`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `AnchorSettingsDialog` and `LinkSettingsDialog`**

Create `apps/studio/src/features/editor/components/anchor-settings-dialog.tsx`:
- Fields: `label`, `href`, `icon`, `external`.
- Mutates `config.navbar.anchors`.
- Delete support when editing existing anchor.

Create `apps/studio/src/features/editor/components/link-settings-dialog.tsx`:
- Fields: `label`, `href`, `external`.
- Mutates `config.navbar.links`.
- Delete support when editing existing link.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test apps/studio/src/features/editor/components/anchor-settings-dialog.test.tsx apps/studio/src/features/editor/components/link-settings-dialog.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/editor/components/anchor-settings-dialog.tsx apps/studio/src/features/editor/components/anchor-settings-dialog.test.tsx apps/studio/src/features/editor/components/link-settings-dialog.tsx apps/studio/src/features/editor/components/link-settings-dialog.test.tsx
git commit -m "feat: add AnchorSettingsDialog and LinkSettingsDialog components"
```

---

### Task 4: Implement Unified Creation Menu & Root Tab Sections in `EditorSidebarPanel`

**Files:**
- Modify: `apps/studio/src/features/editor/components/editor-sidebar-panel.tsx`
- Modify: `apps/studio/src/features/editor/components/editor-sidebar-panel.test.tsx`

**Interfaces:**
- Consumes: `TabSettingsDialog`, `AnchorSettingsDialog`, `LinkSettingsDialog`, `SortablePageTree`.
- Produces: Complete editor sidebar panel with unified `[ + ▾ ]` creation menu, pinned anchors list, and root Tab sections grouping pages by path prefix.

- [ ] **Step 1: Write the failing tests in `editor-sidebar-panel.test.tsx`**

Update `apps/studio/src/features/editor/components/editor-sidebar-panel.test.tsx` to test:
1. Unified `+` dropdown menu renders options (`New page`, `New group`, `New tab`, `New anchor`, `New link`).
2. Configured tabs render as top-level collapsible sections.
3. Pages are grouped into their matching Tab section based on path prefix (`/docs/...` inside Docs tab).
4. Unassigned pages render in a default section.
5. Pinned anchors render at the top.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/studio/src/features/editor/components/editor-sidebar-panel.test.tsx`
Expected: FAIL against new assertions.

- [ ] **Step 3: Update `EditorSidebarPanel` implementation**

In `apps/studio/src/features/editor/components/editor-sidebar-panel.tsx`:
1. Remove `SidebarTabsDropdown` completely.
2. In the top bar:
   - Render `LocaleSelector` trigger on the left.
   - Render a unified `[ + ▾ ]` dropdown button (`DropdownMenu`):
     - `📄 New page` (calls `onAddPage(null, currentLangId)`)
     - `📁 New group` (calls `onAddGroup(currentLangId)`)
     - `---`
     - `📑 New tab` (opens `TabSettingsDialog` in create mode)
     - `⚓ New anchor` (opens `AnchorSettingsDialog` in create mode)
     - `🔗 New navbar link` (opens `LinkSettingsDialog` in create mode)
   - Render collapse button `[ ◂ ]`.
3. If `currentNavbarAnchors.length > 0`:
   - Render pinned anchors list above the tree with icon, label, and options menu to edit/delete.
4. If `currentNavbarTabs.length > 0`:
   - Partition pages into tabs: for each tab with clean prefix `tab.href`, group matching pages.
   - Any page not matching any tab is put into `unassignedPages`.
   - Render each Tab as a collapsible root section:
     - Header: Tab title, icon, page count badge.
     - Hover buttons: `[ + ]` (adds page pre-seeded with tab prefix), `[ ··· ]` (opens options menu: Tab settings, Delete).
     - Body: Renders `SortablePageTree` for pages belonging to this tab.
   - Render `unassignedPages` (if any exist) under a default `Other Pages` section.
5. If `currentNavbarTabs.length === 0`:
   - Render single `SortablePageTree` as before (standard nested tree).
6. Mount `TabSettingsDialog`, `AnchorSettingsDialog`, and `LinkSettingsDialog`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test apps/studio/src/features/editor/components/editor-sidebar-panel.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/editor/components/editor-sidebar-panel.tsx apps/studio/src/features/editor/components/editor-sidebar-panel.test.tsx
git commit -m "feat: add unified creation menu and root tab sections in editor sidebar panel"
```

---

### Task 5: Monorepo Verification & Biome Check

**Files:**
- Entire repository

**Interfaces:**
- Strict TypeScript verification (`bun run typecheck`).
- Biome linting and formatting check (`bun run check`).
- Studio test suite (`bun test`).

- [ ] **Step 1: Run the full studio test suite**

Run: `bun test` in `apps/studio`
Expected: All test suites PASS.

- [ ] **Step 2: Run monorepo typecheck**

Run: `bun run typecheck`
Expected: 0 errors across all packages.

- [ ] **Step 3: Run Biome linter check**

Run: `bun run check`
Expected: 0 lint or formatting errors.

- [ ] **Step 4: Commit any cleanup or formatting adjustments**

```bash
git add -A
git commit -m "chore: ensure clean typecheck and biome linting across workspaces"
```
