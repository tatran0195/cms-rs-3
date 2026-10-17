# Design Specification: Fumadocs Layouts Porting & Configurable Documentation Shells

**Date:** 2026-10-17  
**Status:** Approved  
**Topic:** Porting Fumadocs Layout Designs to `@cms/site` & Enabling User-Configurable Docs Layouts in Editor Settings

---

## 1. Overview & Context

Fumadocs (`fuma-nama/fumadocs`) provides modern, highly polished documentation layout architectures including the Standard Docs layout, card-style Notebook layout, translucent Glass layout, minimalist Flux layout, and Spacious layout.

The repository at `C:\Users\Admin\Downloads\_working\_clone\fumadocs` has been cloned and inspected, specifically its `@fumadocs/base-ui` (`packages/base-ui`) and `@fumadocs/tailwind` packages which utilize `@base-ui/react` and Tailwind CSS—matching the exact tech stack of `@cms/design-system`.

This specification details the porting of all 5 Fumadocs layout architectures directly into `@cms/site`, decoupling the documentation layout from color palettes so authors can pair any theme preset with any docs layout, and adding an interactive layout picker with real-time preview to the Studio Editor Settings and Project Settings.

---

## 2. Upstream Reference & Cloned Repository

- **Cloned Location:** `C:\Users\Admin\Downloads\_working\_clone\fumadocs`
- **Key Source Packages:**
  - `packages/base-ui/src/layouts/`:
    - `docs/`: Standard sidebar + sticky header + TOC layout.
    - `notebook/`: Elevated notebook card on tinted canvas background.
    - `glass/`: Frosted translucent floating sidebar and header with backdrop blur.
    - `flux/`: Streamlined distraction-free reading canvas with compact navigation.
    - `spacious/`: Inset content panel beside sidebar with generous outer padding.
  - `packages/base-ui/src/layouts/shared/`: Shared layout context, tab navigation, and responsive drawers.
  - `packages/tailwind/`: Design token CSS utility mappings and layout container styles.

---

## 3. Architecture & Monorepo Structure

Rather than creating a separate workspace package with unnecessary build/linking overhead, all layout designs will be ported cleanly into [`packages/site`](file:///d:/Workspace/Software/_working/cms-rs-3/packages/site) under `src/layouts/`.

```
packages/site/src/
├── layouts/
│   ├── index.ts               # Layout registry & layout resolver
│   ├── types.ts               # Layout slot definitions & props interfaces
│   ├── shared.tsx             # Shared layout shell frame, header bar, and drawer
│   ├── docs-layout.tsx        # Standard Docs layout
│   ├── notebook-layout.tsx    # Card-style Notebook layout
│   ├── glass-layout.tsx       # Frosted translucent Glass layout
│   ├── flux-layout.tsx        # Minimalist distraction-free Flux layout
│   └── spacious-layout.tsx    # Inset frame Spacious layout
├── components/
│   ├── documentation-theme-provider.tsx  # Enhanced to support DocsLayoutId
│   └── ...
└── views/
    ├── SiteLayout.tsx         # Unified site layout orchestrator passing slots to active layout
    └── SiteLayout.test.tsx    # Tests verifying layout resolution and slot rendering
```

### 3.1 Layout Slot Architecture

Each layout template conforms to the unified layout contract:

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
  nameKey: string;
  descriptionKey: string;
  ReaderLayout: (slots: DocsLayoutSlots) => ReactNode;
  ProjectPreviewLayout: (slots: ProjectPreviewSlots) => ReactNode;
  StudioPreviewLayout: (slots: StudioPreviewSlots) => ReactNode;
  PageLayout: (slots: DocsPageSlots) => ReactNode;
}
```

---

## 4. The 5 Ported Layouts

### 4.1 Standard Docs (`docs`)
- **Structure:** Classic three-column reference shell.
- **Header:** Sticky full-width header with brand, centered search pill, navigation links, switchers, and CTA.
- **Sidebar:** Bordered left rail (`w-64` / `16.5rem`) with scrollable hierarchical page tree.
- **Canvas:** Direct canvas placement (`bg-background`).
- **Page Outline:** Sticky right-hand table of contents with active scroll-spy heading tracking.

### 4.2 Notebook (`notebook`)
- **Structure:** Elevated card on canvas.
- **Header:** Integrated header sitting directly above the notebook paper or spanning canvas.
- **Canvas:** Tinted canvas background (`bg-muted/40`) framing an elevated paper card (`bg-card`, rounded-xl border, soft elevation shadow).
- **Sidebar:** Compact left navigation nestled beside the notebook frame.
- **Reading Measure:** Centered focused measure with margin outline.

### 4.3 Glass (`glass`)
- **Structure:** Modern translucent glassmorphic interface.
- **Header:** Floating top navbar with rounded-2xl pills, `backdrop-blur-md`, and semi-transparent background (`bg-background/70 border border-border/60 shadow-sm`).
- **Sidebar:** Floating translucent sidebar elevated over canvas.
- **Article & TOC:** Crisp content surface with subtle frosted glass accents.

### 4.4 Flux (`flux`)
- **Structure:** Minimalist, distraction-free reading canvas.
- **Header:** Slim compact top bar.
- **Sidebar:** Compact collapsible navigation rail with streamlined section dropdowns.
- **Canvas:** Maximized horizontal reading real estate, ideal for long-form tutorials and API specifications.

### 4.5 Spacious (`spacious`)
- **Structure:** Inset rounded container with generous outer padding.
- **Layout:** The page sits in an inset rounded panel beside a relaxed-spaced sidebar, with page-level actions at the top of the panel and ample breathing room.

---

## 5. Data Model & Schema (`@cms/shared` & `@cms/validators`)

### 5.1 Shared Types ([`packages/shared/src/themes.ts`](file:///d:/Workspace/Software/_working/cms-rs-3/packages/shared/src/themes.ts))
```ts
export type DocsLayoutId = 'docs' | 'notebook' | 'glass' | 'flux' | 'spacious';
export const DOCS_LAYOUT_IDS = ['docs', 'notebook', 'glass', 'flux', 'spacious'] as const satisfies readonly DocsLayoutId[];

export interface ThemeLayout {
  shell: 'reference' | 'editorial' | 'console' | DocsLayoutId;
  docsLayout?: DocsLayoutId;
  density: 'compact' | 'comfortable' | 'relaxed';
  radius: 'sharp' | 'rounded' | 'pill';
  contentWidth: 'focused' | 'balanced' | 'wide';
  header: 'inline' | 'stacked' | 'floating';
  sidebar: 'bordered' | 'soft' | 'rail';
  navigation: 'tree' | 'sectioned' | 'compact';
}
```

### 5.2 Schema Validation ([`packages/validators/src/themes.ts`](file:///d:/Workspace/Software/_working/cms-rs-3/packages/validators/src/themes.ts))
- Validates `docsLayout: z.enum(['docs', 'notebook', 'glass', 'flux', 'spacious']).optional()`.
- Backward compatibility: If `docsLayout` is not explicitly set, it resolves based on `shell`:
  - `reference` → `docs`
  - `editorial` → `notebook`
  - `console` → `flux`

---

## 6. Editor Settings UI (`apps/studio`)

### 6.1 Layout Picker in `ThemeSection.tsx`
Location: [`apps/studio/src/features/project-settings/components/theme-section.tsx`](file:///d:/Workspace/Software/_working/cms-rs-3/apps/studio/src/features/project-settings/components/theme-section.tsx)

1. **Docs Layout Card Gallery:**
   - Displayed prominently in the Theme & Styling section.
   - 5 selectable visual cards (`Standard Docs`, `Notebook`, `Glass`, `Flux`, `Spacious`).
   - Each card contains:
     - SVG wireframe preview thumbnail showing the sidebar/header/canvas architecture.
     - Localized layout title.
     - Concise description of the layout's aesthetic and ideal use case.
     - Active selection border and indicator (`aria-pressed`).
2. **Instant Live Preview:**
   - Selecting a layout updates `draft.theme.layout.docsLayout`.
   - The embedded [`ThemePreview`](file:///d:/Workspace/Software/_working/cms-rs-3/apps/studio/src/features/project-settings/components/theme-section.tsx#L79) instantly mounts the new layout template in real time.

---

## 7. Internationalization (`@cms/i18n`)

Add localized message keys in `en.json`, `zh-CN.json`, and `ja.json`:
- `settings.theme.docsLayout`: "Documentation Layout"
- `settings.theme.docsLayoutHint`: "Choose the structural layout design for your documentation site."
- `settings.theme.layout.docs.name`: "Standard Docs"
- `settings.theme.layout.docs.description`: "Classic documentation with persistent sidebar, sticky search header, and right-hand outline."
- `settings.theme.layout.notebook.name`: "Notebook"
- `settings.theme.layout.notebook.description`: "Card-style reading pane on a tinted canvas, evoking a modern digital handbook."
- `settings.theme.layout.glass.name`: "Glass"
- `settings.theme.layout.glass.description`: "Modern translucent floating panels with backdrop blur and frosted glass accents."
- `settings.theme.layout.flux.name`: "Flux"
- `settings.theme.layout.flux.description`: "Minimalist, distraction-free canvas with compact navigation."
- `settings.theme.layout.spacious.name`: "Spacious"
- `settings.theme.layout.spacious.description`: "Inset documentation frame with generous margins and relaxed breathing room."

---

## 8. Verification & Testing

1. **Unit Tests:**
   - `packages/shared/src/themes.test.ts`: Verify `docsLayout` resolution, fallback mapping, and serialization.
   - `packages/validators/src/themes.test.ts`: Validate Zod schema accepts all 5 `DocsLayoutId` values.
   - `packages/site/src/views/SiteLayout.test.tsx`: Render tests verifying each of the 5 layouts mounts correct DOM classes, slots, and `data-documentation-layout` attributes.
2. **Typecheck & Lint:**
   - `bun run typecheck` across all affected packages (`@cms/shared`, `@cms/validators`, `@cms/site`, `@cms/studio`, `apps/reader`).
3. **Interactive Studio & Reader Verification:**
   - Verify layout switching in Editor Settings (`site-config-panel` -> Themes).
   - Verify layout rendering in standalone reader (`apps/reader`) and published preview (`/sites/$projectId`).
