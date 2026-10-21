# Design Spec: Virtualized Editor Sidebar with Locale Dropdown Selector

## 1. Problem Statement
In the documentation workspace editor sidebar (`EditorPage.tsx`), all configured project languages (English, Spanish, French, German, Japanese, etc.) were rendered simultaneously as vertically stacked sections (`orderedLanguages.map(lang => ...)`). When a project has multiple languages and hundreds or thousands of pages:
1. The sidebar height and DOM node count explode, causing severe lag and vertical overflow.
2. Multiple nested scroll containers (`[max-h-...]` inside the outer page container) create confusing double scrollbars.
3. Users lose visual context while scrolling past massive subtrees of other languages.

## 2. Solution Overview
1. **Locale Dropdown Selector**: Replace vertical language stacking with an active locale selector in the sidebar subheader. The sidebar renders the page tree exclusively for the active locale, with immediate access to switch languages, manage language settings, or add new languages via the dropdown menu.
2. **TanStack Virtual Integration**: Implement windowed virtualization via `@tanstack/react-virtual` across the full available sidebar height (`flex-1 min-h-0`), rendering only the visible tree nodes in the DOM with smooth scrolling and maintained `@dnd-kit` drag-and-drop support.

## 3. Detailed Component & UI Design

### A. Sidebar Header & Locale Subheader Layout
Located in `apps/studio/src/features/editor/EditorPage.tsx`:
- **Top Header**: Retains `PAGES` title, collapse toggle (`PanelLeftClose`).
- **Locale Subheader Bar**:
  - **Dropdown Trigger**:
    - Displays active language with globe icon: `[🌐 English · Default ▾]`.
    - Clicking opens a `@cms/design-system` DropdownMenu containing:
      - All available project languages sorted default-first.
      - Checkmark indicating currently active language.
      - Each item shows language label, code (`en`, `es`, etc.), and default badge if applicable.
      - Separator.
      - Actions: `+ Add Language...` (triggers `AddLanguageDialog`) and `⚙️ Language Settings` (triggers `LanguageSettingsDialog`).
  - **Quick Action Buttons** (aligned right in subheader):
    - `+` button: Add Page directly into active locale (root).
    - `📁+` button: Add Group directly into active locale (root).
    - `⚙️` button: Opens settings for current locale.
- **Search & Filter Input**:
  - Filter input operates instantly on the active language's tree.
  - Matches filter by title, slug, and path while keeping ancestor groups visible.

### B. Virtualized Page Tree (`SortablePageTree.tsx`)
Located in `apps/studio/src/features/editor/components/sortable-page-tree.tsx`:
- Outer container fills available space (`flex-1 min-h-0 relative w-full overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]`).
- Single scroll element managed by `parentRef`.
- `useVirtualizer`:
  - `count: flat.length`
  - `getScrollElement: () => parentRef.current`
  - `estimateSize: () => 32` (row height 32px)
  - `overscan: 10`
- Absolute positioning via `translateY(virtualRow.start)` within a wrapper whose total height is `virtualizer.getTotalSize()`.
- Resilient fallback for testing and non-DOM/SSR environments (`displayItems`).

## 4. State Management & Synchronization
1. **`activeLanguageId`**:
   - Initialized to:
     - URL param language if present / derived from active page `page.languageId`, OR
     - Project default language (`orderedLanguages.find(l => l.isDefault)?.id ?? orderedLanguages[0]?.id`).
   - When user clicks a different language in the dropdown:
     - `activeLanguageId` updates immediately.
     - Selected page (`selectedId`) switches to first page in that language (or `null` if none).
2. **Page Tree Cache**:
   - `pagesByLanguage` groups `allPages` by `languageId`.
   - `SortablePageTree` receives `pages={activeLangPages}` and `treeKey={activeLanguageId}`.
   - Collapsed group state is persisted per language (`cms.editor.collapsedGroups:${treeKey}`).

## 5. Verification & Testing Plan
1. **Visual & Interaction Verification (Playwright / Browser)**:
   - Navigate to `/app/projects/:projectId/editor`.
   - Confirm Locale Dropdown renders with active language (English).
   - Confirm virtual page tree renders correctly without overflow or double scrollbars.
   - Switch language to Spanish via dropdown. Confirm tree switches immediately to Spanish pages.
   - Verify creating a new page and group in Spanish works seamlessly.
   - Test search filter on large tree to ensure instant virtualized filtering.
2. **Automated Unit & Integration Tests**:
   - Run `bun test` / `vitest` in `apps/studio` to verify `SortablePageTree` tests pass.
   - Verify type checking (`tsc --noEmit`).
