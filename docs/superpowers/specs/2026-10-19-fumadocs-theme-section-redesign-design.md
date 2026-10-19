# Fumadocs Theme Section Redesign: Story Preview & Interactive Props Table Design

## 1. Overview & Goals

The Theme Section in the Project Settings (`apps/studio/src/features/project-settings/components/theme-section.tsx`) currently presents settings as a fragmented vertical sequence of separate cards, dropdowns, and grids (Presets Gallery, Docs Layout mode picker, Appearance segmented controls, separate Layout and Components dropdowns, and a separate grid of color pickers).

This design redesigns the Theme Section to achieve parity with the official Fumadocs `@fumadocs/story` architecture:
1. **Fumadocs Story Window**: A rich, macOS-framed documentation preview container with a dot-grid / halftone textured background, macOS window chrome controls (`close`, `minimize`, `maximize`), URL bar, layout switcher (`docs`, `glass`, `notebook`, `flux`, `spacious`), appearance mode switcher, and fullscreen mode.
2. **Interactive Props Table**: Directly below the preview window, an interactive properties table with drill-down navigation and breadcrumbs (`Props` ➔ `[category]`).
   - Root rows: `nav`, `themeSwitch`, `searchToggle`, `sidebar`, `palette`, `layout`, and `components`.
   - Each row features property name in monospace, a preview summary (e.g., `{ title }`, `{ enabled, mode }`, `{ accent, canvas, ... }`), type indicator (`object >`), and smooth navigation into nested properties.
   - **Custom Fields & Palette Editing**: Within `Props > palette`, users can directly toggle Light/Dark color tokens, inspect and modify colors using color swatches and hex inputs, and see live WCAG contrast indicators.
3. **Seamless Live Synchronization**: Every modification in the Props table immediately updates the live macOS Story preview in memory without lag or full re-renders.
4. **Secondary Presets & Exchange Panel**: Quick preset baseline selection (`Harbor`, `Manuscript`, `Signal`) and JSON theme Import/Export in a clean secondary panel below the Story card, backed by the standard project save workflow.

---

## 2. Architecture & Component Decomposition

All components will be created in `apps/studio/src/features/project-settings/components/theme/`:

```
apps/studio/src/features/project-settings/components/
├── theme-section.tsx                      // Main entry point replacing legacy layout
├── theme/
│   ├── theme-fumadocs-story.tsx          // Primary container joining Preview + Props Table
│   ├── theme-story-window.tsx            // macOS preview frame with live layout rendering
│   ├── theme-props-table.tsx             // Interactive props table with drill-down breadcrumbs
│   ├── theme-palette-editor.tsx          // Specialized palette editor (light/dark swatches & hex inputs)
│   ├── theme-presets-and-exchange.tsx    // Secondary preset baseline & import/export panel
│   └── types.ts                          // Props table models, field entries, and navigation state
```

### Component Hierarchy

```mermaid
graph TD
    ThemeSection[ThemeSection] --> ThemeFumadocsStory[ThemeFumadocsStory]
    ThemeFumadocsStory --> StoryHeader[Story Header: Title, Layout Select, Theme Mode, Fullscreen]
    ThemeFumadocsStory --> ThemeStoryWindow[ThemeStoryWindow: Dot-Grid Canvas + macOS Window Frame]
    ThemeStoryWindow --> ReaderLayout[ReaderLayout Template: docs | glass | notebook | flux | spacious]
    ThemeFumadocsStory --> ThemePropsTable[ThemePropsTable: Breadcrumbs & Interactive Rows]
    ThemePropsTable --> Breadcrumbs[Breadcrumbs Nav + Back Button + Reset Button]
    ThemePropsTable --> RootRows[Root Props: nav, themeSwitch, searchToggle, sidebar, palette, layout, components]
    ThemePropsTable --> DrillDown[Drill-Down View: Booleans, Enums, Strings, Palette Tokens]
    ThemeSection --> ThemePresetsAndExchange[ThemePresetsAndExchange: Baseline Presets & JSON Import/Export]
    ThemeSection --> SaveBar[SaveBar: Contrast Check Status, Save, Undo, Reset]
```

---

## 3. Data Structures & State Management

### 3.1 Extended Theme State

The theme draft state binds `ProjectConfig`, `cmsThemeConfig`, and Fumadocs layout options:

```typescript
export interface FumadocsLayoutOptions {
  nav: {
    title: string;
    transparentMode?: 'none' | 'top' | 'always';
  };
  themeSwitch: {
    enabled: boolean;
    mode?: 'light-dark' | 'light-dark-system';
  };
  searchToggle: {
    enabled: boolean;
  };
  sidebar: {
    collapsible: boolean;
  };
}

export interface UnifiedThemeDraft {
  preset: ThemePresetId;
  appearance: 'light' | 'dark' | 'system';
  previewMode: 'light' | 'dark';
  theme: cmsThemeConfig;
  layoutOptions: FumadocsLayoutOptions;
}
```

### 3.2 Navigation Path & Breadcrumbs

```typescript
export type PropsTablePath = 
  | []                        // Root: Props
  | ['nav']                   // Props > nav
  | ['themeSwitch']           // Props > themeSwitch
  | ['searchToggle']          // Props > searchToggle
  | ['sidebar']               // Props > sidebar
  | ['palette']               // Props > palette
  | ['layout']                // Props > layout
  | ['components'];           // Props > components
```

---

## 4. Detailed Component Specifications

### 4.1 `ThemeStoryWindow` (macOS Preview Frame)
- **Outer Backdrop**: Styled with dot grid texture matching Fumadocs layout story:
  `bg-gradient-to-br from-primary/10 via-background to-muted/40` with an SVG / CSS dot-grid pattern overlay.
- **Window Chrome**:
  - Header: 3 macOS buttons (`#ff5f57`, `#febc2e`, `#28c840`), mock URL pill `https://docs.local/preview/{activeLayout}`.
  - Viewport: Renders `getDocsLayoutTemplate(activeLayout).ReaderLayout(...)` inside `DocumentationThemeProvider` configured with current `effectiveConfig` and active appearance mode (`light` or `dark`).
  - Slots: Complete mock data for brand, navigation tabs, search bar, active tree, and article content with code blocks and callouts.

### 4.2 `ThemePropsTable` (Interactive Props Table)
- **Breadcrumb Navigation**:
  - Displays back button with motion transition when `path.length > 0`.
  - Monospace breadcrumb path (`Props` ➔ `palette`, etc.).
  - `Reset` icon button (`RotateCcw`) on the right to revert the current category or all props to preset defaults.
- **Root Table View**:
  - Displays structured rows styled with Fumadocs borders and hover states:
    - `nav`: `{ title }` ➔ `object >`
    - `themeSwitch`: `{ enabled, mode }` ➔ `object >`
    - `searchToggle`: `{ enabled }` ➔ `object >`
    - `sidebar`: `{ collapsible }` ➔ `object >`
    - `palette`: `{ accent, canvas, surface... }` ➔ `object >`
    - `layout`: `{ docsLayout, shell, density... }` ➔ `object >`
    - `components`: `{ codeBlocks, callouts, cards... }` ➔ `object >`
- **Drill-Down Views**:
  - **Boolean Fields**: Pill toggle buttons (`true` / `false`) with active highlight and ring.
  - **Enum Fields**: Clean Select dropdowns with options.
  - **String Fields**: Borderless input with placeholder and focus border.
  - **Palette Fields (`theme-palette-editor.tsx`)**:
    - Mode toggle (Light / Dark mode colors).
    - Rows for each color token (`canvas`, `foreground`, `surface`, `surfaceRaised`, `muted`, `mutedForeground`, `border`, `accent`, `accentForeground`, `code`, `codeForeground`, `info`, `success`, `warning`, `destructive`).
    - Color swatch with native picker trigger, formatted hex string, and live contrast ratio warnings.

### 4.3 `ThemePresetsAndExchange`
- Collapsible card placed below the Story container:
  - Preset thumbnails for quick baseline application (`Harbor`, `Manuscript`, `Signal`).
  - JSON Export and Import textarea / file upload with schema validation.

---

## 5. User Workflow & Interactions

1. **Viewing Layout**: The user selects a layout (`glass`, `docs`, `notebook`, `flux`, `spacious`) via the top story switcher or in `Props > layout`.
2. **Customizing Fields**: The user clicks `sidebar`, toggles `collapsible` to `false`, and immediately sees the sidebar expand and lock in the live preview.
3. **Customizing Palette**: The user clicks `palette`, changes `accent` or `surface`, and watches the macOS preview reflect the exact OKLab/HEX color values instantly.
4. **Saving Changes**: If any contrast ratios fail WCAG AA, the Save bar alerts the user. Once valid, clicking **Save** commits the changes to project configuration via `useUpdateProjectConfig`.

---

## 6. Testing Strategy

1. **Unit & Component Tests (`theme-section.test.tsx`, `theme-props-table.test.tsx`)**:
   - Verify initial rendering of all root props rows (`nav`, `themeSwitch`, `searchToggle`, `sidebar`, `palette`, `layout`, `components`).
   - Verify clicking an object row navigates into its drill-down panel and updates breadcrumbs.
   - Verify clicking the Back button returns to the root Props table.
   - Verify changing values (e.g. toggling a boolean, selecting a layout enum, editing a color hex) invokes the `change` callback and updates the draft state.
   - Verify reset button restores baseline values.
2. **Regression & Integration Tests**:
   - Ensure existing theme export and import continue to function correctly.
   - Verify contrast checking rules continue to catch bad contrast pairs.
   - Verify all 5 documentation layouts render in the live story window without runtime exceptions.
