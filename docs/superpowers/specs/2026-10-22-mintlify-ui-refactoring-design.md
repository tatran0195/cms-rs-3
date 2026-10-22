# Mintlify-Style UI Refactoring Design Specification

## 1. Overview & Problem Statement

Currently, the Studio Editor (`/app/projects/$projectId/editor`) renders in isolation by hiding the dashboard navigation chrome completely. This causes several UI/UX issues:
1. **Disconnected Navigation**: Authors lose access to project-level links (Overview, Analytics, Settings, Deployments) when entering the editor and must click a small `< Project Name` back button to exit.
2. **Double Toolbar Clutter**: The editor displays both a top bar and a full-width secondary document toolbar (`Visual | Rich text | Markdown`, `Comment`, `Undo/Redo`, `Word count`), eating up vertical screen real estate.
3. **Scattered Action Hierarchy**: Site configuration, preview, publish, and page creation actions are spread across multiple header bars rather than organized into intuitive primary and secondary zones.

This specification details the refactoring to adopt **Mintlify's modern 3-column architecture**:
- **Column 1: Persistent Left Activity Rail (~48px)**: Fast switching between Home, Search, Deployments, Analytics, and Settings without leaving the editor.
- **Column 2: Navigation Sidebar (~256px)**: Clean page tree hierarchy with root tabs, groups, and pinned footer action pills (`Site configuration`, `+ New page`).
- **Column 3: Borderless Canvas with Consolidated Top Bar**: Single streamlined top bar with save status, compact mode switcher, preview, and Mintlify-style `Publish ▾` button, giving maximum focus to the content.

---

## 2. Architecture & Layout Hierarchy

```
┌────┬────────────────────────────┬────────────────────────────────────────────────────────┐
│ 🌿 │ Navigation             [◂] │ [▸] 🔍 Ask agent (Ctrl+J)      Saved  [Visual▾] ▷ [Publish▾]│
│    ├────────────────────────────┴────────────────────────────────────────────────────────┤
│ 🏠 │ [ 🌐 English ▾ ]                                                                    │
│    │ [ 🔍 Filter pages... ]                                                              │
│ 🔍 │                                                                                     │
│    │ ▼ 📚 DOCUMENTATION                                                                   │
│ 🚀 │     ▼ Getting Started                                                               │
│    │         Introduction                                 Document Title                 │
│ 📊 │         Quickstart                                                                  │
│    │                                                      Subtitle / description...      │
│ ⚙️ │ ▼ ⚡ API REFERENCE                                                                   │
│    │     ▼ Endpoints                                                                     │
│    │         Authentication                                                              │
│    │                                                                                     │
│    ├────────────────────────────┤                                                        │
│ 🔔 │ [ ⚙️ Site configuration ]   │                                                        │
│ 👤 │ [ ➕ New page            ] │                                                        │
└────┴────────────────────────────┴────────────────────────────────────────────────────────┘
  ▲                ▲                                           ▲
(Rail ~48px)   (Sidebar ~256px)                          (Document Canvas)
```

### 2.1 Column 1: Persistent Activity Rail (`ActivityRail.tsx`)
- **Dimensions**: Fixed 48px width, full height, border-r border-border, subtle background (`bg-sidebar/95` or `bg-muted/30`).
- **Top Brand**: Project / CMS logo icon linking to `/app`.
- **Navigation Items**:
  - `Home` (`LayoutDashboard`): Navigates to `/app/projects/$projectId`.
  - `Search` (`Search`): Opens `CommandPalette` (`Ctrl+K`).
  - `Deployments` (`Rocket`): Opens in-place `DeployPipeline` modal/sheet.
  - `Analytics` (`BarChart3`): Navigates to `/app/projects/$projectId/analytics`.
  - `Settings` (`Settings`): Navigates to `/app/projects/$projectId/settings`.
- **Bottom Items**:
  - `NotificationsPopover`: Bell icon with unread indicator.
  - `SidebarAccountFooter`: User avatar with popover menu (Profile, Theme, Sign out).

### 2.2 Column 2: Navigation Sidebar (`EditorSidebarPanel.tsx`)
- **Dimensions**: Resizable ~256px (clamped between 200px and 480px), collapsible to 0px.
- **Header**:
  - Title: `Navigation`
  - Control: Single `PanelLeftClose` button to collapse the sidebar.
- **Body**:
  - Language selector dropdown (`[ 🌐 English ▾ ]`).
  - Search filter input (`Filter pages...`).
  - Virtualized navigation tree (Navbar Tabs as root sections, Groups, Pages, Anchors, Links).
- **Pinned Footer**:
  - `Site configuration` pill button (`SlidersHorizontal` icon): Toggles the in-editor configuration view (`view = 'config'`) without page reload.
  - `+ New page` primary dark pill button: Triggers the unified creation menu (`New page`, `New group`, `New tab`, `New anchor`, `New link`).

### 2.3 Column 3: Consolidated Top Action Bar & Canvas (`EditorPage.tsx`)
- **Consolidated Top Header (`h-12`)**:
  - **Left**:
    - Sidebar expand toggle (`PanelLeftOpen`) when the navigation sidebar is collapsed.
    - Quick search / command shortcut pill: `[ 🔍 Search or jump to... Ctrl+K ]`.
    - Compact branch switcher dropdown (`v1.0 ▾`).
  - **Right**:
    - `SaveStatusIndicator`: Status indicator (`Saved`, `Saving...`, `Unsaved`).
    - Document mode segmented control: Compact `[ Visual | Rich text | Markdown ]`.
    - Preview action: Minimal outline button with `Eye` icon.
    - `Publish ▾` action: White/bordered pill button with pending changes badge and dropdown trigger.
- **Canvas**:
  - Borderless, distraction-free writing space.
  - Completely removes the secondary document toolbar row.

---

## 3. Shell Integration & Route Management

### 3.1 `ProjectLayout.tsx` Alignment
Currently, `ProjectLayout.tsx` bypasses the shell completely when on `/editor`:
```tsx
if (pathname.endsWith('/editor')) {
  return <div className="h-screen overflow-hidden">{children}</div>;
}
```
We update `ProjectLayout.tsx` so that `ActivityRail` is shared cleanly:
- `ActivityRail` is rendered at the root of `ProjectLayout`.
- When navigating between `/editor`, `/settings`, `/analytics`, and `/`, the `ActivityRail` remains stable, avoiding layout jumps.
- When inside `/editor`, the second column is the `EditorSidebarPanel` (page tree), and the third column is the canvas.
- When outside `/editor` (e.g. `/settings` or `/analytics`), the second column is the standard project section navigation or full page content.

---

## 4. Responsive Breakpoints & State Persistence

### 4.1 Responsive Breakpoints
- **Desktop (≥ 1280px)**: 3-column layout (Activity Rail 48px + Navigation Sidebar 256px + Canvas 1fr).
- **Medium (768px – 1279px)**: Activity Rail visible (48px) + Navigation Sidebar as sliding drawer + Canvas 1fr.
- **Mobile (< 768px)**: Both Activity Rail and Navigation Sidebar tuck into an on-demand drawer.

### 4.2 State Persistence
- `cms.editor.sidebarCollapsed`: Boolean flag for sidebar visibility.
- `cms.editor.sidebarWidth`: Integer pixel width (200px – 480px).
- `cms.editor.contentMode`: Active editor mode (`visual` | `wysiwyg` | `markdown`).

---

## 5. Verification & Testing Strategy

1. **Unit & Component Tests**:
   - `ActivityRail.test.tsx`: Test item navigation, active route highlights, search trigger, and notifications popover.
   - `EditorSidebarPanel.test.tsx`: Test header collapse button, footer `Site configuration` and `+ New page` actions.
   - `EditorPage.test.tsx`: Verify top action bar consolidation, mode switching, preview, and publish modal triggers.
2. **Visual & Interaction Verification**:
   - Verify layout responsiveness across 1920px, 1280px, 1024px, and 768px viewport widths.
   - Confirm distraction-free canvas with zero secondary toolbar overhead.
   - Validate seamless transition between document editing and in-editor site configuration.
