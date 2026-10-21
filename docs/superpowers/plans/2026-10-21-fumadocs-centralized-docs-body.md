# Fumadocs Centralized Docs Body & Smooth Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replicate Fumadocs' standard documentation layout with a centered 3-column grid (`--fd-layout-width: 1600px`), fluid 900px docs body without artificial card wrapping or right-hand dead space, smooth native scrolling with accurate heading anchor offsets, and single-sticky TOC tracking.

**Architecture:** Update design system layout tokens so the outer CSS grid columns act as dynamic centering margins on viewports wider than 1600px. Refactor `DocsBody` with `max-w-none` to remove the 65ch cut-off. Eliminate redundant inner sticky styles in `toc.tsx` in favor of single-container sticky docking and smooth window scroll.

**Tech Stack:** React 19, Tailwind CSS v4, TypeScript, Bun Test, Biome.

## Global Constraints
- Internal company platform scope: no plan, billing, or pricing features.
- Preserve all existing comments and docstrings.
- Adhere to Fumadocs standard layout geometry (`--fd-layout-width: 1600px`, `--fd-page-width: 900px`, `--fd-sidebar-width: 268px`, `--fd-toc-width: 268px`).

---

### Task 1: Fix CSS Grid Tokens & Shell Alignment

**Files:**
- Modify: `packages/design-system/src/styles/globals.css:82-125`
- Modify: `packages/site/src/layouts/docs/slots/container.tsx:18-35`
- Test: `packages/site/src/layouts/docs-layout.test.tsx`

**Interfaces:**
- Consumes: Design system `@theme inline` variables
- Produces: Updated `--fd-layout-width: 1600px` and aligned grid template columns

- [ ] **Step 1: Write test for grid layout width and template columns**

Update `packages/site/src/layouts/docs-layout.test.tsx`:
```tsx
import { describe, expect, it } from 'bun:test';
import { render } from '@testing-library/react';
import { DocsStandardLayoutTemplate } from './docs-layout';

describe('DocsStandardLayoutTemplate', () => {
  it('renders #nd-docs-layout with 1600px layout width grid', () => {
    const { container } = render(
      DocsStandardLayoutTemplate.ReaderLayout({
        header: <header>Header</header>,
        navigation: <nav>Nav</nav>,
        content: <main>Content</main>,
        brand: <div>Brand</div>,
        tools: <div>Tools</div>,
      })
    );

    const layout = container.querySelector('#nd-docs-layout');
    expect(layout).not.toBeNull();
    const style = layout?.getAttribute('style');
    expect(style).toContain('1600px');
  });
});
```

- [ ] **Step 2: Run test to observe failure**

Run: `bun test packages/site/src/layouts/docs-layout.test.tsx`
Expected: FAIL if style contains `100%` instead of `1600px`

- [ ] **Step 3: Update `globals.css` and `container.tsx`**

In `packages/design-system/src/styles/globals.css`:
```css
  --spacing-fd-container: 1400px;
  --fd-page-width: 900px;
  --fd-sidebar-width: 268px;
  --fd-toc-width: 268px;
  --fd-layout-width: 1600px;
```
and in `:root`:
```css
  --fd-page-width: 900px;
  --fd-layout-width: 1600px;
```

In `packages/site/src/layouts/docs/slots/container.tsx`:
```tsx
      style={
        {
          gridTemplate: `"sidebar sidebar header toc toc"
"sidebar sidebar toc-popover toc toc"
"sidebar sidebar tabs toc toc"
"sidebar sidebar main toc toc" 1fr / minmax(min-content, 1fr) var(--fd-sidebar-col) minmax(0, calc(var(--fd-layout-width,1600px) - var(--fd-sidebar-width) - var(--fd-toc-width))) var(--fd-toc-width) minmax(min-content, 1fr)`,
          '--fd-docs-row-1': 'var(--fd-banner-height, 0px)',
          '--fd-docs-row-2': 'calc(var(--fd-docs-row-1) + var(--fd-header-height, 0px))',
          '--fd-docs-row-3': 'calc(var(--fd-docs-row-2) + var(--fd-toc-popover-height, 0px))',
          '--fd-sidebar-col': collapsed ? '0px' : 'var(--fd-sidebar-width)',
          ...style,
        } as CSSProperties
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/site/src/layouts/docs-layout.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/design-system/src/styles/globals.css packages/site/src/layouts/docs/slots/container.tsx packages/site/src/layouts/docs-layout.test.tsx
git commit -m "feat(site): update layout width to 1600px for centered documentation grid"
```

---

### Task 2: Centralize Docs Page & DocsBody Width

**Files:**
- Modify: `packages/site/src/layouts/docs/page/slots/container.tsx:6-25`
- Modify: `packages/site/src/layouts/docs/page/index.tsx:35-41`
- Test: `packages/site/src/layouts/layouts.test.tsx`

**Interfaces:**
- Consumes: `DocsPageProps`, `DocsBody`
- Produces: Unboxed `#nd-page` container with `max-w-none` typography

- [ ] **Step 1: Write test for unboxed article and full-width prose**

In `packages/site/src/layouts/layouts.test.tsx`:
```tsx
  it('renders DocsBody with max-w-none so it occupies full reading width', () => {
    const { container } = render(
      <DocsPage>
        <DocsBody data-testid="test-body">Body Content</DocsBody>
      </DocsPage>
    );

    const body = container.querySelector('[data-testid="test-body"]');
    expect(body?.className).toContain('max-w-none');
    expect(body?.className).toContain('prose');
  });
```

- [ ] **Step 2: Run test to observe failure**

Run: `bun test packages/site/src/layouts/layouts.test.tsx`
Expected: FAIL because `max-w-none` is missing

- [ ] **Step 3: Update `DocsBody` and `Container`**

In `packages/site/src/layouts/docs/page/index.tsx`:
```tsx
export function DocsBody({ children, className, ...props }: ComponentProps<'div'>) {
  return (
    <div {...props} className={cn('prose max-w-none flex-1 min-w-0 w-full', className)}>
      {children}
    </div>
  );
}
```

In `packages/site/src/layouts/docs/page/slots/container.tsx`:
```tsx
export function Container({ className, children, full, ...props }: ComponentProps<'article'> & { full?: boolean }) {
  return (
    <main className="grid [grid-area:main] justify-items-center w-full min-w-0" data-layout-main="">
      <article
        id="nd-page"
        data-layout-content=""
        data-theme-region="article"
        data-full={full}
        {...props}
        className={cn(
          'flex flex-col min-w-0 w-full max-w-[var(--fd-page-width,900px)] px-4 py-6 gap-4 md:px-6 md:pt-8 xl:px-8 xl:pt-14',
          full && 'max-w-[1168px]',
          className,
        )}
      >
        {children}
      </article>
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/site/src/layouts/layouts.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/site/src/layouts/docs/page/slots/container.tsx packages/site/src/layouts/docs/page/index.tsx packages/site/src/layouts/layouts.test.tsx
git commit -m "feat(site): ensure DocsBody fills 900px reading column with max-w-none"
```

---

### Task 3: Smooth Scrolling & Single-Sticky Table of Contents Refactor

**Files:**
- Modify: `packages/site/src/views/SiteLayout.tsx:595-605`
- Modify: `packages/site/src/components/markdown.tsx:180-195`
- Modify: `packages/site/src/components/toc.tsx:906-920`
- Modify: `packages/site/src/layouts/docs/page/slots/toc.tsx:18-32`
- Test: `packages/site/src/components/toc.test.tsx`

**Interfaces:**
- Consumes: TOC heading list, scroll events
- Produces: Smooth native window scroll with accurate sticky TOC tracking

- [ ] **Step 1: Write test for TableOfContentsInner container class**

In `packages/site/src/components/toc.test.tsx`:
Verify `TableOfContents` does not apply redundant inner `sticky` or `max-h` when rendered inside an outer sticky TOC container.

- [ ] **Step 2: Run test to observe behavior**

Run: `bun test packages/site/src/components/toc.test.tsx`

- [ ] **Step 3: Update `SiteLayout.tsx`, `markdown.tsx`, and `toc.tsx`**

In `packages/site/src/views/SiteLayout.tsx`:
Add `scroll-smooth` to the root reader wrapper.

In `packages/site/src/components/markdown.tsx`:
Ensure headings use consistent `scroll-mt-[calc(var(--fd-header-height,3.5rem)+1.5rem)]`:
```tsx
const htmlComponents: Components = {
  h1: (props) => <h1 className="scroll-mt-[calc(var(--fd-header-height,3.5rem)+1.5rem)]" {...props} />,
  h2: (props) => <h2 className="scroll-mt-[calc(var(--fd-header-height,3.5rem)+1.5rem)]" {...props} />,
  h3: (props) => <h3 className="scroll-mt-[calc(var(--fd-header-height,3.5rem)+1.5rem)]" {...props} />,
  h4: (props) => <h4 className="scroll-mt-[calc(var(--fd-header-height,3.5rem)+1.5rem)]" {...props} />,
...
```

In `packages/site/src/components/toc.tsx`:
In `TableOfContentsInner`:
```tsx
  return (
    <div
      data-toc-style={style}
      className={cn('w-full select-none', className)}
    >
      {Boolean(label) && (
        <h3 id="toc-title" className="mb-2 flex items-center gap-1.5 font-medium text-muted-foreground text-sm">
          <Text className="size-4 shrink-0 rtl:-scale-x-100" aria-hidden />
          {label}
        </h3>
      )}
      <TOCScrollArea>
        ...
      </TOCScrollArea>
    </div>
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/site/src/components/toc.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/site/src/views/SiteLayout.tsx packages/site/src/components/markdown.tsx packages/site/src/components/toc.tsx packages/site/src/layouts/docs/page/slots/toc.tsx
git commit -m "feat(site): enable smooth scrolling and clean up single-sticky TOC container"
```

---

### Task 4: Sidebar Navigation Active State & Visual Polish

**Files:**
- Modify: `packages/site/src/components/sidebar-tree.tsx`
- Modify: `packages/site/src/layouts/docs/slots/sidebar.tsx`
- Test: `packages/site/src/components/sidebar-tree.test.tsx`

**Interfaces:**
- Consumes: Sidebar tree nodes
- Produces: Fumadocs-style active pills and clean spacing

- [ ] **Step 1: Check existing sidebar tests**

Run: `bun test packages/site/src/components/sidebar-tree.test.tsx`

- [ ] **Step 2: Update active item styling to match Fumadocs**

In `packages/site/src/components/sidebar-tree.tsx`:
Ensure active link items apply:
`data-[active=true]:bg-primary/10 data-[active=true]:text-primary font-medium rounded-lg px-2.5 py-1.5 transition-colors`
with clear optical contrast.

- [ ] **Step 3: Run test to verify it passes**

Run: `bun test packages/site/src/components/sidebar-tree.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/site/src/components/sidebar-tree.tsx packages/site/src/layouts/docs/slots/sidebar.tsx
git commit -m "feat(site): polish sidebar active pill styling and spacing"
```

---

### Task 5: End-to-End Verification, Formatting & Browser Inspection

**Files:**
- All touched files

- [ ] **Step 1: Run all tests in packages/site**

Run: `bun test packages/site`
Expected: All tests PASS

- [ ] **Step 2: Run Biome formatter**

Run: `bun format`
Expected: Clean check with 0 errors

- [ ] **Step 3: Browser inspection on localhost:4310**

Use the browser subagent to inspect `http://localhost:4310/sites/34c59d77-9474-439f-918e-40193594770d/v2.1/releases/v2.1-component-standard-006`:
1. Confirm the docs body is centered on screen.
2. Confirm the 900px reading width has balanced outer margins without huge right-hand void.
3. Test clicking TOC links: confirm smooth scroll and correct heading alignment.
