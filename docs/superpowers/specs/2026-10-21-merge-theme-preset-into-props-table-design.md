# Merge Theme Preset and Exchange into Theme Props Table Design

## Problem Statement
The current Themes settings page displays:
1. An interactive Preview Playground (`ThemePlaygroundStory`) containing a preview window and a Fumadocs-style `ThemePropsTable`.
2. A separate, bulky "Theme gallery" section below the action toolbar that duplicates preset selection using 3 large card thumbnails.
3. A separate collapsible "Theme Exchange" drawer below for JSON template export and import.

Having presets isolated below the action toolbar and detached from the interactive Props Table breaks the cohesive Storybook / Fumadocs design paradigm. Users configure all design-system tokens and layout options inside the Props Table, so `preset` belongs directly inside the Props Table and the Playground header as a first-class control.

---

## Requirements & Scope

### 1. Functional Requirements
- **Root `preset` Row in Props Table:**
  - Add `preset` as a top-level enum row in the root view of `ThemePropsTable`.
  - Options: `['harbor', 'manuscript', 'signal']`.
  - Switching the preset applies the selected preset defaults (`fullPresetTheme(presetId)`), preserving any explicit `docsLayout` customization while updating colors, shell, density, and components.
- **Story Header Preset Selector:**
  - In `ThemeStoryWindow` header bar (where the macOS dots, preview URL pill, and `Layout: [docsLayout ▾]` dropdown live), add a `Preset: [preset ▾]` dropdown selector.
  - Allows instant preset toggling right next to the layout selector in the preview toolbar.
- **Export / Import JSON Actions in Props Table Header:**
  - Move Export JSON and Import JSON actions into the `ThemePropsTable` header (alongside the Reset `↺` button) or action toolbar.
  - Export immediately downloads the canonical JSON file using `useExportProjectTheme`.
  - Import opens a clean modal/dialog allowing JSON file upload or pasting, showing the preview diff, and applying the theme.
- **Retire Bulky Gallery Card:**
  - Remove the standalone `ThemePresetsAndExchange` card from the bottom of `ThemeSection`.
  - Clean up the page layout so the entire customization workflow is unified in the Playground Story and Props Table.

### 2. Affected Files
1. `apps/studio/src/features/project-settings/components/theme/theme-props-table.tsx`:
   - Add `preset: ThemePresetId` and `onPresetChange: (id: ThemePresetId) => void` to `ThemePropsTableProps`.
   - Render `preset` row with `['harbor', 'manuscript', 'signal']` options at the top of root category list.
   - Add Export JSON and Import JSON buttons in the table header.
2. `apps/studio/src/features/project-settings/components/theme/theme-playground-story.tsx`:
   - Accept `activePreset`, `onSelectPreset`, and exchange props from `ThemeSection`.
   - Forward `activePreset` and `onSelectPreset` to `ThemeStoryWindow` and `ThemePropsTable`.
3. `apps/studio/src/features/project-settings/components/theme/theme-story-window.tsx`:
   - Add a `Preset: [preset ▾]` dropdown next to the `Layout: [docsLayout ▾]` dropdown.
4. `apps/studio/src/features/project-settings/components/theme/theme-exchange-dialog.tsx` (or refactored modal component):
   - Encapsulate the export and import modal/dialog logic cleanly.
5. `apps/studio/src/features/project-settings/components/theme-section.tsx`:
   - Remove `<ThemePresetsAndExchange>` at the bottom of the form.
   - Pass preset and exchange callbacks to `ThemePlaygroundStory`.
6. Test suites:
   - `apps/studio/src/features/project-settings/components/theme/theme-props-table.test.tsx`
   - `apps/studio/src/features/project-settings/components/theme-section.test.tsx`

---

## User Interaction Flow
1. **Selecting a Preset via Props Table:**
   - User navigates to Settings -> Themes.
   - At the top of the Props Table, the first row is `preset` with segmented buttons: `[ Harbor | Manuscript | Signal ]`.
   - Clicking a preset updates the draft theme immediately in the preview above.
2. **Selecting a Preset via Preview Header:**
   - Alternatively, user clicks the `Preset: harbor ▾` dropdown in the preview story bar to switch presets.
3. **Exporting / Importing Themes:**
   - User clicks `Export JSON` in the Props Table header to save the current theme JSON.
   - User clicks `Import JSON` to open an import dialog, paste/drop a theme file, inspect changes, and merge or replace.

---

## Verification Plan
1. **Automated Unit Tests:**
   - Run `bun run --filter=@cms/studio test` to ensure all studio tests pass.
   - Verify preset switching via props table enum row updates the preview and draft.
   - Verify export/import actions function without errors.
2. **Typecheck:**
   - Run `bun run typecheck` across all workspaces to guarantee strict type correctness.
3. **Browser Verification:**
   - Inspect `http://localhost:4310/app/projects/.../settings` in the browser.
   - Verify the `preset` row appears at the top of the Props Table.
   - Verify the preset selector appears in the preview window header.
   - Verify clicking each preset updates the preview styles in real time.
   - Verify the bulky gallery section at the bottom is gone.
