# Fumadocs Layouts Porting & Configurable Documentation Shells Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port all 5 Fumadocs layout architectures (`docs`, `notebook`, `glass`, `flux`, `spacious`) directly into `@cms/site`, decouple documentation layout from color palettes so authors can pair any theme preset with any docs layout, and add an interactive visual layout picker with live preview into Studio Editor Settings and Project Settings.

**Architecture:** Extend `@cms/shared` and `@cms/validators` with `DocsLayoutId` ('docs' | 'notebook' | 'glass' | 'flux' | 'spacious') and `docsLayout` field in `ThemeLayout`. In `@cms/site/src/layouts/`, implement the 5 layout architectures adhering to a typed slot contract, routing through `DocumentationThemeProvider` and `SiteLayout`. In `apps/studio`, add a 5-card visual thumbnail layout picker in `ThemeSection` with instant preview updates.

**Tech Stack:** TypeScript, React 19, `@base-ui/react`, Tailwind CSS v4, Zod, Vitest.

## Global Constraints

- Platform is exclusively for internal company documentation (per `AGENTS.md` and `GEMINI.md`). No billing, plans, or public marketing pages.
- Preserve backward compatibility for existing presets (`harbor`, `manuscript`, `signal`) and existing shell values (`reference`, `editorial`, `console`).
- All 5 Fumadocs layouts must render correctly in both standalone reader (`apps/reader`) and Studio preview (`apps/studio/src/routes/sites/$projectId`).
- All code must pass `typecheck` and Vitest unit test suites.

---

### Task 1: Data Model & Schema Updates (`@cms/shared` & `@cms/validators`)

**Files:**
- Modify: `packages/shared/src/themes.ts:22-145, 490-540`
- Modify: `packages/validators/src/themes.ts:20-55`
- Test: `packages/shared/src/themes.test.ts`
- Test: `packages/validators/src/themes.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type DocsLayoutId = 'docs' | 'notebook' | 'glass' | 'flux' | 'spacious';
  export const DOCS_LAYOUT_IDS: readonly DocsLayoutId[];
  export interface ThemeLayout {
    shell: 'reference' | 'editorial' | 'console' | DocsLayoutId;
    docsLayout?: DocsLayoutId;
    // ...
  }
  export const resolveDocsLayout: (layout?: Partial<ThemeLayout>) => DocsLayoutId;
  ```

- [ ] **Step 1: Write failing tests in `packages/shared/src/themes.test.ts` and `packages/validators/src/themes.test.ts`**

Add tests in `packages/shared/src/themes.test.ts`:
```ts
describe('resolveDocsLayout', () => {
  it('resolves explicit docsLayout when specified', () => {
    expect(resolveDocsLayout({ docsLayout: 'glass' })).toBe('glass');
    expect(resolveDocsLayout({ docsLayout: 'notebook' })).toBe('notebook');
    expect(resolveDocsLayout({ docsLayout: 'flux' })).toBe('flux');
    expect(resolveDocsLayout({ docsLayout: 'spacious' })).toBe('spacious');
    expect(resolveDocsLayout({ docsLayout: 'docs' })).toBe('docs');
  });

  it('falls back to shell mapping when docsLayout is absent', () => {
    expect(resolveDocsLayout({ shell: 'editorial' })).toBe('notebook');
    expect(resolveDocsLayout({ shell: 'console' })).toBe('flux');
    expect(resolveDocsLayout({ shell: 'reference' })).toBe('docs');
    expect(resolveDocsLayout({ shell: 'glass' })).toBe('glass');
    expect(resolveDocsLayout(undefined)).toBe('docs');
  });
});
```

Add test in `packages/validators/src/themes.test.ts`:
```ts
it('validates theme layout with docsLayout', () => {
  const result = cmsThemeConfigSchema.safeParse({
    layout: {
      docsLayout: 'glass',
    },
  });
  expect(result.success).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/shared/src/themes.test.ts packages/validators/src/themes.test.ts`  
Expected: FAIL with "resolveDocsLayout is not defined" or schema validation error.

- [ ] **Step 3: Implement `DocsLayoutId` and `resolveDocsLayout` in `packages/shared/src/themes.ts`**

In `packages/shared/src/themes.ts`:
```ts
export type DocsLayoutId = 'docs' | 'notebook' | 'glass' | 'flux' | 'spacious';
export const DOCS_LAYOUT_IDS = ['docs', 'notebook', 'glass', 'flux', 'spacious'] as const satisfies readonly DocsLayoutId[];

export const resolveDocsLayout = (layout?: Partial<ThemeLayout>): DocsLayoutId => {
  if (layout?.docsLayout && DOCS_LAYOUT_IDS.includes(layout.docsLayout)) {
    return layout.docsLayout;
  }
  if (layout?.shell === 'editorial' || layout?.shell === 'notebook') return 'notebook';
  if (layout?.shell === 'console' || layout?.shell === 'flux') return 'flux';
  if (layout?.shell === 'glass') return 'glass';
  if (layout?.shell === 'spacious') return 'spacious';
  return 'docs';
};
```
Update `ThemeLayout` interface to include `docsLayout?: DocsLayoutId;` and allow `DocsLayoutId` in `shell`.
Update `resolveTheme` to populate `docsLayout: resolveDocsLayout(config?.theme?.layout)`.

- [ ] **Step 4: Update Zod validation in `packages/validators/src/themes.ts`**

Add `docsLayout: z.enum(['docs', 'notebook', 'glass', 'flux', 'spacious']).optional()` to `themeLayoutSchema`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test packages/shared/src/themes.test.ts packages/validators/src/themes.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/shared/ packages/validators/
git commit -m "feat(shared,validators): add DocsLayoutId and docsLayout resolution"
```

---

### Task 2: Layout Slots & Common Shell Utilities in `@cms/site`

**Files:**
- Create: `packages/site/src/layouts/types.ts`
- Create: `packages/site/src/layouts/shared.tsx`
- Create: `packages/site/src/layouts/index.ts`
- Test: `packages/site/src/layouts/layouts.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface DocsLayoutSlots {
    banner?: ReactNode;
    header: ReactNode;
    navigation: ReactNode;
    content: ReactNode;
    footer?: ReactNode;
    overlays?: ReactNode;
  }
  export interface DocsPageSlots {
    article: ReactNode;
    tableOfContents: ReactNode;
  }
  export interface DocsLayoutTemplate {
    id: DocsLayoutId;
    ReaderLayout: (slots: DocsLayoutSlots) => ReactNode;
    ProjectPreviewLayout: (slots: ProjectPreviewSlots) => ReactNode;
    StudioPreviewLayout: (slots: StudioPreviewSlots) => ReactNode;
    PageLayout: (slots: DocsPageSlots) => ReactNode;
  }
  export const getDocsLayoutTemplate: (id: DocsLayoutId) => DocsLayoutTemplate;
  ```

- [ ] **Step 1: Write test in `packages/site/src/layouts/layouts.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { getDocsLayoutTemplate } from './index';
import { DOCS_LAYOUT_IDS } from '@cms/shared/themes';

describe('DocsLayout registry', () => {
  it('provides a valid template for all 5 layout IDs', () => {
    for (const id of DOCS_LAYOUT_IDS) {
      const template = getDocsLayoutTemplate(id);
      expect(template.id).toBe(id);
      expect(typeof template.ReaderLayout).toBe('function');
      expect(typeof template.PageLayout).toBe('function');
      expect(typeof template.StudioPreviewLayout).toBe('function');
      expect(typeof template.ProjectPreviewLayout).toBe('function');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/site/src/layouts/layouts.test.ts`  
Expected: FAIL with module not found.

- [ ] **Step 3: Create `packages/site/src/layouts/types.ts`**

Define `DocsLayoutSlots`, `DocsPageSlots`, `ProjectPreviewSlots`, `StudioPreviewSlots`, and `DocsLayoutTemplate`.

- [ ] **Step 4: Create `packages/site/src/layouts/shared.tsx`**

Implement `renderReaderFrame(slots, body)`:
```tsx
import type { ReactNode } from 'react';
import type { DocsLayoutSlots } from './types';

export function renderReaderFrame(slots: DocsLayoutSlots, body: ReactNode): ReactNode {
  return (
    <>
      {slots.banner}
      {slots.header}
      {body}
      {slots.footer}
      {slots.overlays}
    </>
  );
}
```

- [ ] **Step 5: Create placeholder registry in `packages/site/src/layouts/index.ts`**

Export `getDocsLayoutTemplate` supporting the 5 IDs (initial stubs).

- [ ] **Step 6: Run test to verify it passes**

Run: `bun test packages/site/src/layouts/layouts.test.ts`  
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/site/src/layouts/
git commit -m "feat(site): scaffold layout slot types and registry"
```

---

### Task 3: Standard Docs (`docs`) & Notebook (`notebook`) Layouts

**Files:**
- Create: `packages/site/src/layouts/docs-layout.tsx`
- Create: `packages/site/src/layouts/notebook-layout.tsx`
- Modify: `packages/site/src/layouts/index.ts`
- Test: `packages/site/src/layouts/docs-layout.test.tsx`
- Test: `packages/site/src/layouts/notebook-layout.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export const DocsStandardLayoutTemplate: DocsLayoutTemplate;
  export const NotebookLayoutTemplate: DocsLayoutTemplate;
  ```

- [ ] **Step 1: Write test for Standard Docs & Notebook layouts**

Test that `DocsStandardLayoutTemplate` renders:
- Container with `data-documentation-layout="fumadocs-docs"`
- Aside with `data-theme-region="sidebar"`
- PageLayout rendering article and TOC side-by-side (`xl:grid-cols-[minmax(0,1fr)_13rem]`).

Test that `NotebookLayoutTemplate` renders:
- Container with `data-documentation-layout="fumadocs-notebook"`
- Tinted canvas wrapper with elevated card surface (`bg-card` and border).

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/site/src/layouts/docs-layout.test.tsx packages/site/src/layouts/notebook-layout.test.tsx`  
Expected: FAIL

- [ ] **Step 3: Implement `packages/site/src/layouts/docs-layout.tsx`**

Port Fumadocs standard docs layout structure:
- `ReaderLayout`: Full width max-`[90rem]` container, sticky sidebar with `ScrollArea`, sticky header slot, content slot.
- `PageLayout`: Responsive grid with main article measure and right-side sticky TOC column.
- `StudioPreviewLayout`: Compact 2-column preview.
- `ProjectPreviewLayout`: Responsive drawer + sidebar preview.

- [ ] **Step 4: Implement `packages/site/src/layouts/notebook-layout.tsx`**

Port Fumadocs notebook layout structure:
- Canvas background: `bg-(--theme-muted)/50`
- Elevated paper card: `bg-(--theme-surface)` with `border border-(--theme-border) rounded-2xl shadow-sm`.
- Docked sidebar nestled in the notebook margin.
- `PageLayout`: Chapter measure with margin outline.

- [ ] **Step 5: Register in `packages/site/src/layouts/index.ts` and run tests**

Run: `bun test packages/site/src/layouts/docs-layout.test.tsx packages/site/src/layouts/notebook-layout.test.tsx`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/site/src/layouts/
git commit -m "feat(site): implement standard docs and notebook layouts"
```

---

### Task 4: Glass (`glass`), Flux (`flux`), and Spacious (`spacious`) Layouts

**Files:**
- Create: `packages/site/src/layouts/glass-layout.tsx`
- Create: `packages/site/src/layouts/flux-layout.tsx`
- Create: `packages/site/src/layouts/spacious-layout.tsx`
- Modify: `packages/site/src/layouts/index.ts`
- Test: `packages/site/src/layouts/glass-layout.test.tsx`
- Test: `packages/site/src/layouts/flux-layout.test.tsx`
- Test: `packages/site/src/layouts/spacious-layout.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export const GlassLayoutTemplate: DocsLayoutTemplate;
  export const FluxLayoutTemplate: DocsLayoutTemplate;
  export const SpaciousLayoutTemplate: DocsLayoutTemplate;
  ```

- [ ] **Step 1: Write unit tests for Glass, Flux, and Spacious layouts**

Verify DOM attributes:
- Glass: `data-documentation-layout="fumadocs-glass"`, backdrop-blur classes, floating header/sidebar shells.
- Flux: `data-documentation-layout="fumadocs-flux"`, compact navigation rail.
- Spacious: `data-documentation-layout="fumadocs-spacious"`, inset panel with rounded frame and relaxed padding.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/site/src/layouts/glass-layout.test.tsx packages/site/src/layouts/flux-layout.test.tsx packages/site/src/layouts/spacious-layout.test.tsx`  
Expected: FAIL

- [ ] **Step 3: Implement `packages/site/src/layouts/glass-layout.tsx`**

Port Fumadocs glass layout:
- Floating header container with `backdrop-blur-md bg-background/75 border border-border/70 rounded-2xl shadow-sm`.
- Floating translucent sidebar alongside content.
- Frosted glass TOC outline.

- [ ] **Step 4: Implement `packages/site/src/layouts/flux-layout.tsx`**

Port Fumadocs flux layout:
- Ultra-minimalist rail (`w-60` or collapsible compact rail).
- Clean uninterrupted typography measure with top metadata.
- Distraction-free article container.

- [ ] **Step 5: Implement `packages/site/src/layouts/spacious-layout.tsx`**

Port Fumadocs spacious layout:
- Inset container: Sits in an inset rounded panel (`p-6 lg:p-10 border border-border/70 rounded-3xl bg-card/60`) with generous outer breathing room.
- Sidebar with relaxed item spacing.

- [ ] **Step 6: Register all templates in `packages/site/src/layouts/index.ts` and run tests**

Run: `bun test packages/site/src/layouts/*.test.ts*`  
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/site/src/layouts/
git commit -m "feat(site): implement glass, flux, and spacious layouts"
```

---

### Task 5: Integrate Layouts into `DocumentationThemeProvider` and `SiteLayout.tsx`

**Files:**
- Modify: `packages/site/src/components/documentation-theme-provider.tsx`
- Modify: `packages/site/src/views/SiteLayout.tsx`
- Test: `packages/site/src/views/SiteLayout.test.tsx`

**Interfaces:**
- Consumes: `getDocsLayoutTemplate` from `packages/site/src/layouts/index.ts`, `resolveDocsLayout` from `@cms/shared/themes`.
- Produces: Dynamic layout rendering in `SiteLayout` reacting to `theme.layout.docsLayout`.

- [ ] **Step 1: Write test in `packages/site/src/views/SiteLayout.test.tsx`**

Test that `SiteLayout` renders:
- Correct `data-documentation-layout="fumadocs-glass"` when `site.project.config.theme.layout.docsLayout = 'glass'`.
- Correct `data-documentation-layout="fumadocs-notebook"` when `docsLayout = 'notebook'`.
- Correct `data-documentation-layout="fumadocs-spacious"` when `docsLayout = 'spacious'`.
- Correct `data-documentation-layout="fumadocs-flux"` when `docsLayout = 'flux'`.
- Correct `data-documentation-layout="fumadocs-docs"` when `docsLayout = 'docs'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/site/src/views/SiteLayout.test.tsx`  
Expected: FAIL

- [ ] **Step 3: Update `DocumentationThemeProvider` in `packages/site/src/components/documentation-theme-provider.tsx`**

Wire `DocumentationThemeProvider` to resolve template via `getDocsLayoutTemplate(resolveDocsLayout(theme.layout))`:
```tsx
const activeLayoutId = resolveDocsLayout(theme.layout);
const template = getDocsLayoutTemplate(activeLayoutId);
```
Ensure `DocumentationReaderLayout`, `DocumentationProjectPreviewLayout`, `DocumentationStudioPreviewLayout`, and `DocumentationPageLayout` call the resolved template.

- [ ] **Step 4: Update `SiteLayout.tsx` and `SitePageView.tsx`**

Ensure `DocumentationPageLayout` wraps the article and TOC in `packages/site/src/components/site-page-view.tsx`.
Ensure `SiteLayout` passes the unified slots to `DocumentationReaderLayout`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test packages/site/src/views/SiteLayout.test.tsx`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/site/src/
git commit -m "feat(site): wire dynamic layout resolution in DocumentationThemeProvider and SiteLayout"
```

---

### Task 6: Localized Messages for Layouts (`@cms/i18n`)

**Files:**
- Modify: `packages/i18n/src/message-ids.ts`
- Modify: `packages/i18n/messages/en.json`
- Modify: `packages/i18n/messages/zh-CN.json`
- Modify: `packages/i18n/messages/ja.json`

- [ ] **Step 1: Add message IDs to `packages/i18n/src/message-ids.ts`**

Add keys for:
- `settings.theme.docsLayout`
- `settings.theme.docsLayoutHint`
- `settings.theme.layout.docs.name`, `settings.theme.layout.docs.description`
- `settings.theme.layout.notebook.name`, `settings.theme.layout.notebook.description`
- `settings.theme.layout.glass.name`, `settings.theme.layout.glass.description`
- `settings.theme.layout.flux.name`, `settings.theme.layout.flux.description`
- `settings.theme.layout.spacious.name`, `settings.theme.layout.spacious.description`

- [ ] **Step 2: Add translations in `en.json`, `zh-CN.json`, `ja.json`**

Ensure all 3 language bundles have matching entries.

- [ ] **Step 3: Run i18n check/tests**

Run: `bun test packages/i18n`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/i18n/
git commit -m "feat(i18n): add localized messages for docs layout options"
```

---

### Task 7: Editor Settings Layout Picker & Live Preview (`apps/studio`)

**Files:**
- Create: `apps/studio/src/features/project-settings/components/docs-layout-picker.tsx`
- Modify: `apps/studio/src/features/project-settings/components/theme-section.tsx`
- Test: `apps/studio/src/features/project-settings/components/docs-layout-picker.test.tsx`

**Interfaces:**
- Produces:
  ```tsx
  export function DocsLayoutPicker({
    value,
    onChange,
  }: {
    value: DocsLayoutId;
    onChange: (value: DocsLayoutId) => void;
  }): ReactNode;
  ```

- [ ] **Step 1: Write test for `DocsLayoutPicker`**

Test that `DocsLayoutPicker` renders 5 layout cards (`docs`, `notebook`, `glass`, `flux`, `spacious`) and fires `onChange` on click.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/studio/src/features/project-settings/components/docs-layout-picker.test.tsx`  
Expected: FAIL

- [ ] **Step 3: Implement `DocsLayoutPicker`**

Build the card gallery:
- 5 cards in a responsive grid (`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5`).
- SVG wireframe thumbnail for each layout illustrating the sidebar, header, and reading canvas.
- Title and descriptive summary from i18n keys.
- Selected state styling (`border-primary bg-primary/5 shadow-2xs`).

- [ ] **Step 4: Integrate `DocsLayoutPicker` into `ThemeSection.tsx`**

In `ThemeSection.tsx`:
- Render `DocsLayoutPicker` right below or beside the Preset gallery under a dedicated Field: `t('settings.theme.docsLayout')`.
- Wire `onChange` to update `draft.theme.layout.docsLayout`.
- Verify `ThemePreview` dynamically receives the selected layout and live-renders it.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test apps/studio/src/features/project-settings/components/docs-layout-picker.test.tsx`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/features/project-settings/
git commit -m "feat(studio): add docs layout picker with live preview to theme section"
```

---

### Task 8: End-to-End Typecheck, Lint, and System Verification

**Files:**
- Whole monorepo verification

- [ ] **Step 1: Run workspace typecheck**

Run: `bun run typecheck`  
Expected: All packages pass typechecking with zero errors.

- [ ] **Step 2: Run all workspace tests**

Run: `bun test`  
Expected: All tests pass.

- [ ] **Step 3: Commit any final integration polish**

```bash
git commit --allow-empty -m "chore: verify fumadocs layouts porting passes typecheck and test suite"
```
