# Clean Layout Options & Full Backend/Reader Parity Design

## 1. Executive Summary & Purpose

In the current documentation platform, layout and chrome options (such as navigation transparent mode, theme switch display mode, sidebar desktop collapse, and table-of-contents styling) were only simulated in the Studio Theme preview (`apps/studio/src/features/project-settings/components/theme/`). The user settings were held in an ephemeral local React `useState` and completely omitted from `project.config` on save. Consequently, the actual live reader (`packages/site/src/views/SiteLayout.tsx`) and published documentation sites never reflected these settings, always falling back to hardcoded defaults.

Furthermore, these settings were prefixed with ad-hoc library signatures (`FumadocsLayoutOptions`, `data-documentation-layout="fumadocs-docs"`).

### Core Goals
1. **Zero Ad-Hoc Vendor Signatures**: Eliminate detached `fumadocs` naming from schemas, classnames, datasets, and component files. Establish clean, first-class, scalable layout configuration.
2. **First-Class Persistence**: Integrate layout and chrome settings directly into `ThemeLayout` in `@cms/shared` and `@cms/validators`. Settings persist into PostgreSQL (`Project.config.theme.layout` / `Theme.config.layout`) via standard project updates.
3. **Studio Settings Parity**: Refactor Studio theme settings so that toggling navigation transparency, theme switcher mode, sidebar collapsible behavior, search visibility, and TOC styling edits `draft.theme.layout` directly, marks the form dirty, saves to the backend, and roundtrips across reloads.
4. **Live Reader UI Parity**: Upgrade [`SiteLayout.tsx`](file:///d:/Workspace/Software/_working/cms-rs-3/packages/site/src/views/SiteLayout.tsx), layout templates (`docs`, `glass`, `notebook`, `flux`, `spacious`), and Table of Contents to natively execute these persisted settings on published and live preview sites.

---

## 2. Architecture & System Flow

```mermaid
flowchart TD
    subgraph Studio["apps/studio (Admin / Authoring)"]
        ThemeSection[ThemeSection Component]
        ThemePropsTable[ThemePropsTable (Props Inspector)]
        ThemePlaygroundStory[ThemePlaygroundStory (Live Preview)]
    end

    subgraph Core["Shared & Validation Layer"]
        SharedTheme["@cms/shared (ThemeLayout, resolveTheme)"]
        ValidatorsTheme["@cms/validators (themeConfigSchema, projectConfigSchema)"]
    end

    subgraph Backend["crates/cms-api & Database"]
        UpdateProjectHandler["PATCH /api/projects/:id (update_project)"]
        PostgresDB[("PostgreSQL: Project.config JSONB")]
        PublicSiteHandler["GET /api/public/sites/:id (get_public_site_handler)"]
    end

    subgraph Reader["packages/site (Published Sites & Live Preview)"]
        SiteLayout[SiteLayout View]
        HeaderComponent[Adaptive Header: None / Top / Always Transparency]
        ThemeSwitcherComponent[ThemeSwitcher: Segmented 3-way / 2-way / Button / Select]
        SidebarComponent[Sidebar: Expand / Collapse Toggle + Ctrl+B]
        TOCComponent[TableOfContents: Normal / Clerk / Block Styles + Depth]
    end

    ThemePropsTable -->|Mutates draft.theme.layout| ThemeSection
    ThemeSection -->|Live Updates| ThemePlaygroundStory
    ThemeSection -->|Save (useUpdateProjectConfig)| UpdateProjectHandler
    UpdateProjectHandler -->|JSONB Storage| PostgresDB
    PostgresDB -->|Read frozen/draft config| PublicSiteHandler
    PublicSiteHandler -->|SiteShell with project.config.theme| SiteLayout
    SiteLayout --> HeaderComponent
    SiteLayout --> ThemeSwitcherComponent
    SiteLayout --> SidebarComponent
    SiteLayout --> TOCComponent
    SharedTheme -.-> Studio
    SharedTheme -.-> Reader
    ValidatorsTheme -.-> Studio
    ValidatorsTheme -.-> Reader
```

---

## 3. Data Schema & Contracts

### 3.1 Extended `ThemeLayout` in `@cms/shared/themes.ts`

`ThemeLayout` represents all geometric, chrome, and navigation behavior for documentation layouts:

```typescript
export interface ThemeLayout {
  /** High-level shell taxonomy ('reference' | 'editorial' | 'console') */
  shell: 'reference' | 'editorial' | 'console';
  /** Concrete layout template ID */
  docsLayout?: DocsLayoutId;
  /** Visual rhythm and padding */
  density: 'compact' | 'comfortable' | 'relaxed';
  /** Border radius token */
  radius: 'sharp' | 'rounded' | 'pill';
  /** Max content measure for the article body */
  contentWidth: 'focused' | 'balanced' | 'wide';

  /** Header placement archetype */
  header: 'inline' | 'stacked' | 'floating';
  /**
   * Header transparency behavior:
   * - 'none': solid frosted background with border always
   * - 'top': transparent at scroll top; gains frosted background & border on scroll
   * - 'always': transparent background without bottom border
   */
  headerTransparentMode?: 'none' | 'top' | 'always';

  /** Sidebar frame styling */
  sidebar: 'bordered' | 'soft' | 'rail';
  /** Enable collapsible desktop sidebar rail with toggle & keyboard shortcut (Ctrl+B) */
  sidebarCollapsible?: boolean;
  /** Default level of folders automatically expanded (0 = all closed, 1 = top level open) */
  sidebarDefaultOpenLevel?: number;

  /** Navigation tree layout */
  navigation: 'tree' | 'sectioned' | 'compact';

  /**
   * Theme Switcher presentation mode in header/tools:
   * - 'light-dark': 2-way toggle pill (Light / Dark)
   * - 'light-dark-system': 3-way segmented control (System / Light / Dark)
   * - 'button': single icon cycle button
   * - 'dropdown': select menu
   */
  themeSwitchMode?: 'light-dark' | 'light-dark-system' | 'button' | 'dropdown';
  /** Show or hide the theme toggle completely */
  themeSwitchEnabled?: boolean;

  /**
   * Table of Contents (TOC) presentation style:
   * - 'normal': classic clean text tree with active color
   * - 'clerk': vertical track line with moving active indicator indicator pip
   * - 'block': segmented capsule/block highlight
   */
  tocStyle?: 'normal' | 'clerk' | 'block';
  /** Maximum heading depth included in TOC (defaults to 3 for h1-h3) */
  tocDepth?: number;
}
```

### 3.2 Default Resolution in `resolveTheme()`

Every theme preset (`harbor`, `manuscript`, `signal`) and any custom theme reliably resolves defaults:

```typescript
export const DEFAULT_THEME_LAYOUT: ThemeLayout = {
  shell: 'reference',
  docsLayout: 'docs',
  density: 'comfortable',
  radius: 'rounded',
  contentWidth: 'balanced',
  header: 'inline',
  headerTransparentMode: 'none',
  sidebar: 'bordered',
  sidebarCollapsible: true,
  sidebarDefaultOpenLevel: 0,
  navigation: 'tree',
  themeSwitchMode: 'light-dark',
  themeSwitchEnabled: true,
  tocStyle: 'normal',
  tocDepth: 3,
};
```

### 3.3 Zod Validation in `packages/validators/src/themes.ts`

`themeConfigSchema.layout` strictly validates these enum and scalar fields:

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

---

## 4. Studio Settings Refactoring (`apps/studio`)

### 4.1 Removing Ad-Hoc Fumadocs Signatures
1. **Rename Components and Models**:
   - `FumadocsLayoutOptions` ➔ Retired. Properties belong to `ThemeLayout`.
   - `ThemeFumadocsStory` ➔ Renamed to `ThemePlaygroundStory`.
   - `data-documentation-layout="fumadocs-*"` ➔ Changed to `data-documentation-layout="docs"` or `data-docs-layout="*"`.
2. **Theme Section State Synchronization**:
   - In [`theme-section.tsx`](file:///d:/Workspace/Software/_working/cms-rs-3/apps/studio/src/features/project-settings/components/theme-section.tsx):
     - Remove separate `[layoutOptions, setLayoutOptions] = useState(...)`.
     - Layout choices are directly stored in `draft.theme.layout`.
     - Search toggle bridges directly to `config.navbar.showSearch` in project config.
     - Modifying any layout option sets `hasChanges = true`.
     - When saving, `useUpdateProjectConfig` serializes `draft.theme` into `Project.config.theme`.

### 4.2 Interactive Props Table Drill-Down Structure
In [`theme-props-table.tsx`](file:///d:/Workspace/Software/_working/cms-rs-3/apps/studio/src/features/project-settings/components/theme/theme-props-table.tsx):
- Root Categories:
  - `layout`: `docsLayout`, `shell`, `density`, `radius`, `contentWidth`
  - `header`: `header` style (`inline` | `stacked` | `floating`), `headerTransparentMode` (`none` | `top` | `always`)
  - `sidebar`: `sidebar` frame (`bordered` | `soft` | `rail`), `sidebarCollapsible` (boolean), `sidebarDefaultOpenLevel` (number)
  - `themeSwitch`: `themeSwitchEnabled` (boolean), `themeSwitchMode` (`light-dark` | `light-dark-system` | `button` | `dropdown`)
  - `toc`: `tocStyle` (`normal` | `clerk` | `block`), `tocDepth` (2, 3, 4)
  - `search`: `showSearch` (boolean toggle on `project.config.navbar.showSearch`)
  - `palette`: color token palette editor
  - `components`: code block, callout, card, tab, table component variants

---

## 5. Live Reader UI Implementation (`packages/site`)

### 5.1 Dynamic Header Transparency
In [`packages/site/src/views/SiteLayout.tsx`](file:///d:/Workspace/Software/_working/cms-rs-3/packages/site/src/views/SiteLayout.tsx):
- Introduce a lightweight scroll hook `useIsScrollTop` that observes viewport `window.scrollY === 0`.
- Apply classes dynamically based on `layout.headerTransparentMode`:
  - `'none'`: `sticky top-0 bg-background/80 backdrop-blur-md border-b border-border/70`
  - `'top'`: `sticky top-0 transition-colors duration-200 border-b` with `bg-transparent border-transparent` when at top, transitioning to `bg-background/80 backdrop-blur-md border-border/70` when scrolled.
  - `'always'`: `sticky top-0 bg-transparent border-transparent`

### 5.2 Multi-Mode Theme Switcher
Replace the hardcoded `<Sun /> / <Moon />` toggle in `toolsNode` with an adaptive `ThemeSwitcher` component:
- **`light-dark-system`**: 3-button segmented pill (`Monitor`, `Sun`, `Moon`), highlighting the active preference.
- **`light-dark`**: 2-button segmented pill (`Sun`, `Moon`).
- **`button`**: Single compact toggle button switching light ↔ dark.
- **`dropdown`**: Accessible dropdown selector.
- **`themeSwitchEnabled === false`**: Omitted completely from reader chrome.

### 5.3 Desktop Sidebar Collapse & Hotkey
Across layout templates ([`docs-layout.tsx`](file:///d:/Workspace/Software/_working/cms-rs-3/packages/site/src/layouts/docs-layout.tsx), [`flux-layout.tsx`](file:///d:/Workspace/Software/_working/cms-rs-3/packages/site/src/layouts/flux-layout.tsx), etc.):
- Support `sidebarCollapsible` (defaults to true).
- Provide desktop collapse button `<PanelLeftClose />` / `<PanelLeftOpen />` in the sidebar dock / header.
- Support `Ctrl+B` / `Cmd+B` keyboard shortcut to toggle sidebar collapse.
- Persist user collapse preference in `sessionStorage` (`cms.sidebar.collapsed.${projectId}`).

### 5.4 Enhanced Table of Contents (TOC)
In [`packages/site/src/components/toc.tsx`](file:///d:/Workspace/Software/_working/cms-rs-3/packages/site/src/components/toc.tsx):
- Filter headings by `layout.tocDepth` (default `<= 3`).
- Implement visual indicator styles:
  - `'normal'`: Clean text tree with active primary color.
  - `'clerk'`: Vertical track border with active pip that animates/tracks the current section.
  - `'block'`: Rounded capsule / block active background behind the current heading.

---

## 6. Verification & Quality Gates

1. **Schema Validation Tests**:
   - Unit tests in `packages/validators/src/themes.test.ts` verifying all new `layout` fields parse valid inputs and reject illegal enums.
2. **Roundtrip Persistence Test**:
   - Test `theme-section.tsx` state updates to ensure `draft.theme.layout` correctly mutates, calculates `hasChanges`, and dispatches payload to `useUpdateProjectConfig`.
3. **Reader Layout Rendering Tests**:
   - Layout unit tests in `packages/site/src/layouts/*.test.tsx` verifying transparency classes, theme switcher modes, and sidebar collapse behavior.
4. **Linting & Typechecking**:
   - `bun run typecheck` across all packages.
   - `bun run check` (Ultracite / Biome) with 0 diagnostics.
5. **End-to-End Live Verification**:
   - Verify in browser dev server (`localhost:4310`):
     - Change settings in Studio Theme settings (e.g., set `themeSwitchMode` to `light-dark-system`, `headerTransparentMode` to `top`, and `tocStyle` to `clerk`).
     - Click **Save**.
     - Open `/sites/:projectId` (and `/app/projects/:projectId/preview`) and verify that the real reader executes these exact options.
