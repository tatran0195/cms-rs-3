# Design Spec: Fumadocs Centralized Docs Body & Smooth Scroll

## Problem Statement
The current documentation reader layout differs significantly from Fumadocs:
1. **Unbalanced Spacing & Off-Center Body**: On wide viewports (e.g. 1920px), the docs body hugs the left sidebar while leaving an awkward 600px+ empty void to the right of the text. This is caused by `--fd-layout-width: 100%` in `globals.css` (which collapses the grid margin columns) and Tailwind's default `.prose` `max-width: 65ch` constraint on `DocsBody`.
2. **Awkward Card Outline**: The document body in standard reader mode has a card/box border and shadow instead of flowing naturally and flatly on the canvas like Fumadocs.
3. **Scroll Jitter & Nested Sticky**: Clicking in-page TOC anchors or scrolling is not smooth. `toc.tsx` has duplicate nested sticky positioning (`sticky top-[...]` inside an outer sticky container), causing jerky jumps and mismatched anchor highlights.

## Goals
- Replicate Fumadocs' standard documentation layout grid: centered 3-column system with `--fd-layout-width: 1600px` (or `97rem`), `--fd-page-width: 900px` (`1168px` in full mode), and equal outer margin columns on wide viewports.
- Remove unwanted card boxing around `#nd-page` on the standard reader so the document content flows seamlessly.
- Ensure `DocsBody` fills the `900px` reading column using `max-w-none` on `.prose`.
- Provide smooth native window scrolling with accurate `scroll-margin-top` for headings and clean single-container sticky TOC navigation without jitter.
- Match Fumadocs' sidebar active pill styling (`bg-primary/10 text-primary font-medium rounded-lg`) and clean typography hierarchy.

---

## Architecture & Implementation Details

### 1. Root Tokens & Grid Dimensions
- **File**: `packages/design-system/src/styles/globals.css`
  - Update `--fd-layout-width: 1600px` (matching Fumadocs default instead of `100%`).
  - Set `--fd-page-width: 900px`, `--fd-sidebar-width: 268px`, `--fd-toc-width: 268px`.
  - Ensure `--fd-layout-offset: max(calc(50vw - var(--fd-layout-width) / 2), 0px)`.

### 2. Standard Docs Layout Shell
- **File**: `packages/site/src/layouts/docs/slots/container.tsx`
  - Maintain the 5-column CSS grid:
    ```css
    grid-template:
      "sidebar sidebar header toc toc"
      "sidebar sidebar toc-popover toc toc"
      "sidebar sidebar tabs toc toc"
      "sidebar sidebar main toc toc" 1fr /
      minmax(min-content, 1fr)
      var(--fd-sidebar-col)
      minmax(0, calc(var(--fd-layout-width, 1600px) - var(--fd-sidebar-width) - var(--fd-toc-width)))
      var(--fd-toc-width)
      minmax(min-content, 1fr);
    ```
  - When the screen width exceeds 1600px (e.g. 1920px), the outer columns expand to `(1920px - 1600px) / 2 = 160px` each, maintaining perfect optical centering of the docs reader.

### 3. Page Container & Docs Body Sizing
- **File**: `packages/site/src/layouts/docs/page/slots/container.tsx`
  - `<main className="grid [grid-area:main] justify-items-center w-full min-w-0" data-layout-main="">`
  - `<article id="nd-page" ... className={cn('flex flex-col min-w-0 w-full max-w-[var(--fd-page-width,900px)] px-4 py-6 gap-4 md:px-6 md:pt-8 xl:px-8 xl:pt-14', full && 'max-w-[1168px]', className)}>`
  - Ensure no `border`, `bg-card`, or `shadow-sm` wraps `#nd-page` in the standard docs reader.
- **File**: `packages/site/src/layouts/docs/page/index.tsx`
  - `DocsBody`: `<div {...props} className={cn('prose max-w-none flex-1 min-w-0 w-full', className)}>{children}</div>`.
  - Adding `max-w-none` removes the 65ch cut-off, allowing headings, paragraphs, tables, and codeblocks to cleanly occupy the 900px reading width without a void on the right.

### 4. Smooth Scrolling & TOC Refactoring
- **File**: `packages/site/src/views/SiteLayout.tsx` & `packages/site/src/components/markdown.tsx`
  - Add `scroll-smooth` to `html` or the scroll container.
  - Headings in `markdown.tsx` receive `scroll-mt-[calc(var(--fd-header-height,3.5rem)+1.5rem)]` so in-page links don't get hidden underneath sticky headers.
- **File**: `packages/site/src/components/toc.tsx`
  - Remove inner `sticky top-[...] max-h-[...]` from `TableOfContentsInner` when rendered inside `TOC` slot.
  - Let the outer `aside#nd-toc` manage sticky docking (`sticky top-[var(--fd-docs-row-1,0px)] h-[calc(100dvh-var(--fd-docs-row-1,0px))]`).
  - Use `TOCScrollArea` with smooth native scrolling.
  - Ensure active heading highlights transition smoothly without layout jump.

### 5. Sidebar Active States & Typography Polish
- **File**: `packages/site/src/components/sidebar-tree.tsx` / `packages/site/src/layouts/docs/slots/sidebar.tsx`
  - Style active tree items with Fumadocs pill styling: `bg-primary/10 text-primary font-medium rounded-lg`.
  - Maintain clean spacing, hover feedback, and collapsible section indicators.

---

## Verification & Testing
- **Unit Tests**:
  - Run existing test suites: `bun test packages/site/src/layouts/docs-layout.test.tsx` and `bun test packages/site/src/layouts/layouts.test.tsx`.
  - Verify container grid calculations and slot placement.
- **Visual & Browser Verification**:
  - Open `http://localhost:4310/sites/34c59d77-9474-439f-918e-40193594770d/...` in browser.
  - Inspect layout at 1920px: confirm sidebar, docs body, and TOC are centralized with balanced outer margins.
  - Verify the docs body is 900px wide without right-side blank space or card boxing.
  - Click multiple TOC headings: confirm smooth animated scroll and accurate active anchor tracking.
