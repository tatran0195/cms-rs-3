# Fumadocs Layouts Architecture Rewrite & Interactive Sandbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completely rewrite the 5 documentation layouts (`docs`, `spacious`, `notebook`, `glass`, `flux`) in `@cms/site` to match Fumadocs' authentic CSS grid, internal panel scrolling, and slot architecture, and add a live interactive macOS-style layout sandbox to Studio.

**Architecture:** Port the exact CSS grid templates, CSS variables, and layout structures from upstream Fumadocs (`packages/radix-ui/src/layouts` and `packages/base-ui/src/layouts`) directly into `packages/site/src/layouts/`. Wire `DocumentationPageLayout` and `SiteLayout.tsx` to mount article, TOC, breadcrumb, and actions into layout-specific grid areas. Build an interactive macOS-windowed sandbox (`DocsLayoutSandbox`) in Studio matching Fumadocs `layouts.story.tsx`.

**Tech Stack:** React 19, Tailwind CSS, `@cms/design-system`, Lucide React, Bun test runner, Vitest.

## Global Constraints

- Platform is exclusively for internal company use (no billing, plans, or marketing routes per `AGENTS.md`).
- Must adhere to authentic Fumadocs DOM layout IDs (`#nd-docs-layout`, `#fd-spacious-layout`, `#nd-page-panel`, `#nd-notebook-layout`, `#fd-glass-layout`, `#nd-flux-layout`).
- Spacious layout must implement desktop locked height and internal panel scrolling (`md:overflow-y-auto md:overscroll-y-contain md:scrollbar-thin`).
- All 5 layouts must be decoupled from color schemes, compatible with any theme preset.
- Every task must include tests and typecheck verification.

---

### Task 1: Shared Layout Infrastructure, Types & CSS Variables

**Files:**
- Modify: `packages/site/src/layouts/types.ts`
- Modify: `packages/site/src/layouts/shared.tsx`
- Test: `packages/site/src/layouts/layouts.test.ts`

**Interfaces:**
- Produces: `DocsLayoutSlots`, `DocsPageSlots`, `DocsLayoutTemplate`, `useLayoutSidebar`, `SidebarDock`

- [ ] **Step 1: Write tests for layout contracts and types**

```tsx
// packages/site/src/layouts/layouts.test.ts
import { describe, expect, it } from 'bun:test';
import { DOCS_LAYOUT_IDS } from '@cms/shared/themes';
import { getDocsLayoutTemplate, registerDocsLayoutTemplate } from './index';

describe('DocsLayout Registry & Contracts', () => {
  it('registers and retrieves all 5 layout templates', () => {
    for (const id of DOCS_LAYOUT_IDS) {
      const template = getDocsLayoutTemplate(id);
      expect(template).toBeDefined();
      expect(template.id).toBe(id);
      expect(typeof template.ReaderLayout).toBe('function');
      expect(typeof template.PageLayout).toBe('function');
      expect(typeof template.ProjectPreviewLayout).toBe('function');
      expect(typeof template.StudioPreviewLayout).toBe('function');
    }
  });

  it('falls back to docs layout if unknown id provided', () => {
    // @ts-expect-error testing fallback
    const fallback = getDocsLayoutTemplate('nonexistent');
    expect(fallback.id).toBe('docs');
  });
});
```

- [ ] **Step 2: Run test to verify it passes or check baseline**

Run: `bun test packages/site/src/layouts/layouts.test.ts`
Expected: PASS

- [ ] **Step 3: Update `types.ts` and `shared.tsx` with Fumadocs slot contracts and dock helper**

```tsx
// packages/site/src/layouts/types.ts
import type { DocsLayoutId } from '@cms/shared/themes';
import type { ReactNode } from 'react';

export interface DocsLayoutSlots {
  banner?: ReactNode;
  header: ReactNode;
  navigation: ReactNode;
  content: ReactNode;
  footer?: ReactNode;
  overlays?: ReactNode;

  brand?: ReactNode;
  searchFull?: ReactNode;
  searchButton?: ReactNode;
  tools?: ReactNode;
  navLinks?: ReactNode;
  navTabs?: ReactNode;
  navAnchors?: ReactNode;
  sidebarTree?: ReactNode;
  mobileNav?: ReactNode;
}

export interface DocsPageSlots {
  article: ReactNode;
  tableOfContents: ReactNode;
  breadcrumb?: ReactNode;
  footer?: ReactNode;
}

export interface ProjectPreviewSlots {
  mobileNavigation: ReactNode;
  navigation: ReactNode;
  content: ReactNode;
  header?: ReactNode;
  brand?: ReactNode;
  tools?: ReactNode;
}

export interface StudioPreviewSlots {
  header: ReactNode;
  navigation: ReactNode;
  content: ReactNode;
  brand?: ReactNode;
  tools?: ReactNode;
}

export interface DocsLayoutTemplate {
  id: DocsLayoutId;
  ReaderLayout: (slots: DocsLayoutSlots) => ReactNode;
  ProjectPreviewLayout: (slots: ProjectPreviewSlots) => ReactNode;
  StudioPreviewLayout: (slots: StudioPreviewSlots) => ReactNode;
  PageLayout: (slots: DocsPageSlots) => ReactNode;
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `bun test packages/site/src/layouts/layouts.test.ts; bun run --filter @cms/site typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/site/src/layouts/types.ts packages/site/src/layouts/shared.tsx packages/site/src/layouts/layouts.test.ts
git commit -m "feat(site): refine fumadocs layout slot contracts and types"
```

---

### Task 2: Authentic Fumadocs Spacious Layout (`spacious-layout.tsx`)

**Files:**
- Modify: `packages/site/src/layouts/spacious-layout.tsx`
- Modify: `packages/site/src/layouts/spacious-layout.test.tsx`

**Interfaces:**
- Produces: `SpaciousLayoutTemplate`

- [ ] **Step 1: Write test verifying Spacious layout DOM structure and internal scrolling**

```tsx
// packages/site/src/layouts/spacious-layout.test.tsx
import { describe, expect, it } from 'bun:test';
import { render } from '@testing-library/react';
import { SpaciousLayoutTemplate } from './spacious-layout';

describe('SpaciousLayoutTemplate', () => {
  it('renders #fd-spacious-layout grid with borderless sidebar and #nd-page-panel', () => {
    const { container } = render(
      SpaciousLayoutTemplate.ReaderLayout({
        header: <header>Header</header>,
        navigation: <nav>Nav</nav>,
        content: <main>Content</main>,
        brand: <div>Brand</div>,
        tools: <div>Tools</div>,
      })
    );

    const layout = container.querySelector('#fd-spacious-layout');
    expect(layout).not.toBeNull();
    expect(layout?.getAttribute('data-documentation-layout')).toBe('fumadocs-spacious');

    const panel = container.querySelector('#nd-page-panel');
    expect(panel).not.toBeNull();
    expect(panel?.className).toContain('md:rounded-2xl');

    // Panel content internal scroll container
    const scrollContainer = panel?.querySelector('[data-spacious-scroll-container="true"]');
    expect(scrollContainer).not.toBeNull();
    expect(scrollContainer?.className).toContain('md:overflow-y-auto');
  });

  it('renders PageLayout placing article and tableOfContents inside panel container', () => {
    const { container } = render(
      SpaciousLayoutTemplate.PageLayout({
        article: <article>Article body</article>,
        tableOfContents: <aside>TOC</aside>,
      })
    );

    expect(container.textContent).toContain('Article body');
    expect(container.textContent).toContain('TOC');
    const article = container.querySelector('#nd-page');
    expect(article).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to observe failure**

Run: `bun test packages/site/src/layouts/spacious-layout.test.tsx`
Expected: FAIL due to missing `#fd-spacious-layout` or `data-spacious-scroll-container`

- [ ] **Step 3: Implement authentic Fumadocs Spacious layout**

Implement `packages/site/src/layouts/spacious-layout.tsx` matching `C:\Users\Admin\Downloads\fumadocs\packages\base-ui\src\layouts\spacious`:
- Viewport height locked on desktop: `md:h-(--fd-layout-height) md:overflow-clip`
- Grid template:
  `gridTemplate: "sidebar header right" auto / "sidebar toc-popover right" var(--fd-toc-popover-height, 0px) / "sidebar main right" 1fr / var(--fd-sidebar-col) minmax(0, 1fr) auto`
- Sidebar with `border-e-0`, brand, search full, tabs, tree, and dock
- `#nd-page-panel` with:
  - Header fade (`ps-6 pe-4 bg-gradient-to-b from-background to-transparent`)
  - Internal scroll container: `flex flex-1 items-start px-4 md:min-h-0 md:pt-(--fd-header-height) md:px-[max(1.5rem,calc((100%-var(--fd-page-width)-var(--fd-toc-width))/2))] md:overflow-y-auto md:overscroll-y-contain md:scrollbar-thin`
  - Integrated `article` and sticky `TOC`

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/site/src/layouts/spacious-layout.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/site/src/layouts/spacious-layout.tsx packages/site/src/layouts/spacious-layout.test.tsx
git commit -m "feat(site): rewrite spacious layout to match fumadocs grid and internal panel scroll"
```

---

### Task 3: Authentic Fumadocs Standard Docs Layout (`docs-layout.tsx`)

**Files:**
- Modify: `packages/site/src/layouts/docs-layout.tsx`
- Modify: `packages/site/src/layouts/docs-layout.test.tsx`

**Interfaces:**
- Produces: `DocsStandardLayoutTemplate`

- [ ] **Step 1: Write test for `#nd-docs-layout` grid areas and collapsible sidebar**

```tsx
// packages/site/src/layouts/docs-layout.test.tsx
import { describe, expect, it } from 'bun:test';
import { render } from '@testing-library/react';
import { DocsStandardLayoutTemplate } from './docs-layout';

describe('DocsStandardLayoutTemplate', () => {
  it('renders #nd-docs-layout with CSS grid areas', () => {
    const { container } = render(
      DocsStandardLayoutTemplate.ReaderLayout({
        header: <header>Header</header>,
        navigation: <nav>Nav</nav>,
        content: <main>Content</main>,
        brand: <div>Brand</div>,
        tools: <div>Tools</div>,
        navTabs: <div>Tabs</div>,
      })
    );

    const layout = container.querySelector('#nd-docs-layout');
    expect(layout).not.toBeNull();
    expect(layout?.getAttribute('data-documentation-layout')).toBe('fumadocs-docs');

    const sidebar = container.querySelector('#nd-sidebar');
    expect(sidebar).not.toBeNull();
  });

  it('renders PageLayout placing article in main and tableOfContents in toc area', () => {
    const { container } = render(
      DocsStandardLayoutTemplate.PageLayout({
        article: <article>Article body</article>,
        tableOfContents: <aside>TOC</aside>,
      })
    );

    expect(container.textContent).toContain('Article body');
    expect(container.textContent).toContain('TOC');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `bun test packages/site/src/layouts/docs-layout.test.tsx`
Expected: FAIL due to missing `#nd-docs-layout` / `#nd-sidebar`

- [ ] **Step 3: Implement authentic Fumadocs Standard Docs layout**

Rewrite `packages/site/src/layouts/docs-layout.tsx` matching `C:\Users\Admin\Downloads\fumadocs\packages\radix-ui\src\layouts\docs`:
- Grid template:
  `gridTemplate: "sidebar sidebar header toc toc" / "sidebar sidebar toc-popover toc toc" / "sidebar sidebar tabs toc toc" / "sidebar sidebar main toc toc" 1fr / minmax(min-content, 1fr) var(--fd-sidebar-col) minmax(0, calc(var(--fd-layout-width,97rem) - var(--fd-sidebar-width) - var(--fd-toc-width))) var(--fd-toc-width) minmax(min-content, 1fr)`
- Collapsible sidebar with hover peek zone
- Header in `[grid-area:header]`, tabs in `[grid-area:tabs]`, TOC in `[grid-area:toc]`

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/site/src/layouts/docs-layout.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/site/src/layouts/docs-layout.tsx packages/site/src/layouts/docs-layout.test.tsx
git commit -m "feat(site): rewrite standard docs layout to match fumadocs grid and sidebar"
```

---

### Task 4: Authentic Fumadocs Notebook & Glass Layouts (`notebook-layout.tsx`, `glass-layout.tsx`)

**Files:**
- Modify: `packages/site/src/layouts/notebook-layout.tsx`
- Modify: `packages/site/src/layouts/notebook-layout.test.tsx`
- Modify: `packages/site/src/layouts/glass-layout.tsx`
- Modify: `packages/site/src/layouts/glass-layout.test.tsx`

**Interfaces:**
- Produces: `NotebookLayoutTemplate`, `GlassLayoutTemplate`

- [ ] **Step 1: Write tests for Notebook and Glass layouts**

```tsx
// packages/site/src/layouts/notebook-layout.test.tsx
import { describe, expect, it } from 'bun:test';
import { render } from '@testing-library/react';
import { NotebookLayoutTemplate } from './notebook-layout';

describe('NotebookLayoutTemplate', () => {
  it('renders #nd-notebook-layout on tinted canvas', () => {
    const { container } = render(
      NotebookLayoutTemplate.ReaderLayout({
        header: <header>Header</header>,
        navigation: <nav>Nav</nav>,
        content: <main>Content</main>,
        brand: <div>Brand</div>,
      })
    );

    const layout = container.querySelector('#nd-notebook-layout');
    expect(layout).not.toBeNull();
    expect(layout?.getAttribute('data-documentation-layout')).toBe('fumadocs-notebook');
  });
});
```

```tsx
// packages/site/src/layouts/glass-layout.test.tsx
import { describe, expect, it } from 'bun:test';
import { render } from '@testing-library/react';
import { GlassLayoutTemplate } from './glass-layout';

describe('GlassLayoutTemplate', () => {
  it('renders #fd-glass-layout with floating translucent header', () => {
    const { container } = render(
      GlassLayoutTemplate.ReaderLayout({
        header: <header>Header</header>,
        navigation: <nav>Nav</nav>,
        content: <main>Content</main>,
        brand: <div>Brand</div>,
      })
    );

    const layout = container.querySelector('#fd-glass-layout');
    expect(layout).not.toBeNull();
    expect(layout?.getAttribute('data-documentation-layout')).toBe('fumadocs-glass');
  });
});
```

- [ ] **Step 2: Implement Notebook layout matching Fumadocs**

Rewrite `packages/site/src/layouts/notebook-layout.tsx` matching `C:\Users\Admin\Downloads\fumadocs\packages\radix-ui\src\layouts\notebook`:
- Grid template:
  `gridTemplate: "sidebar sidebar header header ." / "sidebar sidebar main toc ." 1fr / minmax(...) var(--fd-sidebar-col) minmax(0, calc(...)) var(--fd-toc-col) minmax(...)`
- Card background `bg-card/40 dark:bg-card/20`
- Elevated paper sheet (`data-layout-content`, max-width 900px, rounded-xl border shadow-xs)
- Margin TOC

- [ ] **Step 3: Implement Glass layout matching Fumadocs**

Rewrite `packages/site/src/layouts/glass-layout.tsx` matching `C:\Users\Admin\Downloads\fumadocs\packages\radix-ui\src\layouts\glass`:
- Grid template:
  `gridTemplate: "left left-margin main right-margin right" 1fr / var(--fd-left-width) ... 1fr ... var(--fd-right-width)`
- Floating header with `backdrop-blur-md bg-background/70 border border-border/60 shadow-sm rounded-2xl`
- Floating frosted sidebar

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/site/src/layouts/notebook-layout.test.tsx packages/site/src/layouts/glass-layout.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/site/src/layouts/notebook-layout.tsx packages/site/src/layouts/notebook-layout.test.tsx packages/site/src/layouts/glass-layout.tsx packages/site/src/layouts/glass-layout.test.tsx
git commit -m "feat(site): rewrite notebook and glass layouts to match fumadocs architecture"
```

---

### Task 5: Authentic Fumadocs Flux Layout (`flux-layout.tsx`)

**Files:**
- Modify: `packages/site/src/layouts/flux-layout.tsx`
- Modify: `packages/site/src/layouts/flux-layout.test.tsx`

**Interfaces:**
- Produces: `FluxLayoutTemplate`

- [ ] **Step 1: Write test for Flux layout and floating bottom NavigationPanel dock**

```tsx
// packages/site/src/layouts/flux-layout.test.tsx
import { describe, expect, it } from 'bun:test';
import { render } from '@testing-library/react';
import { FluxLayoutTemplate } from './flux-layout';

describe('FluxLayoutTemplate', () => {
  it('renders #nd-flux-layout with signature floating bottom navigation panel', () => {
    const { container } = render(
      FluxLayoutTemplate.ReaderLayout({
        header: <header>Header</header>,
        navigation: <nav>Nav</nav>,
        content: <main>Content</main>,
        brand: <div>Brand</div>,
        tools: <div>Tools</div>,
        navTabs: <div>Tabs</div>,
      })
    );

    const layout = container.querySelector('#nd-flux-layout');
    expect(layout).not.toBeNull();
    expect(layout?.getAttribute('data-documentation-layout')).toBe('fumadocs-flux');

    const navPanel = container.querySelector('[data-flux-nav-panel="true"]');
    expect(navPanel).not.toBeNull();
    expect(navPanel?.className).toContain('fixed');
    expect(navPanel?.className).toContain('bottom-0');
  });
});
```

- [ ] **Step 2: Implement authentic Fumadocs Flux layout**

Rewrite `packages/site/src/layouts/flux-layout.tsx` matching `C:\Users\Admin\Downloads\fumadocs\packages\radix-ui\src\layouts\flux`:
- Clean full-width reading canvas (`#nd-flux-layout`)
- Collapsible minimalist navigation rail
- Floating bottom dock pill (`NavigationPanel`) fixed at `bottom-0 sm:bottom-6 left-1/2 -translate-x-1/2 rounded-2xl bg-popover shadow-lg border`
- Contains Brand, tab dropdown, search trigger button, and theme switch

- [ ] **Step 3: Run test to verify it passes**

Run: `bun test packages/site/src/layouts/flux-layout.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/site/src/layouts/flux-layout.tsx packages/site/src/layouts/flux-layout.test.tsx
git commit -m "feat(site): rewrite flux layout with authentic fumadocs navigation panel dock"
```

---

### Task 6: Wire Site Chrome & Page View Slot Dispatch

**Files:**
- Modify: `packages/site/src/components/documentation-theme-provider.tsx`
- Modify: `packages/site/src/components/site-page-view.tsx`
- Modify: `packages/site/src/views/SiteLayout.tsx`
- Test: `packages/site/src/views/SiteLayout.test.tsx`

**Interfaces:**
- Consumes: All 5 `DocsLayoutTemplate` implementations
- Produces: Updated `DocumentationThemeProvider`, `DocumentationPageLayout`, `SiteLayout`

- [ ] **Step 1: Write test in `SiteLayout.test.tsx` for all 5 layouts**

```tsx
// Verify all 5 layouts render correctly with their layout-specific attributes
it.each(['docs', 'spacious', 'notebook', 'glass', 'flux'] as const)(
  'renders %s layout through SiteLayout and theme provider',
  (layoutId) => {
    // Render SiteLayout with draft.theme.layout.docsLayout = layoutId
    // Expect correct data-documentation-layout attribute
  }
);
```

- [ ] **Step 2: Update `documentation-theme-provider.tsx` and `site-page-view.tsx`**

Ensure `DocumentationPageLayout` receives `{ article, tableOfContents, breadcrumb, footer }` and dispatches to `template.PageLayout`.
In `site-page-view.tsx`, pass `breadcrumb` and `footer` into `DocumentationPageLayout`.

- [ ] **Step 3: Run all layout and site tests**

Run: `bun test packages/site`
Expected: All tests pass.

- [ ] **Step 4: Run typecheck**

Run: `bun run --filter @cms/site typecheck`
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit**

```bash
git add packages/site/src/components/documentation-theme-provider.tsx packages/site/src/components/site-page-view.tsx packages/site/src/views/SiteLayout.tsx packages/site/src/views/SiteLayout.test.tsx
git commit -m "feat(site): wire granular slots and page layout dispatch across all 5 layouts"
```

---

### Task 7: Interactive macOS-Style Layout Sandbox in Studio

**Files:**
- Create: `apps/studio/src/features/project-settings/components/docs-layout-sandbox.tsx`
- Create: `apps/studio/src/features/project-settings/components/docs-layout-sandbox.test.tsx`
- Modify: `apps/studio/src/features/project-settings/components/theme-section.tsx`
- Modify: `apps/studio/src/features/project-settings/components/docs-layout-picker.tsx`

**Interfaces:**
- Produces: `DocsLayoutSandbox` component with macOS window frame and live interactive controls

- [ ] **Step 1: Write tests for `DocsLayoutSandbox`**

```tsx
// apps/studio/src/features/project-settings/components/docs-layout-sandbox.test.tsx
import { describe, expect, it } from 'bun:test';
import { render, fireEvent } from '@testing-library/react';
import { DocsLayoutSandbox } from './docs-layout-sandbox';

describe('DocsLayoutSandbox', () => {
  it('renders macOS window chrome with red, yellow, and green dots', () => {
    const { container } = render(<DocsLayoutSandbox currentLayout="spacious" onSelectLayout={() => {}} />);
    expect(container.querySelector('[data-window-control="close"]')).not.toBeNull();
    expect(container.querySelector('[data-window-control="minimize"]')).not.toBeNull();
    expect(container.querySelector('[data-window-control="maximize"]')).not.toBeNull();
  });

  it('allows switching layout via interactive toolbar', () => {
    let selected = 'spacious';
    const { getByRole } = render(
      <DocsLayoutSandbox currentLayout="spacious" onSelectLayout={(id) => { selected = id; }} />
    );

    const fluxButton = getByRole('button', { name: /flux/i });
    fireEvent.click(fluxButton);
    expect(selected).toBe('flux');
  });
});
```

- [ ] **Step 2: Implement `DocsLayoutSandbox.tsx`**

Build `apps/studio/src/features/project-settings/components/docs-layout-sandbox.tsx`:
1. **Window Frame (`StoryWindow`):**
   - Header with `#ff5f57`, `#febc2e`, `#28c840` dots.
   - Elegant dark/light viewport border with shadow.
2. **Interactive Controls Toolbar (`WithControl`):**
   - Layout Selector pills (Docs, Spacious, Notebook, Glass, Flux).
   - Sidebar Collapsible switch (`collapsible: true | false`).
   - Theme switch (`appearance: 'light' | 'dark'`).
   - Tab mode switcher (`'auto' | 'top' | 'sidebar'`).
3. **Demo Content Page (`DemoPage`):**
   - Sample documentation page with overview, callout, cards, tabs, and headings.
   - Mounts the active layout template using `DocumentationThemeProvider`.

- [ ] **Step 3: Integrate Sandbox toggle into `ThemeSection.tsx` and `DocsLayoutPicker.tsx`**

Allow authors in Studio Theme Settings to toggle between "Gallery View" (thumbnails) and "Interactive Sandbox" (live playable demo).

- [ ] **Step 4: Run tests and typecheck**

Run: `bun test apps/studio/src/features/project-settings/components/docs-layout-sandbox.test.tsx; bun run --filter @cms/studio typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/project-settings/components/docs-layout-sandbox.tsx apps/studio/src/features/project-settings/components/docs-layout-sandbox.test.tsx apps/studio/src/features/project-settings/components/theme-section.tsx apps/studio/src/features/project-settings/components/docs-layout-picker.tsx
git commit -m "feat(studio): add interactive macos docs layout sandbox matching fumadocs stories"
```

---

### Task 8: End-to-End Verification & Quality Gate

**Files:**
- Verify: Full monorepo typecheck & test suite

- [ ] **Step 1: Run comprehensive tests across `@cms/site` and `@cms/studio`**

Run: `bun test packages/site apps/studio`
Expected: All tests pass.

- [ ] **Step 2: Run full monorepo typecheck**

Run: `bun run typecheck`
Expected: 0 errors across all packages.

- [ ] **Step 3: Interactive browser verification**

Navigate to:
- Reader: `http://localhost:4310/sites/34c59d77-9474-439f-918e-40193594770d`
- Studio: `http://localhost:4310/app/projects/34c59d77-9474-439f-918e-40193594770d/editor`
Verify in browser that:
1. Spacious layout scrolls internally inside `#nd-page-panel` while sidebar stays steady.
2. Collapsible sidebars expand/collapse and trigger preview peek on hover.
3. Flux layout renders floating bottom dock with search and theme switch.
4. Studio Theme settings macOS sandbox allows live testing and layout selection.

- [ ] **Step 4: Final commit and cleanup**

```bash
git status
git commit -am "chore(release): verify fumadocs layouts rewrite and interactive sandbox"
```
