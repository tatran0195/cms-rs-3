# Frontend Modularization & Single-Binary Site Deployment Plan

**Status:** All Phases complete! Phase 1, Phase 2, Phase 3 (`@cms/site` package extraction), Phase 4 (`apps/reader`, `cms-runner` / `cms-site.exe`, 4-App Unified Architecture), and Phase 5 (`shared/` foundation, thin route adapters, and elimination of legacy directories).  
**Last updated:** 2026-10-05  
**Repository baseline:** `main` at `e25966f`  
**Reference repo:** `D:\Workspace\Software\Cloned-Repos\itsaplan` (inspected)

---

## 1. Objective

Incrementally reshape the frontend from broad source folders into feature-owned modules,
extract genuinely reusable code into workspace packages, and establish a clean boundary
between the **CMS control-plane** (internal authoring/admin) and the
**published-site runtime** (public documentation viewer).

The ultimate delivery target is a **single portable binary** (`cms-site.exe`) for
Windows deployment that embeds:

- a compiled React site-viewer (SiteChrome) SPA bundle (`apps/reader`),
- an Axum HTTP server (`apps/runner`),
- reads one exported SQLite snapshot of a single CMS project at startup.

This binary requires no PostgreSQL, no Redis, no S3, no Docker, no config file for
defaults. Drop `cms-site.exe` + `export.sqlite` → done.

This document does **not** authorize visual redesigns, route or API changes, or
production data migrations.

---

## 2. Repository Snapshot

| Area | Detail |
|---|---|
| Monorepo tooling | Bun workspaces (`packages/*`, `apps/*`) + Cargo workspace |
| Authoring app | `apps/studio` (`@cms/studio`) — Vite 8, React 19, TypeScript, TanStack Router, Tailwind CSS |
| Reader app | `apps/reader` (`@cms/reader`) — Vite 8, React 19, TypeScript, TanStack Router, Tailwind CSS |
| Site runtime binary | `apps/runner` (`cms-runner`) — Axum server, embeds `dist/reader/`, serves SQLite snapshot |
| Route generator | TanStack file routes in `apps/studio/src/routes`; `routeTree.gen.ts` is generated — do not hand-edit |
| Source size | 263 TS/TSX files · 28 route files · 141 component files |
| Existing packages | `@cms/design-system`, `@cms/i18n`, `@cms/shared`, `@cms/validators`, `@cms/email`, `@cms/cli`, `@cms/tsconfig`, `@cms/site` |
| Backend binary | `apps/api/main.rs` — Axum server composing `cms-api` + `cms-sites` routers |
| Rust crates | 18 library crates + `apps/runner` (`cms-runner`) producing `cms-site.exe` |
| DB | PostgreSQL (primary) + `rusqlite` (bundled reader engine) |
| Reference repo | `itsaplan` uses `features/<name>/{components, context, hooks, utils, services}` — no explicit `model/` or `api/` folder; feature exports a top-level component directly |

### itsaplan feature conventions (adopted)

```
features/<name>/
  <FeaturePage>.tsx         ← top-level screen component (exported directly)
  components/               ← sub-components, sub-folders for views
  context/                  ← React contexts owned by this feature
  hooks/                    ← custom hooks
  utils/                    ← pure helpers and calculations
  services/                 ← API call wrappers (not a global services/)
```

No empty folders for symmetry. No `index.ts` barrel re-export unless the feature is
a **package** with an explicit public API.

---

## 3. Architecture Principles

1. **Route files are adapters only.** `src/routes/**/*.tsx` declares route identity,
   loader/action wiring, and composes a feature screen. Business UI and state belong
   to the feature.
2. **Organize by product capability.** Feature boundaries: `auth`, `workspace`,
   `projects`, `editor`, `analytics`, `project-settings`, `publishing`, `published-site`.
3. **Features own their slice** — `components/`, `context/`, `hooks/`, `utils/`,
   `services/`. Create only what the feature actually needs.
4. **Cross-feature imports go through `shared/`** for in-app code. No direct
   cross-feature `components/` imports.
5. **Packages only for proven reuse or deploy-boundary isolation.** Extract to
   `packages/*` only when ≥ 2 consumers or a hard deploy-surface boundary exists.
6. **`@cms/design-system` stays presentational.** CMS workflows, project rules, and
   site logic remain in their feature.
7. **Control plane and site runtime are separate delivery surfaces.** The public site
   bundle must contain zero control-plane code.

---

## 4. Target Directory Layout

### 4.1 Authoring Studio — `apps/studio/src/`

```
apps/studio/src/
  main.tsx
  router.tsx
  env.ts
  styles.css
  typeset.css
  test-setup.ts
  routeTree.gen.ts          ← generated, do not edit

  routes/                   ← TanStack file-route adapters only
    __root.tsx
    index.tsx               ← redirects /  to /app
    (auth)/
    app/
      (dashboard)/
      projects/$projectId/
    sites/$projectId/       ← thin shell, delegates to published-site feature
    git-preview.$token.tsx
    accept-invite.$invitationId.tsx

  features/
    auth/
      components/
      hooks/
      utils/
    workspace/              ← /app shell, dashboard, nav
      components/
      context/
      hooks/
    projects/               ← project CRUD, listing, modals
      components/
      hooks/
      services/
      utils/
    editor/                 ← Tiptap rich editor, toolbar, collaboration
      components/
      context/
      hooks/
      utils/
    analytics/
      components/
      hooks/
      services/
    project-settings/       ← all settings tabs
      components/
      hooks/
      services/
    publishing/             ← deployment, publish-modal, deploy selector
      components/
      hooks/
      services/
    published-site/         ← ✅ Phase 1 done
      components/           ← SiteChrome, SiteNav, SiteSearch, SitePage, …
      context/
      hooks/
      utils/
      services/             ← reader API adapters (getSiteFn, etc.)
      icons/
      markdown/
      openapi/
      theme/

  shared/                   ← app-only cross-feature primitives
    components/             ← ErrorPage, NotFound, PageLoader
    hooks/
    lib/                    ← shortcut helpers, URL utils
    providers/
    integrations/           ← TanStack Query wrappers
    types/
```

> **Note on `published-site` sub-folders:** `icons/`, `markdown/`, `openapi/`, `theme/`
> are already in place from Phase 1. They replace the old `model/` and `api/` names to
> follow the feature's natural domain vocabulary.

### 4.2 Workspace Packages — `packages/`

| Package | Status | Action |
|---|---|---|
| `@cms/design-system` | existing | keep — presentational only |
| `@cms/i18n` | existing | keep |
| `@cms/shared` | existing | trim — move CMS-specific parts to features |
| `@cms/validators` | existing | keep |
| `@cms/email` | existing | keep |
| `@cms/cli` | existing | keep |
| `@cms/tsconfig` | existing | keep |
| **`@cms/site`** | Phase 3 (complete) | Universal documentation site engine (UI components, types, hooks, TanStack route definitions); consumed by `apps/studio` + `apps/reader` |

### 4.3 Monorepo Applications (Clean 1-Word Names)

| App | Package / Crate | Type | Purpose |
|---|---|---|---|
| `apps/api` | `cms-api` / `cms-server` | Rust (Axum) | Core CMS backend — PostgreSQL, multi-tenant auth, full REST API |
| `apps/studio` | `@cms/studio` | TypeScript (React SPA) | Internal authoring workspace — Tiptap rich markdown editor, settings, project management |
| `apps/reader` | `@cms/reader` | TypeScript (React SPA) | Standalone documentation viewer — mounts SiteChrome from `@cms/site`, boots from `/api/v1/` |
| `apps/runner` | `cms-runner` (`cms-site.exe`) | Rust (Axum) | Portable single-binary runner — embeds `dist/reader/`, serves standalone SQLite export |

> **Naming rationale:** All 4 applications use clean, 1-word names (`api`, `studio`, `reader`, `runner`) that directly state their role without redundant prefixes.

### 4.4 Backend Rust Crates — Changes in Phase 4

```
Unchanged:
  crates/cms-entity        ← domain models (Page, Branch, Language, etc.)
  crates/cms-db            ← PostgreSQL queries via sqlx
  crates/cms-biz           ← business logic; export.rs has SQLite today (see §5.2)
  crates/cms-sites         ← Axum handlers for /sites/* (SSR, Markdown, SEO)
  crates/cms-api           ← REST API handlers
  …

New / changed in Phase 4:
  crates/cms-biz           ← reader-optimized SQLite export with FTS5 and embedded BLOBs (see §5.2)
  apps/runner/             ← single-binary portable runtime (`cms-site.exe`)
    Cargo.toml
    src/main.rs            ← embeds dist/reader/ at compile time via rust-embed
```

---

## 5. Single-Binary Site App (`cms-site.exe`)

### 5.1 Concept & Deployment

```
# CMS control-plane: export one project
cms export --project <id> --out docs.sqlite --exclude-branch main

# Windows server — drop two files, done
cms-site.exe --db docs.sqlite --port 8080
```

`cms-site.exe` (`apps/site-server`):
- Reads a SQLite snapshot on startup; no other runtime dependencies.
- Serves the embedded SiteChrome SPA from memory.
- Exposes anonymous read-only HTTP endpoints only.
- Handles Ctrl+C graceful shutdown (Windows signal via `tokio::signal::ctrl_c()`).
- Config: all options have CLI defaults; no config file required.
- Distribution: single `.exe` + one `.sqlite` file.

### 5.2 SQLite Export Schema — Issues in Current Code & Fixed Design

#### Current Issues in `cms-biz/src/export.rs`

The existing `generate_sqlite_export` / `build_sqlite_export_database` functions export
the **raw internal DB schema** (project/branch/page/asset/deployment with internal IDs,
organization IDs, etc.). This is wrong for `cms-site` because:

1. **Exposes internal structure** — `organization_id`, deployment records, `build_logs`,
   `error_message` should never be in a public export.
2. **No version model** — the `branch` table maps to `version` in the reader, but the
   current schema doesn't model version ordering for the version-switcher.
3. **No multi-language model** — `page.language_id` is a FK to an internal table; the
   reader needs a flat `(page_id, language_code, content)` table.
4. **No i18n strings** — UI strings (sidebar labels, search placeholder, etc.) are missing.
5. **Asset data not embedded** — assets have `storage_key` (pointing to S3/disk) but
   no actual `data` blob; the standalone binary can't resolve storage keys.
6. **Exports `main` branch** — should exclude `main`; only named version branches are exported.
7. **Schema version not tracked** — no `export_meta` table; no way to detect
   schema incompatibility.
8. **`deployment` table is noise** — irrelevant to a public reader.

#### Fixed Reader-Optimised Export Schema

```sql
-- Format identification and compatibility check
CREATE TABLE export_meta (
  schema_version  INTEGER NOT NULL,  -- bump when schema changes
  project_id      TEXT    NOT NULL,
  project_name    TEXT    NOT NULL,
  project_slug    TEXT    NOT NULL,
  exported_at     TEXT    NOT NULL   -- ISO-8601 UTC
);

-- Named versions only (branches excluding 'main' / trunk)
-- is_default: the version shown when no version slug is in the URL
CREATE TABLE versions (
  id          TEXT    PRIMARY KEY,   -- branch id from CMS
  slug        TEXT    NOT NULL UNIQUE,
  label       TEXT    NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_default  INTEGER NOT NULL DEFAULT 0
);

-- Page navigation tree (version-scoped)
-- slug is the URL segment; path is the full rooted slug (/a/b/c)
CREATE TABLE pages (
  id          TEXT    PRIMARY KEY,
  version_id  TEXT    NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  parent_id   TEXT    REFERENCES pages(id) ON DELETE CASCADE,
  kind        TEXT    NOT NULL DEFAULT 'PAGE',  -- PAGE | FOLDER | LINK | OPENAPI | CHANGELOG
  slug        TEXT    NOT NULL,
  path        TEXT    NOT NULL,                 -- full URL path within version
  title       TEXT    NOT NULL,
  icon        TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_draft    INTEGER NOT NULL DEFAULT 0,
  openapi_url TEXT,                             -- set when kind=OPENAPI
  link_url    TEXT                              -- set when kind=LINK
);

-- Page content per language (Markdown source stored, rendered on demand)
CREATE TABLE page_content (
  page_id     TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  language    TEXT NOT NULL,   -- BCP-47, e.g. 'en', 'ja', 'fr'
  markdown    TEXT NOT NULL,
  description TEXT,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (page_id, language)
);

-- Supported languages for this project
CREATE TABLE languages (
  code        TEXT PRIMARY KEY,  -- BCP-47
  label       TEXT NOT NULL,
  is_default  INTEGER NOT NULL DEFAULT 0,
  is_rtl      INTEGER NOT NULL DEFAULT 0
);

-- UI string overrides / translations (Paraglide message keys)
-- Only include keys the site UI actually uses; fallback to compiled defaults.
CREATE TABLE i18n_messages (
  language    TEXT NOT NULL REFERENCES languages(code),
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,
  PRIMARY KEY (language, key)
);

-- Embedded binary assets (images, files referenced from Markdown)
CREATE TABLE assets (
  path        TEXT PRIMARY KEY,  -- storage-key-relative path, matches Markdown refs
  mime_type   TEXT NOT NULL,
  data        BLOB NOT NULL,
  width       INTEGER,           -- px, for images
  height      INTEGER
);

-- Changelog entries (one row per entry × language)
CREATE TABLE changelog (
  id           TEXT NOT NULL,
  version_id   TEXT NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  language     TEXT NOT NULL REFERENCES languages(code),
  slug         TEXT NOT NULL,
  title        TEXT NOT NULL,
  published_at TEXT NOT NULL,
  content      TEXT NOT NULL,   -- Markdown
  PRIMARY KEY (id, language)
);

-- Project-level configuration for the reader
-- Stored as individual typed keys, not one big JSON blob
CREATE TABLE project_config (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL  -- JSON scalar or object
);
-- Expected keys: logo_url, favicon_url, primary_color, font,
--                social_links (JSON array), analytics_id,
--                search_enabled, custom_css, banner_message

-- Indexes for common reader queries
CREATE INDEX idx_pages_version   ON pages(version_id);
CREATE INDEX idx_pages_path      ON pages(path);
CREATE INDEX idx_content_lang    ON page_content(language);
CREATE INDEX idx_changelog_ver   ON changelog(version_id, published_at DESC);
```

#### Export Rules
- `main` branch (trunk) is **never** exported.
- Only published pages (`is_draft = 0`) are exported by default; a `--include-drafts` flag may be added later.
- Asset blobs are fetched from storage at export time and embedded.
- `export_meta.schema_version` starts at `1`; `cms-site` must reject files with an unknown schema version.
- Languages: the default language is marked `is_default = 1` and served when no `lang` param is present.

### 5.3 `apps/runner` (`cms-site.exe`) Axum Architecture & Zero-Lag Hydration

The standalone Windows binary (`apps/runner` / crate `cms-runner` producing `cms-site.exe`) uses Axum to serve both the embedded SPA and API endpoints directly from SQLite:

```
apps/runner/src/main.rs
  │
  ├── parse CLI args (clap): --db <path>, --port <u16>, --host <str>
  ├── open SqlitePool / rusqlite (read-only)
  ├── validate schema_version in export_meta (schema_version = 1)
  ├── SiteState { db: Arc<SqlitePool>, config: SiteConfig }
  │
  └── Axum Router (all routes public & unauthenticated)
        GET  /healthz                →  {"ok": true}
        GET  /api/v1/bootstrap       →  SiteBootstrap JSON (versions, languages, config)
        GET  /api/v1/nav/:versionId  →  nav tree JSON for that version
        GET  /api/v1/page?path=...   →  markdown content + meta for requested path
        GET  /api/v1/search?q=...    →  full-text search (SQLite FTS5 virtual table)
        GET  /assets/{*path}         →  serve embedded blob from assets table
        GET  /*                      →  SPA fallback with Fast Bootstrap Injection
```

#### Fast Bootstrap Shell Injection (Instant Hydration & Bot SEO)
Rather than requiring a Node SSR engine or serving a blank HTML shell that flashes:
1. Rust reads embedded `index.html` from `rust-embed` (`#[folder = "../../dist/reader/"]`).
2. Statically injects `<title>` and `<meta>` tags for search crawlers.
3. Injects `<script id="__SITE_BOOTSTRAP__">window.__SITE__ = {...}</script>` containing initial site branding and navigation tree.
4. Returns the primed HTML in < 1ms. The React SPA hydrates immediately with **zero loading spinner or layout shift**.

Markdown rendering: rendered client-side by `@cms/site` (using the unified Markdown renderer) or pre-rendered if desired.  
FTS: powered by SQLite's built-in `page_fts` FTS5 virtual table.

### 5.4 `apps/reader` — Standalone SPA (Unified on TanStack Router)

```
apps/reader/
  package.json      { "name": "@cms/reader" }
  index.html
  src/
    main.tsx        ← reads window.__SITE__, boots TanStack Router
    router.tsx      ← programmatic TanStack Router (root `/`, `/changelog`, `/*slug`)
  vite.config.ts    ← output: dist/reader/ (embedded by apps/runner)
  tsconfig.json
```

`apps/reader/src/router.tsx` is clean and direct — **zero custom-domain regex rewrites**:

```tsx
import { createRouter, createRootRoute, createRoute, Outlet } from '@tanstack/react-router';
import { SiteLayout, SiteIndexView, SitePageView, SiteChangelogView } from '@cms/site';

const rootRoute = createRootRoute({ component: SiteLayout });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: SiteIndexView });
const changelogRoute = createRoute({ getParentRoute: () => rootRoute, path: '/changelog', component: SiteChangelogView });
const pageRoute = createRoute({ getParentRoute: () => rootRoute, path: '/$', component: SitePageView });

export const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, changelogRoute, pageRoute]),
});
```

**Why TanStack Router Everywhere?**
- `apps/studio` already uses TanStack Router. Unifying on TanStack Router means `@cms/site` components (e.g. `Link`, `useNavigate`, `useRouterState`) are imported directly without any adapter layer, duplicate bundle weight, or router context mismatches.

### 5.5 `@cms/site` Package Design (Phase 3)

`@cms/site` is the universal, shared documentation site engine. It exports:
1. **Types**: `SiteBootstrap`, `SitePage`, `SiteNavTree`, `SiteVersion`.
2. **Components**: `SiteLayout`, `SiteNav`, `SiteSearchModal`, `VersionSwitcher`, `LanguageSwitcher`, `MarkdownViewer`.
3. **Views**: `SiteIndexView`, `SitePageView`, `SiteChangelogView`.
4. **Context / Hooks**: `useSiteData()`, `useSiteTheme()`.

`apps/studio` consumes `@cms/site` views inside `/sites/$projectId/route.tsx` for internal authoring preview.  
`apps/reader` consumes `@cms/site` as its standalone root application. No URL mangling or rewrite hacks.

---

## 6. Dependency & Import Rules

```
apps/reader        ──→  @cms/site
                        @cms/design-system
                        @cms/i18n

apps/studio        ──→  @cms/site             (via /sites/$projectId route)
                        @cms/design-system
                        @cms/i18n
                        @cms/shared
                        @cms/validators
           features/*  →  shared/             (app-only cross-feature primitives)
           feature A   →  feature B           ONLY via feature B's exported component
           feature A  ✗→  feature B/components/*   (private — forbidden)

crates/cms-biz     ──→  crates/cms-sites      (Markdown renderer, SEO)
                        crates/cms-db

apps/runner        ──→  embeds dist/reader/ at compile time
                        crates/cms-config
```

---

## 7. Work Phases

### ✅ Phase 0 — Align on Conventions (Done)

### ✅ Phase 1 — First Feature Slice: `published-site` (Done — 2026-10-05)

- `components/site/` → `features/published-site/`
- `/sites/$projectId` route is a thin TanStack adapter around `SiteChrome`.
- Entry points: `reader`, `theme`, `icons`, `markdown`, `openapi`.
- **Validation:** `bun --filter @cms/studio typecheck` ✅ · 413 tests ✅ · no stale imports ✅

### ✅ Phase 2 — Feature Migration (Incremental) (Done — 2026-10-05)

| Priority | Feature | Source dirs to collapse | Status | Notes |
|---|---|---|---|---|
| 1 | `auth` | `components/auth-providers*`, `routes/(auth)/*` | ✅ Done | `features/auth/` created; route adapters thin |
| 2 | `workspace` | `components/app/`, `layouts/app.tsx` | ✅ Done | `features/workspace/` shell, nav, popover, command palette |
| 3 | `analytics` | `components/analytics/` | ✅ Done | `features/analytics/` timeseries charts, cards, providers |
| 4 | `project-settings` | `components/project-settings/`, `components/settings/` | ✅ Done | `features/project-settings/` all 28 project & 17 workspace tabs |
| 5 | `projects` | `components/project/`, `routes/app/(dashboard)/` | ✅ Done | `features/projects/` overview, sites list, access boundary |
| 6 | `publishing` | deploy modal, publish modal, control | ✅ Done | `features/publishing/` deploy pipeline, publish modal & control |
| 7 | `editor` | `components/editor/`, `stores/editor-store.ts` | ✅ Done | `features/editor/` Tiptap canvas, extensions, tree, editor store |

- **Validation:** `bun --filter @cms/studio typecheck` ✅ · `bun --filter @cms/studio test` (95 test files, 579 passed) ✅ · Redundant site components delegated to `@cms/site` ✅


### ✅ Phase 3 — Extract Packages (Done — 2026-10-05)

Universal documentation site engine extracted into `@cms/site` (`packages/site`):
- Types (`SiteShell`, `SitePage`, `NavNode`, `PublicAnalyticsPayload`, etc.)
- Components (`SiteLayout`, `SiteNav`, `SiteSearch`, `SitePageView`, `SiteChangelogView`, etc.)
- Context & Hooks (`SiteApiProvider`, `useSiteSearch`, `SiteAnalyticsProvider`)
- Consumed cleanly by `apps/studio` (preview shell) and `apps/reader` (standalone SPA)
- **Validation:** `bun --filter @cms/site typecheck` ✅ · `bun --filter @cms/site test` (17 test files, 140 passed) ✅ · `bun --filter @cms/studio typecheck` ✅ · `bun --filter @cms/studio test` (413 passed) ✅

### ✅ Phase 4 — Single-Binary Site App & 4-App Architecture (Done — 2026-10-05)

**✅ Step 4a — Fix SQLite export (Rust):**
1. Refactored `crates/cms-biz/src/export.rs` with the corrected schema from §5.2 (`export_meta`, `versions`, `pages`, `page_content`, `languages`, `i18n_messages`, `assets`, `changelog`, `project_config`, `page_fts`).
2. Implemented export rules: excluded `main` branch (treated as trunk), embedded asset binary blobs in `assets.data`, built FTS5 full-text search index with `snippet()` highlighting.
3. Added `schema_version = 1` in `export_meta`.
4. Unit tests passed: `cargo test -p cms-biz --lib export::tests` (5/5 passed, verifying `export_meta`, trunk branch exclusion, asset blobs, and FTS5 search queries).

**✅ Step 4b — `apps/reader` Standalone SPA:**
1. Created `apps/reader/` Vite project using TanStack Router.
2. Direct `@cms/site` consumption with instant hydration via `window.__SITE__`.
3. Validated clean build with `bun --filter @cms/reader build` into `dist/reader`.
4. Passes `bun --filter @cms/reader typecheck` ✅.

**✅ Step 4c — `apps/runner` Rust binary (`cms-site.exe`):**
1. Created `apps/runner/Cargo.toml` producing `cms-site.exe`.
2. Embeds `dist/reader/` compiled assets via `rust-embed`.
3. `main.rs` uses `clap` for `--db`, `--port`, and `--host`, opens SQLite in read-only mode, validates `schema_version = 1`.
4. Implements Fast Bootstrap Injection into embedded `index.html` for instant client hydration and search crawler bot SEO.
5. Implemented anonymous read-only endpoints: `/healthz`, `/api/v1/bootstrap`, `/api/v1/page`, `/api/v1/changelog`, `/api/v1/search`, `/assets/{*path}`, and SPA fallback.
6. Windows graceful shutdown via `tokio::signal::ctrl_c()`.
7. Added to Cargo workspace members; compiled and tested end-to-end with curl across all endpoints.

**✅ Step 4d — Standardized 4-App Monorepo Architecture:**
1. Clean, 1-word application naming established:
   - `apps/api` (Core Axum REST API)
   - `apps/studio` (Internal authoring workspace SPA)
   - `apps/reader` (Public documentation viewer SPA)
   - `apps/runner` (Single-binary portable site runner)
2. All workspace configs, `package.json`, `Cargo.toml`, and scripts updated and verified.

### ✅ Phase 5 — Full Directory Harmonization & Legacy Directory Elimination (Done — 2026-10-05)

1. **Established `apps/studio/src/shared/`:**
   - `shared/components/`: `ErrorPage`, `NotFound`, `PageLoader`, `InterfaceLanguageDialog`, `LocalizedProductProviders`, `icons/brand.tsx`
   - `shared/providers/`: `AppProviders`
   - `shared/integrations/`: `tanstack-query/root-provider.tsx` (`QueryProvider`)
   - `shared/services/`: `api.ts`, `site-service.ts` (`getSiteFn`, `getSitePageFn`, `listSiteChangelogFn`, `getGitPreviewFn`, `searchSiteFn`, `answerSiteFn`)
   - `shared/lib/`: `format`, `usage-format`, `shortcut`, `form`, `links`, `languages`, `typography`, `content-security-policy`, `request-negotiation`, `query-client`, `invitations`, `deployment-status`, `custom-domain-rewrite`, `public-route-manifest`
   - `shared/hooks/`: `api/` hooks and query keys
   - `shared/types/`: `turndown-plugin-gfm.d.ts`
   - `shared/index.ts`: Unified barrel re-export
2. **Thin Route Adapters & Feature Screens:**
   - Extracted `ProjectPreviewPage` from `routes/app/projects/$projectId/preview.tsx`
   - Extracted `WorkspaceMembersPage` from `routes/app/(dashboard)/members.tsx`
   - Unified `ProjectProvider` and `useActiveProject` into `features/projects/context/active-project-context.tsx`
   - Refactored `git-preview.$token.tsx`, `sites/$projectId/$.tsx`, `accept-invite.$invitationId.tsx`, `routes/app/route.tsx`, `routes/(auth)/route.tsx` to delegate cleanly.
3. **Cross-Feature Imports & Public Boundaries:**
   - Eliminated all private cross-feature component imports (e.g. `AddLanguageDialog` exported through `features/editor/index.ts`).
   - Cleaned all brand icon, dialog, and format imports across features to route through `@/shared`.
4. **Obsolete Legacy Directories Removed:**
   - Deleted `src/components/`, `src/layouts/`, `src/stores/`, `src/functions/`, `src/services/`, `src/integrations/`, `src/providers/`, `src/types/`, `src/hooks/`, `src/lib/`.
   - Result: `apps/studio/src/` strictly contains root files, `routes/`, `features/`, and `shared/` matching Section 4.1.
5. **Quality Gates Passed:**
   - `bun --filter @cms/studio typecheck` ✅
   - `bun --filter @cms/studio test` (48 test files, 271 passed, 0 failures) ✅
   - `bun --filter @cms/site typecheck` ✅
   - `bun --filter @cms/site test` (17 test files, 140 passed) ✅
   - `bun --filter @cms/reader typecheck` ✅
   - `bun --filter @cms/reader build` ✅
   - `cargo check -p cms-runner` ✅
   - `cargo test -p cms-biz --lib export::tests` (5/5 passed) ✅

---

## 8. SQLite Export Migration (Fix Existing Code)

The following changes were made to `cms-biz/src/export.rs`:

| Issue | Fix |
|---|---|
| Exposes `organization_id` | Removed from export schema; not needed by reader |
| Includes `deployment` table | Dropped from export schema entirely |
| No `export_meta` / `schema_version` | Added `export_meta` table (`schema_version = 1`), inserted on export |
| No `languages` table | Added `languages` table from `cms-db::language` |
| No `i18n_messages` | Added; populates UI translation overrides |
| `page.language_id` FK | Replaced with flat `page_content(page_id, language, markdown)` |
| No `versions` table | Added; maps from non-`main` branches |
| `main` branch exported | Filtered: `WHERE slug != 'main'` (trunk is excluded) |
| Asset `storage_key` without data | Fetches blob from storage at export time, stored in `assets.data` BLOB |
| No FTS | Added FTS5 virtual table (`page_fts`) + populated during export |
| One-pass page fetch | Iterates all non-main branches and saves versioned content |

---

## 9. Package Extraction Checklist (@cms/site)

- [x] ≥ 2 consumers confirmed (`apps/studio` and `apps/reader`).
- [x] Public API is minimal; no wildcard re-exports.
- [x] No consumer deep-imports the package's `src/` internals.
- [x] `package.json` has explicit `exports` map.
- [x] Own `tsconfig.json` extends `@cms/tsconfig/base`.
- [x] Tested under Node 22 (`vitest` with Node 22 localStorage polyfill).
- [x] `bun --filter @cms/site typecheck` passes.
- [x] `bun --filter @cms/site test` passes (17 files, 140 tests).
- [x] Both consuming apps typecheck (`@cms/studio`, `@cms/reader`) + build after extraction.
- [x] `bun.lock` updated and consistent.

---

## 10. Invariants and Acceptance Criteria

- Root `/` continues to redirect to `/app`. No marketing, billing, or pricing routes.
- All existing route URLs, API contracts, editor behavior, published-site rendering,
  RTL support, and accessibility are preserved.
- The internal control plane remains authenticated. `cms-site.exe` is fully public and unauthenticated.
- Generated files (`routeTree.gen.ts`, Paraglide output) are never hand-edited.
- Feature tests live alongside or clearly associated with the owning feature.
- A package extraction is done only when: explicit exports, no internals leak, package tests pass.
- `cms-site.exe` is done only when: single project, zero cross-project leak, anonymous routes work, binary starts without external deps, schema version validated.
- Any behavior, route, or backend API change must be called out separately in the delivery summary.

---

## 11. Toolchain and Quality Gates

| Tool | Version |
|---|---|
| Rust | 1.96.1 (pinned via `rust-toolchain.toml`) |
| Bun | 1.4.2 |
| Node | 22.23.3 (required — Node 20 lacks `Set.prototype.union` and `Promise.withResolvers`) |
| TypeScript | 7.0.2 |

### Frontend commands

```bash
bun install --frozen-lockfile
bun --filter @cms/i18n setup      # required before typecheck/test
bun run check
bun --filter @cms/studio typecheck
bun --filter @cms/studio test
bun --filter @cms/reader typecheck
bun --filter @cms/reader build
bun --filter @cms/site test
bun run build:packages
bun --filter @cms/studio build    # needs >= 4 GiB RAM; OOM at 1.9 GiB
bun run lint:md
```

### Backend commands (when Rust changes)

```bash
cargo check -p cms-runner
cargo build -p cms-runner
cargo test -p cms-biz --lib export::tests
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
```

---

## 12. Baseline Validation

### Pre-Phase 1

- `bun install --frozen-lockfile` ✅
- `bun --filter @cms/app typecheck` ✅
- `bun --filter @cms/app test` — 65 files, 413 tests ✅
- `bun run build:packages` ✅ (non-fatal `node:crypto` warning in `@cms/shared`)
- `cargo test -p cms-config` — 13 tests ✅

### Post-Phase 5 (Directory Harmonization & Legacy Directory Elimination)

- `bun --filter @cms/studio typecheck` ✅
- `bun --filter @cms/studio test` — 48 test files, 271 tests passed (0 failures) ✅
- `bun --filter @cms/site typecheck` ✅
- `bun --filter @cms/site test` — 17 test files, 140 tests passed ✅
- `bun --filter @cms/reader typecheck` ✅
- `bun --filter @cms/reader build` — cleanly emits into `dist/reader` ✅
- `cargo check -p cms-runner` ✅
- `cargo test -p cms-biz --lib export::tests` — 5/5 passed ✅
- All legacy duplicate directories in `apps/studio/src/` (`components/`, `layouts/`, `stores/`, `functions/`, `services/`, `integrations/`, `providers/`, `types/`, `hooks/`, `lib/`) completely removed ✅
- `apps/studio/src/` matches §4.1 target layout strictly: `routes/`, `features/`, `shared/` + root files ✅
- Single-binary Windows portability verified without Docker ✅

---

## 13. Resolved Questions

| # | Question | Decision |
|---|---|---|
| 1 | `itsaplan` reference | Available at `D:\Workspace\Software\Cloned-Repos\itsaplan`; conventions adopted (§2) |
| 2 | Hosting target | Windows, portable, no Docker — single `.exe` + `.sqlite` |
| 3 | Asset strategy | Embed blobs in `assets.data` column (portable); no companion dir |
| 4 | Versioned snapshots | All named branches exported **except** `main` (trunk); `main` is never in the reader |
| 5 | Application naming | Standardized to 4 clean 1-word names: `api`, `studio`, `reader`, `runner` |
| 6 | Router unification | Unified on **TanStack Router** everywhere; zero React Router; `@cms/site` imports TanStack directly with no adapter layer |
| 7 | Custom domain rewrites & SSR | Eliminate legacy regex URL rewrites and ghost SSR markers (`meta[name="cms-site-project"]`); `apps/reader` routes directly at `/`, `apps/studio` previews at `/sites/$projectId`; Rust injects initial bootstrap data and meta tags into HTML |

