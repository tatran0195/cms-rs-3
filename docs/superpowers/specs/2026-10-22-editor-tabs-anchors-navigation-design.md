# Editor Navigation Redesign: Unified Creation Menu, Root Tab Sections, & Settings Dialogs

## 1. Overview & Problem Statement

Currently, the Studio Editor left sidebar ([editor-sidebar-panel.tsx](file:///d:/Workspace/Software/_working/cms-rs-3/apps/studio/src/features/editor/components/editor-sidebar-panel.tsx)) stacks 4 separate control rows vertically before displaying any content:
1. `LocaleSelector` with 5 separate icon buttons (`[ + ]`, `[ ⚙️ ]`, `[ 📄+ ]`, `[ 📁+ ]`, `[ ◂ ]`).
2. `SidebarTabsDropdown` full-width selector bar.
3. `Search` input (`Filter pages...`).
4. Page Tree.

This design wastes ~150px of vertical height, creates cognitive clutter, and separates tabs from the content hierarchy. Furthermore, in Project Settings ([navbar-scope-form.tsx](file:///d:/Workspace/Software/_working/cms-rs-3/apps/studio/src/features/project-settings/components/navbar/navbar-scope-form.tsx)), a bulky `TabsTreeEditor` was placed in the site Navbar section, confusing authors about where tabs should be created and configured.

This spec details the redesign following the **Mintlify Web Editor** interaction model:
1. Configured **Navbar Tabs** become **Top-Level Root Sections** directly in the editor page tree.
2. The stacked header rows and cluttered icon buttons are replaced with a single clean header containing a **Unified `[ + ▾ ]` Creation Dropdown** (`New Page`, `New Group`, `New Tab`, `New Anchor`, `New Link`).
3. Dedicated **Tab Settings Dialog**, **Anchor Settings Dialog**, and **Link Settings Dialog** for managing navigation primitives.
4. Tabs are removed from the Project Settings Navbar section.

---

## 2. Core Architecture & Data Model

### 2.1 Navigation Primitives Storage

All navigation primitives persist cleanly in the existing project and language configuration schemas ([packages/validators/src/index.ts](file:///d:/Workspace/Software/_working/cms-rs-3/packages/validators/src/index.ts)):
- **Tabs**: `config.navbar.tabs: NavTabItem[]` (`label`, `href`, `icon`, `items`, `external`).
- **Anchors**: `config.navbar.anchors: NavAnchor[]` (`label`, `href`, `icon`, `external`).
- **Links**: `config.navbar.links: NavLink[]` (`label`, `href`, `external`, `items`).

### 2.2 Tab-to-Page Association Model (Path Prefix)

Pages are mapped to Tabs based on URL path prefixes:
- When a Tab is defined with base path `/docs`, any page whose `path` starts with `/docs` or `/docs/...` belongs to the `Documentation` tab section.
- When a Tab is defined with base path `/api`, any page starting with `/api` belongs to the `API Reference` tab section.
- Pages without a matching tab prefix are rendered in a fallback `Other Pages` section or at the root level if no tabs exist.
- Adding a page inside a Tab pre-seeds the page path with that Tab's base path prefix.
- The published reader site ([SiteLayout.tsx](file:///d:/Workspace/Software/_working/cms-rs-3/packages/site/src/views/SiteLayout.tsx)) continues to read `config.navbar.tabs` seamlessly with zero regressions.

---

## 3. UI/UX Specifications

### 3.1 Editor Sidebar Header & Unified `[ + ▾ ]` Menu

The top of the sidebar is consolidated into a single header row (height: ~40px):
```
┌──────────────────────────────────────────────────────────────┐
│  [ 🌐 English ▾ ]                        [ + ▾ ]   [ ◂ ]     │
└──────────────────────────────────────────────────────────────┘
```

Clicking `[ + ▾ ]` opens a dropdown menu:
```
┌────────────────────────────────────────┐
│  CONTENT                               │
│  📄 New page               Ctrl+N      │
│  📁 New group                          │
├────────────────────────────────────────┤
│  SITE NAVIGATION                       │
│  📑 New tab                            │
│  ⚓ New anchor (Sidebar pin)            │
│  🔗 New navbar link                    │
└────────────────────────────────────────┘
```

- **New Page**: Opens new page modal or calls `onAddPage(null, currentLangId)`.
- **New Group**: Calls `onAddGroup(currentLangId)`.
- **New Tab**: Opens `TabSettingsDialog` in create mode.
- **New Anchor**: Opens `AnchorSettingsDialog` in create mode.
- **New Navbar Link**: Opens `LinkSettingsDialog` in create mode.

---

### 3.2 Sidebar Tree Hierarchy (Approach B Wireframe)

```
┌──────────────────────────────────────────────────────────────┐
│  [ 🌐 English ▾ ]                        [ + ▾ ]   [ ◂ ]     │  ← 1 clean header
├──────────────────────────────────────────────────────────────┤
│  [ 🔍 Filter pages...                                     ]  │  ← Slim search
├──────────────────────────────────────────────────────────────┤
│  ⚓ Community Forum                                 [···]     │  ← Pinned Sidebar Anchors
│  ⚓ API Status                                      [···]     │     (if configured)
├──────────────────────────────────────────────────────────────┤
│  ▼ 📚 DOCUMENTATION                             [+] [···]    │  ← Root Tab 1
│      ▼ Getting Started                                       │
│          Introduction                                        │
│          Quickstart                                          │
│      ▼ Guides                                                │
│          Installation                                        │
│                                                              │
│  ▼ ⚡ API REFERENCE                              [+] [···]    │  ← Root Tab 2
│      ▼ Endpoints                                             │
│          Authentication                                      │
│          Users                                               │
│                                                              │
│  ▼ 📄 OTHER PAGES (pages without matching tab prefix)        │
└──────────────────────────────────────────────────────────────┘
```

1. **Pinned Anchors**:
   - Rendered as compact, styled links at the top of the tree.
   - Hover reveals a `···` button to edit or remove the anchor.
2. **Root Tab Sections**:
   - Displayed as prominent, collapsible section headers with Tab title, icon, and page count badge.
   - Hover reveals:
     - `[+]`: Quick-adds a page or group pre-seeded with this Tab's base path prefix.
     - `[···]`: Opens context menu with **Tab settings**, **Rename**, and **Delete**.
3. **Fallback & Single-Tree Mode**:
   - If no tabs are configured in `config.navbar.tabs`, the page tree renders as a flat/nested tree without artificial tab wrappers.

---

### 3.3 Dialog Specifications

#### 1. `TabSettingsDialog` (`apps/studio/src/features/editor/components/tab-settings-dialog.tsx`)
- **Props**: `projectId`, `languageId`, `tab?: NavTabItem`, `allTabs: NavTabItem[]`, `open`, `onOpenChange`.
- **Fields**:
  - `label`: Name of the tab (required, e.g. "API Reference").
  - `href`: Base path prefix or URL (required, e.g. "/api"). Auto-slugified from label in create mode, editable.
  - `icon`: Optional icon identifier.
  - `external`: Boolean toggle if linking to an external website.
- **Actions**:
  - `Save Tab`: Appends or updates the tab in `config.navbar.tabs` and mutates via `useUpdateLanguage` / `useUpdateProjectConfig`.
  - `Delete Tab` (edit mode only): Confirms deletion with a safety prompt noting pages under this path will move to the default section.

#### 2. `AnchorSettingsDialog` (`apps/studio/src/features/editor/components/anchor-settings-dialog.tsx`)
- **Props**: `projectId`, `languageId`, `anchor?: NavAnchor`, `allAnchors: NavAnchor[]`, `open`, `onOpenChange`.
- **Fields**:
  - `label`: Name of anchor (e.g. "Community Forum").
  - `href`: URL/path (e.g. "https://community.example.com").
  - `icon`: Optional icon name.
  - `external`: Boolean toggle.
- **Actions**:
  - `Save Anchor`: Appends or updates `config.navbar.anchors`.
  - `Delete Anchor`: Removes from array.

#### 3. `LinkSettingsDialog` (`apps/studio/src/features/editor/components/link-settings-dialog.tsx`)
- **Props**: `projectId`, `languageId`, `link?: NavLink`, `allLinks: NavLink[]`, `open`, `onOpenChange`.
- **Fields**:
  - `label`: Name of link (e.g. "Changelog", "Status").
  - `href`: URL or route.
  - `external`: Boolean toggle.
- **Actions**:
  - `Save Link`: Appends or updates `config.navbar.links`.
  - `Delete Link`: Removes from array.

---

### 3.4 Project Settings Navbar Cleanup

1. **[navbar-scope-form.tsx](file:///d:/Workspace/Software/_working/cms-rs-3/apps/studio/src/features/project-settings/components/navbar/navbar-scope-form.tsx)**:
   - Remove `TabsTreeEditor` and the tabs field from the form UI.
   - The form remains dedicated to CTA label/URL, Navbar Links, Anchors, and Search/Changelog toggles.
2. **Form Handlers**:
   - In [project-navbar-form.tsx](file:///d:/Workspace/Software/_working/cms-rs-3/apps/studio/src/features/project-settings/components/navbar/project-navbar-form.tsx) and [language-navbar-form.tsx](file:///d:/Workspace/Software/_working/cms-rs-3/apps/studio/src/features/project-settings/components/navbar/language-navbar-form.tsx), ensure saving other navbar properties retains the existing `tabs` array in `config.navbar.tabs`.
3. **Deprecations**:
   - `SidebarTabsDropdown` ([sidebar-tabs-dropdown.tsx](file:///d:/Workspace/Software/_working/cms-rs-3/apps/studio/src/features/editor/components/sidebar-tabs-dropdown.tsx)) is superseded by root tab sections in the tree and can be deprecated/removed.

---

## 4. Error Handling & Edge Cases

1. **Pages with No Matching Tab**:
   - If 2 tabs exist (`/docs`, `/api`) but a page has path `/faq`, it must never disappear. It is placed under an `Other Pages` collapsible root section.
2. **Deleting a Tab**:
   - Deleting a Tab only removes the Tab entry from `config.navbar.tabs`. Pages are NOT deleted; their path prefix remains intact and they fall into the unassigned/default tree section.
3. **Duplicate Tab Base Paths**:
   - `TabSettingsDialog` validates that base paths are unique among tabs to avoid ambiguous page assignment.
4. **Empty State**:
   - If a newly created Tab has no pages yet, it displays an empty drop zone: `No pages in this tab yet. Click [+] to add one.`

---

## 5. Verification & Testing Plan

1. **Unit Tests**:
   - `tab-settings-dialog.test.tsx`: Test creation, editing, validation of path prefix, and deletion.
   - `anchor-settings-dialog.test.tsx`: Test anchor creation and removal.
   - `link-settings-dialog.test.tsx`: Test link creation and removal.
   - `editor-sidebar-panel.test.tsx`:
     - Test unified `+` menu options.
     - Test grouping pages into root Tab sections based on path prefix.
     - Test fallback section for unassigned pages.
     - Test pinned anchors rendering.
   - `navbar-scope-form.test.tsx`: Verify tabs field is removed and other fields persist without overwriting existing tabs.
2. **Type Checking & Linting**:
   - `bun run typecheck` across all workspaces.
   - `bun run check` (Biome) across all workspaces.
