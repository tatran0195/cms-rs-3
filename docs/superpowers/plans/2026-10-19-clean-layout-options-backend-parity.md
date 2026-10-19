# Clean Layout Options & Backend/Reader Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate documentation layout and chrome configuration (header transparency, multi-mode theme switcher, desktop sidebar collapse, and table of contents styling) directly into the first-class `ThemeLayout` schema, persist it in PostgreSQL via project configuration, and execute it faithfully in both the Studio theme editor and the live documentation reader.

**Architecture:** Extend `@cms/shared` and `@cms/validators` with clean `ThemeLayout` options (no vendor/fumadocs prefixes). Refactor the Studio theme settings to edit `draft.theme.layout` directly so edits mark the form dirty and save to `Project.config.theme` in PostgreSQL. Upgrade `packages/site` reader views and layouts to dynamically execute header transparency, segmented theme switches, collapsible sidebars, and styled TOCs.

**Tech Stack:** TypeScript, React 19, Zod, Tailwind CSS v4, PostgreSQL JSONB, `@cms/shared`, `@cms/validators`, `@cms/site`, `@cms/studio`.

## Global Constraints

- Internal company deployment only: DO NOT introduce any Plan, Billing, Subscription, or Pricing features.
- No marketing, landing, or promotional pages.
- Zero ad-hoc vendor signatures: No fields, models, or CSS classes named `fumadocs` (e.g. rename `FumadocsLayoutOptions`, `ThemeFumadocsStory`, `data-documentation-layout="fumadocs-docs"`).
- Strict typing and linting: All code must pass `bun run typecheck` and `bun run check` (Biome/Ultracite) with 0 errors.

---

### Task 1: Core Layout Schema & Validator Extension in `@cms/shared` and `@cms/validators`

**Files:**
- Modify: `packages/shared/src/themes.ts`
- Modify: `packages/validators/src/themes.ts`
- Modify: `packages/validators/src/themes.test.ts`

**Interfaces:**
- Produces:
  - `ThemeLayout` extended with:
    - `headerTransparentMode?: 'none' | 'top' | 'always'`
    - `sidebarCollapsible?: boolean`
    - `sidebarDefaultOpenLevel?: number`
    - `themeSwitchMode?: 'light-dark' | 'light-dark-system' | 'button' | 'dropdown'`
    - `themeSwitchEnabled?: boolean`
    - `tocStyle?: 'normal' | 'clerk' | 'block'`
    - `tocDepth?: number`
  - `resolveTheme(config)`: resolves these fields with clean defaults.
  - `themeConfigSchema.layout`: Zod schema validating the new fields.

- [ ] **Step 1: Write failing validator tests for new layout fields**

Add tests to `packages/validators/src/themes.test.ts`:
```typescript
import { describe, expect, it } from 'bun:test';
import { themeConfigSchema } from './themes';

describe('themeConfigSchema.layout options', () => {
  it('validates headerTransparentMode, sidebarCollapsible, themeSwitchMode, and tocStyle', () => {
    const valid = themeConfigSchema.safeParse({
      version: 1,
      layout: {
        headerTransparentMode: 'top',
        sidebarCollapsible: true,
        sidebarDefaultOpenLevel: 1,
        themeSwitchMode: 'light-dark-system',
        themeSwitchEnabled: true,
        tocStyle: 'clerk',
        tocDepth: 3,
      },
    });
    expect(valid.success).toBe(true);
  });

  it('rejects invalid layout enum values', () => {
    const invalid = themeConfigSchema.safeParse({
      version: 1,
      layout: {
        headerTransparentMode: 'invalid-mode',
      },
    });
    expect(invalid.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run validator tests to verify failure**

Run: `bun --filter @cms/validators test`
Expected: FAIL due to unknown keys or unaccepted layout fields in schema.

- [ ] **Step 3: Update `packages/shared/src/themes.ts`**

Update `ThemeLayout` interface and `resolveTheme` in `packages/shared/src/themes.ts`:
```typescript
export interface ThemeLayout {
  shell: 'reference' | 'editorial' | 'console';
  docsLayout?: DocsLayoutId;
  density: 'compact' | 'comfortable' | 'relaxed';
  radius: 'sharp' | 'rounded' | 'pill';
  contentWidth: 'focused' | 'balanced' | 'wide';
  header: 'inline' | 'stacked' | 'floating';
  headerTransparentMode?: 'none' | 'top' | 'always';
  sidebar: 'bordered' | 'soft' | 'rail';
  sidebarCollapsible?: boolean;
  sidebarDefaultOpenLevel?: number;
  navigation: 'tree' | 'sectioned' | 'compact';
  themeSwitchMode?: 'light-dark' | 'light-dark-system' | 'button' | 'dropdown';
  themeSwitchEnabled?: boolean;
  tocStyle?: 'normal' | 'clerk' | 'block';
  tocDepth?: number;
}
```

Ensure `resolveTheme` populates default values:
```typescript
headerTransparentMode: layout?.headerTransparentMode ?? 'none',
sidebarCollapsible: layout?.sidebarCollapsible ?? true,
sidebarDefaultOpenLevel: layout?.sidebarDefaultOpenLevel ?? 0,
themeSwitchMode: layout?.themeSwitchMode ?? 'light-dark',
themeSwitchEnabled: layout?.themeSwitchEnabled ?? true,
tocStyle: layout?.tocStyle ?? 'normal',
tocDepth: layout?.tocDepth ?? 3,
```

- [ ] **Step 4: Update `packages/validators/src/themes.ts`**

Extend `themeConfigSchema`:
```typescript
layout: z
  .object({
    shell: z.enum(['reference', 'editorial', 'console']).optional(),
    docsLayout: z.enum(DOCS_LAYOUT_IDS).optional(),
    density: z.enum(['compact', 'comfortable', 'relaxed']).optional(),
    radius: z.enum(['sharp', 'rounded', 'pill']).optional(),
    contentWidth: z.enum(['focused', 'balanced', 'wide']).optional(),
    header: z.enum(['inline', 'stacked', 'floating']).optional(),
    headerTransparentMode: z.enum(['none', 'top', 'always']).optional(),
    sidebar: z.enum(['bordered', 'soft', 'rail']).optional(),
    sidebarCollapsible: z.boolean().optional(),
    sidebarDefaultOpenLevel: z.number().int().min(0).max(6).optional(),
    navigation: z.enum(['tree', 'sectioned', 'compact']).optional(),
    themeSwitchMode: z.enum(['light-dark', 'light-dark-system', 'button', 'dropdown']).optional(),
    themeSwitchEnabled: z.boolean().optional(),
    tocStyle: z.enum(['normal', 'clerk', 'block']).optional(),
    tocDepth: z.number().int().min(1).max(6).optional(),
  })
  .strict()
  .optional(),
```

- [ ] **Step 5: Run tests and verify they pass**

Run: `bun --filter @cms/validators test`
Expected: PASS with 0 errors.

- [ ] **Step 6: Commit Task 1**

```bash
git add packages/shared/src/themes.ts packages/validators/src/themes.ts packages/validators/src/themes.test.ts
git commit -m "feat(shared,validators): add clean layout options to ThemeLayout and schema"
```

---

### Task 2: Refactor Studio Theme Editor & State Persistence in `apps/studio`

**Files:**
- Modify: `apps/studio/src/features/project-settings/components/theme/types.ts`
- Modify: `apps/studio/src/features/project-settings/components/theme/theme-props-table.tsx`
- Rename & Modify: `apps/studio/src/features/project-settings/components/theme/theme-fumadocs-story.tsx` ➔ `apps/studio/src/features/project-settings/components/theme/theme-playground-story.tsx`
- Modify: `apps/studio/src/features/project-settings/components/theme/theme-story-window.tsx`
- Modify: `apps/studio/src/features/project-settings/components/theme-section.tsx`
- Modify: `apps/studio/src/features/project-settings/components/theme/index.ts`

**Interfaces:**
- Consumes: `ThemeLayout`, `resolveTheme`, `cmsThemeConfig` from `@cms/shared/themes`.
- Produces: Direct synchronization of `draft.theme.layout` in `ThemeSection`. Modifying any layout property marks `hasChanges = true`, and saving triggers `useUpdateProjectConfig({ config: { ... } })`.

- [ ] **Step 1: Clean up `types.ts`**

In `apps/studio/src/features/project-settings/components/theme/types.ts`:
- Replace `FumadocsLayoutOptions` with clean layout categories:
```typescript
export type PropsTablePathCategory = 'header' | 'sidebar' | 'themeSwitch' | 'toc' | 'palette' | 'layout' | 'components';
export type PropsTablePath = [] | [PropsTablePathCategory];
```

- [ ] **Step 2: Update `theme-props-table.tsx` to directly bind to `themeConfig.layout`**

Update `ThemePropsTable`:
- Change root rows to display `layout`, `header`, `sidebar`, `themeSwitch`, `toc`, `palette`, `components`.
- In `header` drill-down:
  - `headerTransparentMode`: Enum select (`none`, `top`, `always`).
- In `sidebar` drill-down:
  - `sidebarCollapsible`: Boolean switch.
  - `sidebarDefaultOpenLevel`: Number input (0-6).
- In `themeSwitch` drill-down:
  - `themeSwitchEnabled`: Boolean switch.
  - `themeSwitchMode`: Enum select (`light-dark`, `light-dark-system`, `button`, `dropdown`).
- In `toc` drill-down:
  - `tocStyle`: Enum select (`normal`, `clerk`, `block`).
  - `tocDepth`: Number input (2, 3, 4).
- Mutate via `onThemeConfigChange((prev) => ({ ...prev, layout: { ...prev.layout, [key]: val } }))`.

- [ ] **Step 3: Rename `theme-fumadocs-story.tsx` to `theme-playground-story.tsx`**

Update the component export to `ThemePlaygroundStory`:
- Pass `resolvedLayout` directly to `ThemeStoryWindow`.
- Export cleanly from `apps/studio/src/features/project-settings/components/theme/index.ts`.

- [ ] **Step 4: Update `theme-section.tsx`**

In `apps/studio/src/features/project-settings/components/theme-section.tsx`:
- Remove disconnected `useState(DEFAULT_FUMADOCS_LAYOUT_OPTIONS)`.
- Wire `draft.theme.layout` directly to the story and props table.
- Verify `hasChanges = JSON.stringify(draft) !== JSON.stringify(saved)` reacts when changing any layout property.
- Verify save payload includes `draft.theme.layout`.

- [ ] **Step 5: Run Studio typecheck & test**

Run: `bun --filter @cms/studio test`
Expected: PASS with 0 errors.

- [ ] **Step 6: Commit Task 2**

```bash
git add apps/studio/src/features/project-settings/components/theme/ apps/studio/src/features/project-settings/components/theme-section.tsx
git commit -m "refactor(studio): bind theme settings directly to ThemeLayout persistence"
```

---

### Task 3: Header Transparency Execution in `packages/site`

**Files:**
- Create: `packages/site/src/hooks/use-is-scroll-top.ts`
- Modify: `packages/site/src/views/SiteLayout.tsx`
- Modify: `packages/site/src/layouts/docs-layout.tsx`
- Modify: `packages/site/src/layouts/flux-layout.tsx`
- Modify: `packages/site/src/layouts/glass-layout.tsx`
- Modify: `packages/site/src/layouts/notebook-layout.tsx`
- Modify: `packages/site/src/layouts/spacious-layout.tsx`
- Test: `packages/site/src/layouts/docs-layout.test.tsx`

**Interfaces:**
- Consumes: `resolvedTheme.layout.headerTransparentMode` ('none' | 'top' | 'always').
- Produces: Dynamic header styling in `SiteLayout` and desktop/mobile headers in layout templates.

- [ ] **Step 1: Write test for header transparency in `packages/site/src/layouts/docs-layout.test.tsx`**

Add test case verifying header transparency classes when `headerTransparentMode` is set:
```typescript
it('applies transparent header classes when headerTransparentMode is top or always', () => {
  // test that data-transparent attribute is rendered correctly
});
```

- [ ] **Step 2: Create `packages/site/src/hooks/use-is-scroll-top.ts`**

```typescript
import { useEffect, useState } from 'react';

export function useIsScrollTop({ enabled = true }: { enabled?: boolean } = {}): boolean {
  const [isTop, setIsTop] = useState(true);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const check = () => setIsTop(window.scrollY <= 10);
    check();
    window.addEventListener('scroll', check, { passive: true });
    return () => window.removeEventListener('scroll', check);
  }, [enabled]);

  return isTop;
}
```

- [ ] **Step 3: Update `SiteLayout.tsx` and layout templates**

In `packages/site/src/views/SiteLayout.tsx`:
```typescript
const transparentMode = resolvedTheme.layout.headerTransparentMode ?? 'none';
const isTop = useIsScrollTop({ enabled: transparentMode === 'top' });
const isHeaderTransparent = transparentMode === 'always' || (transparentMode === 'top' && isTop);

const headerNode = (
  <div
    ref={observeHeader}
    data-transparent={isHeaderTransparent}
    className={cn(
      'sticky top-0 z-30 transition-all duration-200',
      isHeaderTransparent
        ? 'bg-transparent border-transparent'
        : 'border-border/70 border-b bg-background/80 backdrop-blur-md'
    )}
    data-theme-region="header-shell"
  >
```
Clean up all `data-documentation-layout="fumadocs-*"` to `data-documentation-layout="*"` across `docs-layout.tsx`, `flux-layout.tsx`, `glass-layout.tsx`, etc.

- [ ] **Step 4: Run site layout tests**

Run: `bun --filter @cms/site test`
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit Task 3**

```bash
git add packages/site/src/hooks/use-is-scroll-top.ts packages/site/src/views/SiteLayout.tsx packages/site/src/layouts/
git commit -m "feat(site): support dynamic header transparency across documentation layouts"
```

---

### Task 4: Theme Switcher & Table of Contents Parity in `packages/site`

**Files:**
- Create: `packages/site/src/components/theme-switcher.tsx`
- Modify: `packages/site/src/views/SiteLayout.tsx`
- Modify: `packages/site/src/components/toc.tsx`
- Modify: `packages/site/src/components/site-page-view.tsx`
- Test: `packages/site/src/components/toc.test.tsx`

**Interfaces:**
- Consumes: `resolvedTheme.layout.themeSwitchMode`, `resolvedTheme.layout.themeSwitchEnabled`, `resolvedTheme.layout.tocStyle`, `resolvedTheme.layout.tocDepth`.
- Produces: Adaptive segmented/button theme switch and styled table of contents with depth filtering.

- [ ] **Step 1: Write test for TOC depth and style in `packages/site/src/components/toc.test.tsx`**

```typescript
import { describe, expect, it } from 'bun:test';
import { render, screen } from '@testing-library/react';
import { TableOfContents } from './toc';

describe('TableOfContents', () => {
  it('respects max depth filtering', () => {
    const headings = [
      { id: 'h1', text: 'H1', depth: 1 },
      { id: 'h2', text: 'H2', depth: 2 },
      { id: 'h3', text: 'H3', depth: 3 },
      { id: 'h4', text: 'H4', depth: 4 },
    ];
    render(<TableOfContents headings={headings} label="On this page" maxDepth={2} />);
    expect(screen.getByText('H1')).toBeInTheDocument();
    expect(screen.getByText('H2')).toBeInTheDocument();
    expect(screen.queryByText('H3')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Create `packages/site/src/components/theme-switcher.tsx`**

Implement `ThemeSwitcher`:
- Supports `'light-dark-system'`, `'light-dark'`, `'button'`, `'dropdown'`.
- Uses accessible buttons, Lucide icons (`Monitor`, `Sun`, `Moon`), and handles theme changes with view transitions where available.

- [ ] **Step 3: Update `packages/site/src/components/toc.tsx`**

Add support for:
- `maxDepth` prop (defaulting to `3`).
- `style?: 'normal' | 'clerk' | 'block'`:
  - `'normal'`: Text tree with color highlight.
  - `'clerk'`: Vertical guide line on left with active sliding dot indicator.
  - `'block'`: Capsule pill background on active item.

- [ ] **Step 4: Update `SiteLayout.tsx` and `site-page-view.tsx`**

- In `SiteLayout.tsx`, replace hardcoded theme button with `<ThemeSwitcher />` configured with `resolvedTheme.layout.themeSwitchMode` and `resolvedTheme.layout.themeSwitchEnabled`.
- In `site-page-view.tsx`, pass `maxDepth={theme.layout.tocDepth}` and `style={theme.layout.tocStyle}` to `<TableOfContents />`.

- [ ] **Step 5: Run tests**

Run: `bun --filter @cms/site test`
Expected: PASS with 0 errors.

- [ ] **Step 6: Commit Task 4**

```bash
git add packages/site/src/components/theme-switcher.tsx packages/site/src/components/toc.tsx packages/site/src/components/site-page-view.tsx packages/site/src/views/SiteLayout.tsx
git commit -m "feat(site): implement adaptive theme switcher and styled table of contents"
```

---

### Task 5: Desktop Sidebar Collapse in `packages/site`

**Files:**
- Modify: `packages/site/src/layouts/docs-layout.tsx`
- Modify: `packages/site/src/layouts/flux-layout.tsx`
- Modify: `packages/site/src/layouts/glass-layout.tsx`
- Modify: `packages/site/src/layouts/notebook-layout.tsx`
- Modify: `packages/site/src/layouts/spacious-layout.tsx`
- Modify: `packages/site/src/layouts/types.ts`
- Test: `packages/site/src/layouts/docs-layout.test.tsx`

**Interfaces:**
- Consumes: `resolvedTheme.layout.sidebarCollapsible`.
- Produces: Toggleable desktop sidebar with collapse trigger and `Ctrl+B` hotkey listener.

- [ ] **Step 1: Write test for sidebar collapse toggle**

In `packages/site/src/layouts/docs-layout.test.tsx`, verify sidebar collapses when collapse button is triggered or hotkey pressed.

- [ ] **Step 2: Add sidebar collapse state and hotkey**

In layout templates (`docs-layout.tsx`, etc.):
```typescript
const [isCollapsed, setIsCollapsed] = useState(false);

useEffect(() => {
  if (!sidebarCollapsible) return;
  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      setIsCollapsed((prev) => !prev);
    }
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}, [sidebarCollapsible]);
```

- [ ] **Step 3: Render collapse toggle button and adjust CSS grid**

When collapsed:
- Sidebar width collapses to 0 (or compact rail).
- Trigger button allows expanding sidebar back.

- [ ] **Step 4: Run tests**

Run: `bun --filter @cms/site test`
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit Task 5**

```bash
git add packages/site/src/layouts/
git commit -m "feat(site): implement collapsible desktop sidebar with Ctrl+B shortcut"
```

---

### Task 6: End-to-End Verification & Formatting Check

**Files:**
- All modified files across workspace.

- [ ] **Step 1: Run typecheck across entire monorepo**

Run: `bun run typecheck`
Expected: 0 type errors.

- [ ] **Step 2: Run linter and formatting check**

Run: `bun run check`
Expected: 0 lint / format issues.

- [ ] **Step 3: Run all monorepo unit tests**

Run: `bun run test`
Expected: All tests pass across all packages and apps.

- [ ] **Step 4: Final verification in Browser**

Open `http://localhost:4310/app/projects/:projectId/settings` (Theme tab):
- Configure:
  - Header Transparency: `top`
  - Theme Switcher: `light-dark-system`
  - TOC Style: `clerk`
  - Sidebar Collapsible: `true`
- Click **Save**. Verify toast "Theme draft saved".
- Navigate to `/sites/:projectId` (and preview `/app/projects/:projectId/preview`).
- Verify:
  - Header is transparent at top and transitions to frosted on scroll.
  - Theme Switcher displays System / Light / Dark segmented buttons.
  - TOC displays Clerk style.
  - Pressing `Ctrl+B` collapses and expands the sidebar smoothly.

- [ ] **Step 5: Commit Task 6**

```bash
git commit -am "chore: complete clean layout options backend parity verification"
```
