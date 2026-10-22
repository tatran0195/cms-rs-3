# Merge Theme Presets into Palette Editor & Purge Theme Gallery Design

## 1. Problem Statement & Motivation

Previously, theme configuration on `/app/projects/$projectId/settings` (Themes tab) featured:
1. An interactive `ThemePlaygroundStory` containing a preview window and a Fumadocs-style `ThemePropsTable`.
2. A separate, bulky `<ThemePresetsAndExchange>` card located beneath the action buttons, displaying 3 large card thumbnails for Harbor, Manuscript, and Signal presets, along with an accordion for JSON Export/Import.

In commit `eb69ec8`, layout configuration was decoupled from theme presets. In `@cms/shared/themes`, `THEME_PRESETS` now strictly define color tokens (`colors.light`, `colors.dark`) and component defaults (`components`), while layout is independently configured via `docsLayout` (`docs`, `notebook`, `flux`, `glass`, `spacious`) and system layout defaults.

Because presets now define color palette tokens and component styles rather than layout structures:
- Presets naturally belong inside the **`palette`** drill-down editor in `ThemePropsTable`.
- The standalone "Theme Gallery" card at the bottom of the page is redundant and takes up unnecessary vertical space.
- The Theme Exchange (Export / Import JSON) belongs in the `ThemePropsTable` header navigation alongside the Reset action.

---

## 2. Requirements & Key Decisions

1. **Purge the Bottom Card:**
   - Remove `<ThemePresetsAndExchange>` from `ThemeSection`.
   - Remove the bottom bulky gallery cards and accordion container.

2. **Integrate Presets into `ThemePaletteEditor`:**
   - In `ThemePaletteEditor`, add a **Preset** segmented control at the top: `[ Harbor | Manuscript | Signal ]`.
   - Each preset option displays its name accompanied by miniature color indicator dots (canvas, accent, code).
   - Selecting a preset calls `onSelectPreset(presetId)`, which applies the preset's color tokens (and component defaults) to the draft theme while preserving the user's active `layout`.
   - Manual color overrides can still be performed on any individual token row below.

3. **Theme Exchange in `ThemePropsTable` Header:**
   - In `ThemePropsTable` top header toolbar (next to breadcrumb and Reset button `↺`), add:
     - **Export JSON Button:** Download current theme JSON template immediately using `useExportProjectTheme`.
     - **Import JSON Button:** Opens a clean `ThemeImportDialog`.
   - **`ThemeImportDialog`:**
     - Modal dialog using `@cms/design-system/components/ui/dialog`.
     - Supports drag-and-drop or file picker for `.json` theme files, and direct textarea pasting.
     - Option to choose between `merge` (default) and `replace` mode.
     - Validation for `MAX_THEME_TEMPLATE_BYTES` and schema validity with clear error feedback.
     - Visual diff summary showing what properties will change before applying.
     - "Apply theme" button updates the draft theme and closes modal.

---

## 3. Architecture & Component Interfaces

### 3.1 `ThemePaletteEditor`
```typescript
export interface ThemePaletteEditorProps {
  colors: {
    light: ThemeColorTokens;
    dark: ThemeColorTokens;
  };
  activePreset?: ThemePresetId;
  onSelectPreset?: (preset: ThemePresetId) => void;
  mode?: 'light' | 'dark';
  onModeChange?: (mode: 'light' | 'dark') => void;
  onColorChange: (mode: 'light' | 'dark', key: ThemeColorKey, value: string) => void;
  className?: string;
}
```
Header layout inside `ThemePaletteEditor`:
- Row 1:
  - Preset Selector: Label `Preset:` with segmented pill buttons `[ Harbor | Manuscript | Signal ]` displaying active highlight ring and mini color dots.
  - Mode Switcher: `[ ☀ Light | ☾ Dark ]` toggle.

### 3.2 `ThemeImportDialog`
New standalone modal component: `apps/studio/src/features/project-settings/components/theme/theme-import-dialog.tsx`:
```typescript
export interface ThemeImportDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplyTheme: (theme: cmsThemeConfig, appearance?: 'light' | 'dark' | 'system') => void;
}
```
Encapsulates `useImportProjectTheme(projectId)`, file upload handling, JSON textarea input, validation errors, and preview diffing.

### 3.3 `ThemePropsTable`
Props extended to support presets and exchange actions:
```typescript
export interface ThemePropsTableProps {
  // Existing props
  path: PropsTablePath;
  onNavigate: (path: PropsTablePath) => void;
  themeConfig: cmsThemeConfig;
  onThemeConfigChange: (config: cmsThemeConfig | ((prev: cmsThemeConfig) => cmsThemeConfig)) => void;
  resolvedColors: { light: ThemeColorTokens; dark: ThemeColorTokens };
  resolvedLayout: ThemeLayout;
  resolvedComponents: ThemeComponents;
  onReset: () => void;
  className?: string;

  // New props
  activePreset?: ThemePresetId;
  onSelectPreset?: (preset: ThemePresetId) => void;
  onExport?: () => void;
  onImportTheme?: (theme: cmsThemeConfig, appearance?: 'light' | 'dark' | 'system') => void;
  isExporting?: boolean;
}
```

### 3.4 `ThemePlaygroundStory`
Forwards `activePreset`, `onSelectPreset`, `onExport`, and `onImportTheme` from `ThemeSection` to `ThemePropsTable`.

### 3.5 `ThemeSection`
- Houses `useExportProjectTheme` and provides `handleExport` to `ThemePlaygroundStory`.
- Connects `activePreset={resolved.id}` and `onSelectPreset` to `ThemePlaygroundStory`.
- Removes `<ThemePresetsAndExchange>`.

---

## 4. User Interaction Flow

1. **Viewing and Customizing Colors:**
   - User navigates to Settings -> Themes.
   - User clicks `palette` row in the Props Table.
   - At the top of the palette editor, user sees the Preset selector (`Harbor`, `Manuscript`, `Signal`) and Mode switcher (`Light`, `Dark`).
   - Clicking `Manuscript` instantly swaps palette tokens and component styles to Manuscript defaults, leaving the selected layout intact.
   - User can switch to Dark mode and adjust individual hex values or native color pickers below.

2. **Exporting Theme:**
   - In the Props Table header, user clicks the Download icon button ("Export JSON").
   - Browser immediately triggers download of `<project-slug>-theme.json`.

3. **Importing Theme:**
   - In the Props Table header, user clicks the Upload icon button ("Import JSON").
   - `ThemeImportDialog` modal opens.
   - User drops a JSON file or pastes JSON, selects Merge or Replace mode.
   - Valid JSON displays change count / diff preview; invalid JSON displays error message.
   - Clicking "Apply theme" merges changes into the draft and dismisses the dialog.

---

## 5. Affected Files

1. `apps/studio/src/features/project-settings/components/theme/theme-palette-editor.tsx`:
   - Add `activePreset` and `onSelectPreset` props.
   - Render segmented preset bar in header.
2. `apps/studio/src/features/project-settings/components/theme/theme-import-dialog.tsx` (New file):
   - Refactored, standalone modal for JSON file/text upload, validation, diff preview, and apply.
3. `apps/studio/src/features/project-settings/components/theme/theme-props-table.tsx`:
   - Add Export and Import buttons to header.
   - Forward `activePreset` and `onSelectPreset` to `ThemePaletteEditor`.
   - Wire `ThemeImportDialog`.
4. `apps/studio/src/features/project-settings/components/theme/theme-playground-story.tsx`:
   - Pass preset and exchange callbacks through to `ThemePropsTable`.
5. `apps/studio/src/features/project-settings/components/theme-section.tsx`:
   - Pass export, import, and preset handlers to `ThemePlaygroundStory`.
   - Remove `<ThemePresetsAndExchange>`.
6. `apps/studio/src/features/project-settings/components/theme/theme-presets-and-exchange.tsx`:
   - Cleaned up / deleted once logic is migrated to `theme-import-dialog.tsx`.
7. Tests:
   - `apps/studio/src/features/project-settings/components/theme/theme-palette-editor.test.tsx`
   - `apps/studio/src/features/project-settings/components/theme/theme-props-table.test.tsx`
   - `apps/studio/src/features/project-settings/components/theme/theme-import-dialog.test.tsx`
   - `apps/studio/src/features/project-settings/components/theme-section.test.tsx`

---

## 6. Verification Plan

1. **Automated Tests:**
   - Run `bun test apps/studio/src/features/project-settings/components/theme` to verify preset selection, import dialog, and props table actions.
   - Run `bun test apps/studio/src/features/project-settings/components/theme-section.test.tsx`.
2. **Typecheck:**
   - Run `bun run typecheck` across monorepo to ensure zero type errors.
3. **Browser Verification:**
   - Open `http://localhost:4310/app/projects/34c59d77-9474-439f-918e-40193594770d/settings`.
   - Verify bottom gallery card is gone.
   - Open `palette` in Props Table: verify Preset switcher renders with Harbor, Manuscript, Signal.
   - Click each preset: verify color tokens change in table and preview updates.
   - Verify Export button triggers download.
   - Verify Import button opens dialog, accepts JSON, and applies changes.
