# Design Specification: Fumadocs Layouts Architecture Rewrite & Interactive Sandbox

**Date:** 2026-10-19  
**Status:** Approved  
**Topic:** Full Parity Port of Fumadocs Layout Architectures (Docs, Spacious, Notebook, Glass, Flux) to `@cms/site` & Interactive Layout Sandbox in Studio

---

## 1. Executive Summary & Objective

The objective of this design is to achieve complete 1:1 visual, structural, and behavioral parity with Fumadocs layout architectures (`https://www.fumadocs.dev/docs/ui/layouts/spacious` and upstream source at `C:\Users\Admin\Downloads\fumadocs\packages\radix-ui\src\layouts` and `packages\base-ui\src\layouts`).

Earlier layout implementations in `@cms/site` approximated the visual themes using simplified flex containers, but lacked Fumadocs' signature CSS grid engine, collapsible sidebar transitions with hover peek triggers, internal panel scroll mechanics (Spacious), floating dock controls (Flux), and interactive preview sandbox (`layouts.story.tsx`).

This specification details:
1. Rewriting all 5 documentation layouts (`docs`, `spacious`, `notebook`, `glass`, `flux`) in [`packages/site/src/layouts/`](file:///d:/Workspace/Software/_working/cms-rs-3/packages/site/src/layouts/) using Fumadocs' CSS Grid template structure, CSS variables, and slot mappings.
2. Aligning the documentation chrome and page views (`SiteLayout.tsx`, `site-page-view.tsx`, and `documentation-theme-provider.tsx`) to dispatch to these grid areas.
3. Implementing an interactive **macOS-style Layout Sandbox** in Studio (`DocsLayoutSandbox`) modeled after Fumadocs' `StoryWindow` and `layouts.story.tsx`, providing live controls for theme switching, collapsible sidebar toggle, tab modes, and search triggers.

---

## 2. Upstream Reference Architecture

From the cloned Fumadocs repository:
- `packages/radix-ui/src/layouts/`:
  - `docs/`: Multi-column CSS grid (`#nd-docs-layout`) mapping `sidebar`, `header`, `tabs`, `main`, and `toc`, with collapsible sidebar hovering.
  - `notebook/`: Centered reading canvas (`#nd-notebook-layout`) on a tinted card backdrop.
  - `glass/`: Multi-track grid (`#fd-glass-layout`) with floating translucent header and frosted glass sidebar.
  - `flux/`: Full-width distraction-free canvas (`#nd-flux-layout`) with floating bottom dock (`NavigationPanel`).
  - `shared/`: Language select, search triggers, link items, and dock buttons.
- `packages/base-ui/src/layouts/`:
  - `spacious/`: Viewport-locked desktop grid (`#fd-spacious-layout`) with borderless sidebar and inset panel (`#nd-page-panel`) that features **internal panel scrolling** (`md:overflow-y-auto md:overscroll-y-contain`), top header fade, and integrated TOC.
- `apps/docs/components/layout-preview/`:
  - `window.tsx`: Apple macOS window chrome (`StoryWindow`) with red, yellow, and green traffic lights.
  - `demo.tsx`: Realistic sample documentation content and layout options builder.
  - `layouts.story.tsx`: Interactive control wrapper (`WithControl`) for live option tweaking.

---

## 3. CSS Grid Engine & Variables

All layouts will utilize standardized Fumadocs CSS variables and grid templates:

### 3.1 CSS Variables
- `--fd-docs-height`: `100dvh` (or `calc(100dvh - var(--fd-banner-height, 0px))`).
- `--fd-header-height`: `3.5rem` (`56px`).
- `--fd-sidebar-width`: `268px` on desktop.
- `--fd-sidebar-col`: Animatable length property (`0px` when collapsed, `var(--fd-sidebar-width)` when expanded).
- `--fd-toc-width`: `260px` on desktop.
- `--fd-page-width`: Content measure (`760px` default, `1200px` for wide pages).
- `--fd-docs-row-1`, `--fd-docs-row-2`, `--fd-docs-row-3`: Vertical offsets for banners, headers, and popovers.

### 3.2 Layout Slots Contract ([`packages/site/src/layouts/types.ts`](file:///d:/Workspace/Software/_working/cms-rs-3/packages/site/src/layouts/types.ts))

```ts
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

export interface DocsLayoutTemplate {
  id: DocsLayoutId;
  ReaderLayout: (slots: DocsLayoutSlots) => ReactNode;
  ProjectPreviewLayout: (slots: ProjectPreviewSlots) => ReactNode;
  StudioPreviewLayout: (slots: StudioPreviewSlots) => ReactNode;
  PageLayout: (slots: DocsPageSlots) => ReactNode;
}
```

---

## 4. The 5 Rewritten Layouts

### 4.1 Spacious Layout ([`packages/site/src/layouts/spacious-layout.tsx`](file:///d:/Workspace/Software/_working/cms-rs-3/packages/site/src/layouts/spacious-layout.tsx))
- **Shell (`#fd-spacious-layout`):**
  - Height locked on desktop: `md:h-(--fd-layout-height) md:overflow-clip`.
  - Grid: `"sidebar header right" auto / "sidebar toc-popover right" var(...) / "sidebar main right" 1fr / var(--fd-sidebar-col) minmax(0, 1fr) auto`.
  - Subtle tinted background: `bg-card/40 dark:bg-card/20`.
- **Sidebar:** Borderless left rail (`border-e-0`) directly on canvas with search, tabs, tree, and bottom dock.
- **Inset Panel (`#nd-page-panel`):**
  - Inset rounded container: `mx-2 bg-background md:ms-0 md:my-2 md:overflow-clip md:rounded-2xl md:border md:shadow-xs`.
  - **Internal Scrolling:** Desktop scrolling occurs within this panel: `md:overflow-y-auto md:overscroll-y-contain md:scrollbar-thin`.
  - **Panel Header:** Absolute top fade with Expand Sidebar trigger, Breadcrumbs, TOC popover dropdown, and Action tools.
  - **Page & TOC:** Article measure and sticky Table of Contents sit side-by-side inside the panel.

### 4.2 Standard Docs Layout ([`packages/site/src/layouts/docs-layout.tsx`](file:///d:/Workspace/Software/_working/cms-rs-3/packages/site/src/layouts/docs-layout.tsx))
- **Shell (`#nd-docs-layout`):**
  - Multi-track CSS grid:
    ```
    "sidebar sidebar header toc toc"
    "sidebar sidebar toc-popover toc toc"
    "sidebar sidebar tabs toc toc"
    "sidebar sidebar main toc toc" 1fr / minmax(min-content, 1fr) var(--fd-sidebar-col) minmax(0, calc(var(--fd-layout-width,97rem) - var(--fd-sidebar-width) - var(--fd-toc-width))) var(--fd-toc-width) minmax(min-content, 1fr)
    ```
- **Collapsible Sidebar:** Sits in `[grid-area:sidebar]`. Supports collapsing with interactive hover peek trigger (`hovered` triggers `shadow-lg translate-x-2`).
- **Header & Tabs:** Desktop header in `[grid-area:header]`, category tabs in `[grid-area:tabs]`.
- **Page & TOC:** Content in `[grid-area:main]`, sticky Table of Contents in `[grid-area:toc]`.

### 4.3 Notebook Layout ([`packages/site/src/layouts/notebook-layout.tsx`](file:///d:/Workspace/Software/_working/cms-rs-3/packages/site/src/layouts/notebook-layout.tsx))
- **Shell (`#nd-notebook-layout`):**
  - Grid: `sidebar sidebar header header .` / `sidebar sidebar main toc .` on tinted canvas (`bg-muted/40 dark:bg-muted/20`).
  - Elevated central paper sheet (`data-layout-content`, max-width 900px, centered with soft border & elevation).
  - Margin outline on the right (`[grid-area:toc]`) and compact sidebar on the left.

### 4.4 Glass Layout ([`packages/site/src/layouts/glass-layout.tsx`](file:///d:/Workspace/Software/_working/cms-rs-3/packages/site/src/layouts/glass-layout.tsx))
- **Shell (`#fd-glass-layout`):**
  - Multi-track grid: `"left left-margin main right-margin right" 1fr / var(--fd-left-width) ... 1fr ... var(--fd-right-width)`.
  - Translucent floating top navbar with `backdrop-blur-md bg-background/70 border border-border/60 shadow-sm rounded-2xl`.
  - Floating frosted glass sidebar elevated with backdrop blur.

### 4.5 Flux Layout ([`packages/site/src/layouts/flux-layout.tsx`](file:///d:/Workspace/Software/_working/cms-rs-3/packages/site/src/layouts/flux-layout.tsx))
- **Shell (`#nd-flux-layout`):**
  - Distraction-free full-width canvas.
  - Collapsible minimalist sidebar rail.
  - **Floating Bottom Navigation Panel (`NavigationPanel`):**
    - Fixed bottom pill: `fixed left-1/2 -translate-x-1/2 bottom-0 sm:bottom-6 sm:rounded-2xl border bg-popover text-popover-foreground shadow-lg`.
    - Integrated brand, tab dropdown, search trigger, icon links, and theme toggle.
    - Smooth animated scale and translation on search open.

---

## 5. Interactive macOS-Style Layout Sandbox in Studio

Located at [`apps/studio/src/features/project-settings/components/docs-layout-sandbox.tsx`](file:///d:/Workspace/Software/_working/cms-rs-3/apps/studio/src/features/project-settings/components/docs-layout-sandbox.tsx):

### 5.1 macOS Window Frame (`StoryWindow`)
- Modeled after Fumadocs' `StoryWindow`.
- Header bar with Apple traffic light dots: red (`#ff5f57`), yellow (`#febc2e`), and green (`#28c840`).
- Elegant framed viewport with background wallpaper styling and elevation shadow.

### 5.2 Live Controls (`WithControl`)
- **Layout Selector:** Switch between `Standard Docs`, `Spacious`, `Notebook`, `Glass`, and `Flux`.
- **Collapsible Sidebar Toggle:** Test collapsing and hover behavior.
- **Theme Switcher:** Toggle light and dark mode within the sandbox.
- **Tab Mode Switcher:** Test `auto`, `top`, or `sidebar` tab placements.
- **Search Toggle:** Test full search input vs icon trigger.

### 5.3 Studio Settings Integration
- In [`apps/studio/src/features/project-settings/components/theme-section.tsx`](file:///d:/Workspace/Software/_working/cms-rs-3/apps/studio/src/features/project-settings/components/theme-section.tsx), authors can toggle between the quick **Thumbnail Cards** and the **Interactive Sandbox**.
- Selecting any layout in the sandbox directly updates the project's draft theme layout configuration.

---

## 6. Verification Plan

1. **Unit & Render Tests:**
   - Verify all 5 layout templates mount their respective DOM elements (`#nd-docs-layout`, `#fd-spacious-layout`, `#nd-notebook-layout`, `#fd-glass-layout`, `#nd-flux-layout`).
   - Verify Spacious layout has `#nd-page-panel` with internal scrolling classes.
   - Verify Flux layout mounts `NavigationPanel` bottom dock.
   - Run `bun test packages/site` to confirm all tests pass.
2. **Typecheck:**
   - Run `bun run typecheck` across `@cms/site`, `@cms/studio`, `@cms/shared`.
3. **Interactive Browser Verification:**
   - Open reader at `http://localhost:4310/sites/34c59d77-9474-439f-918e-40193594770d` and test Spacious, Docs, Notebook, Glass, and Flux layouts.
   - Open Studio Editor Settings at `http://localhost:4310/app/projects/34c59d77-9474-439f-918e-40193594770d/editor`, open the Theme settings, and interact with the macOS Layout Sandbox.
