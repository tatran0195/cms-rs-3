# Fumadocs Theme Section Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Studio Theme Settings Section to replicate the official Fumadocs Story and Interactive Props Table architecture with drill-down field navigation, live color palette customization, and real-time macOS documentation preview.

**Architecture:** Split the theme section into focused components under `apps/studio/src/features/project-settings/components/theme/`. The upper area features `ThemeStoryWindow` with a dot-pattern canvas, macOS chrome controls, URL indicator, and instant live preview. Directly below, `ThemePropsTable` provides breadcrumb drill-down navigation (`nav`, `themeSwitch`, `searchToggle`, `sidebar`, `palette`, `layout`, `components`) where users can tweak properties and edit palette tokens with immediate live preview updates. Secondary preset baselines and JSON exchange are neatly placed in `ThemePresetsAndExchange`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, `@cms/shared/themes`, `@cms/site`, Lucide icons, Vitest.

## Global Constraints
- Deploy exclusively for internal deployment scope (no pricing, plans, or billing).
- No external heavy dependencies like `@fumari/stf`; build clean, idiomatic, fully typed React state management for drill-down navigation and value updates.
- Real-time reactivity: any prop or palette change in the table must instantly update `DocumentationThemeProvider` and the live preview.
- Preserve full backward compatibility with `cmsThemeConfig`, `ProjectConfig`, and existing saved themes.

---

### Task 1: Create Types and State Models for Fumadocs Props Table

**Files:**
- Create: `apps/studio/src/features/project-settings/components/theme/types.ts`
- Test: `apps/studio/src/features/project-settings/components/theme/types.test.ts`

**Interfaces:**
- Produces:
  - `FumadocsLayoutOptions`: nav, themeSwitch, searchToggle, sidebar settings.
  - `PropsTablePath`: navigation path stack (`[] | ['nav'] | ['themeSwitch'] | ['searchToggle'] | ['sidebar'] | ['palette'] | ['layout'] | ['components']`).
  - `ThemePropertyEntry`: descriptor for rows in the interactive table (name, summary, type, children/drilldown).

- [ ] **Step 1: Write test for type defaults and schema helpers**
- [ ] **Step 2: Implement `types.ts` with type definitions and helper extractors for preview summaries**
- [ ] **Step 3: Run Vitest to verify type helpers**
- [ ] **Step 4: Commit Task 1**

---

### Task 2: Build `ThemePropsTable` with Breadcrumb Navigation and Root Rows

**Files:**
- Create: `apps/studio/src/features/project-settings/components/theme/theme-props-table.tsx`
- Test: `apps/studio/src/features/project-settings/components/theme/theme-props-table.test.tsx`

**Interfaces:**
- Consumes: Types from `types.ts`, `cn` from `@cms/design-system/lib/utils`, icons from `lucide-react`.
- Produces: `<ThemePropsTable path={path} onNavigate={setPath} onReset={handleReset} ... />`

- [ ] **Step 1: Write failing test verifying root rows rendering and navigation click triggers**
- [ ] **Step 2: Implement `ThemePropsTable` with breadcrumb bar (Back arrow, Props > Category trail, Reset button), root row items with `{ preview }` and `object >`, and slide-transition container**
- [ ] **Step 3: Implement sub-field editors for `nav`, `themeSwitch`, `searchToggle`, `sidebar`, `layout`, and `components`**
- [ ] **Step 4: Run Vitest to verify drill-down navigation and input interactions**
- [ ] **Step 5: Commit Task 2**

---

### Task 3: Build `ThemePaletteEditor` for Deep Color Token Customization

**Files:**
- Create: `apps/studio/src/features/project-settings/components/theme/theme-palette-editor.tsx`
- Test: `apps/studio/src/features/project-settings/components/theme/theme-palette-editor.test.tsx`

**Interfaces:**
- Consumes: `THEME_COLOR_KEYS`, `ThemeColorKey`, `ThemeColorTokens`, `themeContrastIssues` from `@cms/shared/themes`.
- Produces: `<ThemePaletteEditor colors={colors} mode={colorMode} onModeChange={setColorMode} onColorChange={handleColorChange} />`

- [ ] **Step 1: Write failing test for palette editor color inputs and light/dark toggle**
- [ ] **Step 2: Implement `ThemePaletteEditor` displaying color swatches, native picker trigger, hex text input, and live WCAG contrast status**
- [ ] **Step 3: Run Vitest to verify color updates propagate accurately**
- [ ] **Step 4: Commit Task 3**

---

### Task 4: Build `ThemeStoryWindow` macOS Documentation Preview

**Files:**
- Create: `apps/studio/src/features/project-settings/components/theme/theme-story-window.tsx`
- Test: `apps/studio/src/features/project-settings/components/theme/theme-story-window.test.tsx`

**Interfaces:**
- Consumes: `DocumentationThemeProvider`, `projectThemeVariables`, `projectThemeStyle`, `getDocsLayoutTemplate` from `@cms/site`.
- Produces: `<ThemeStoryWindow layoutId={activeLayout} config={effectiveConfig} appearance={previewMode} options={layoutOptions} />`

- [ ] **Step 1: Write failing test rendering macOS chrome and active documentation layout template**
- [ ] **Step 2: Implement `ThemeStoryWindow` with dot-grid background, macOS window chrome (`#ff5f57`, `#febc2e`, `#28c840`), mock URL pill, and responsive live layout preview**
- [ ] **Step 3: Run Vitest to confirm correct template rendering and theme styles**
- [ ] **Step 4: Commit Task 4**

---

### Task 5: Build `ThemePresetsAndExchange` Secondary Section

**Files:**
- Create: `apps/studio/src/features/project-settings/components/theme/theme-presets-and-exchange.tsx`
- Test: `apps/studio/src/features/project-settings/components/theme/theme-presets-and-exchange.test.tsx`

**Interfaces:**
- Consumes: Preset metadata and import/export hooks from `@cms/sdk/react` and `@cms/shared/themes`.
- Produces: `<ThemePresetsAndExchange onSelectPreset={...} project={project} onApplyImport={...} />`

- [ ] **Step 1: Write test for preset selection and JSON export trigger**
- [ ] **Step 2: Implement `ThemePresetsAndExchange` as a collapsible card with preset cards and import/export textarea**
- [ ] **Step 3: Run Vitest**
- [ ] **Step 4: Commit Task 5**

---

### Task 6: Assemble `ThemeFumadocsStory` and Refactor `ThemeSection`

**Files:**
- Create: `apps/studio/src/features/project-settings/components/theme/theme-fumadocs-story.tsx`
- Modify: `apps/studio/src/features/project-settings/components/theme-section.tsx`
- Modify: `apps/studio/src/features/project-settings/components/theme/index.ts`

**Interfaces:**
- Consumes: `ThemeStoryWindow`, `ThemePropsTable`, `ThemePaletteEditor`, `ThemePresetsAndExchange`.
- Produces: Clean, modern `ThemeSection` integrating the full Fumadocs Story design.

- [ ] **Step 1: Implement `ThemeFumadocsStory` combining Story Window + Props Table with layout switcher, appearance switcher, and fullscreen mode**
- [ ] **Step 2: Update `theme-section.tsx` to mount `ThemeFumadocsStory`, `ThemePresetsAndExchange`, and the floating `SaveBar`**
- [ ] **Step 3: Run typecheck and existing tests to ensure no regressions**
- [ ] **Step 4: Commit Task 6**

---

### Task 7: Full Verification & E2E Validation

**Files:**
- Test: `apps/studio/src/features/project-settings/components/theme-section.test.tsx`

- [ ] **Step 1: Update `theme-section.test.tsx` to test the unified Fumadocs story controls and drill-down interactions**
- [ ] **Step 2: Run all Studio vitest suites (`pnpm --filter @cms/studio test`)**
- [ ] **Step 3: Run project-wide typecheck (`pnpm --filter @cms/studio typecheck`)**
- [ ] **Step 4: Visual verification via browser testing to confirm layout fidelity matching Fumadocs**
- [ ] **Step 5: Final commit**
