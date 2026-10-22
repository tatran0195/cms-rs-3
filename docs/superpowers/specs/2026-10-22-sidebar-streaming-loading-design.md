# Design Spec: Isolated Sidebar Tree with Streaming Loading & Shimmer Skeleton

## 1. Problem Statement
In the documentation workspace editor (`EditorPage.tsx`):
1. **Coupled Monolith**: `EditorPage.tsx` manages both canvas state (`title`, `content`, comments, word counts, visual/markdown modes) and the sidebar page tree (`allPages`, `searchQuery`, `activeTabHref`, `SortablePageTree`). Every keystroke in the document re-renders the page and triggers tree filtering recalculations.
2. **Data Waterfall**: `usePages` waited for `languagesPending ? undefined : projectId`, creating an artificial waterfall before page fetching even began.
3. **Jarring Loading UX**: Whenever languages or pages are loading (or during branch/locale switches), the tree unmounts completely and is replaced with a raw, unstyled text paragraph: `<p>Loading...</p>`, followed by an abrupt layout flash when items arrive.

## 2. Solution Overview
1. **Decoupled Sidebar Panel (`EditorSidebarPanel`)**: Extract the sidebar tree column into an isolated component with its own local filtering and tab selection state, fully decoupled from editor document keystrokes and comment rail interactions.
2. **Parallel Fetching & Cache Retention (`keepPreviousData`)**:
   - Remove the language-waterfall dependency in `usePages` so pages and languages fetch concurrently.
   - Configure TanStack Query v5 with `placeholderData: keepPreviousData` in `usePages`.
3. **Visual Streaming UX**:
   - Initial load: Render a dedicated `PageTreeSkeleton` matching exact `SortableRow` dimensions (32px row height, realistic hierarchy indentation, icons, animated shimmer bars).
   - Locale/Branch switch: Keep existing tree visible with an indeterminate top streaming progress line and subtle dimmed state (`opacity-70 pointer-events-none`) until the next tree data resolves.

## 3. Detailed Component Architecture

### A. Isolated Sidebar Component (`EditorSidebarPanel.tsx`)
Location: `apps/studio/src/features/editor/components/editor-sidebar-panel.tsx`
- **Props**:
  - `projectId: string`
  - `activeBranchId: string | null`
  - `selectedId: string | null`
  - `languages: Language[]`
  - `languagesPending: boolean`
  - `activeLanguageId: string | null`
  - `onSelectLanguage: (id: string) => void`
  - `onSelectPage: (id: string) => void`
  - `onAddPage: (parentId: string | null, languageId: string) => void`
  - `onAddGroup: (languageId: string) => void`
  - `onOpenPageSettings: (id: string) => void`
  - `onManageNavbar: () => void`
  - `isCreatingPage?: boolean`
- **Encapsulated State**:
  - `searchQuery: string`
  - `activeTabHref: string | null`
  - `filteredPages` memoization
  - Page tree reorder mutation integration
- **Benefits**:
  - Document typing in `EditorPage.tsx` does not trigger re-render of `EditorSidebarPanel` or `SortablePageTree`.
  - Independent lifecycle and state isolation.

### B. Shimmer Tree Skeleton (`PageTreeSkeleton.tsx`)
Location: `apps/studio/src/features/editor/components/page-tree-skeleton.tsx`
- **Layout Specifications**:
  - 8 mock rows with varying depths: `[0, 1, 1, 2, 0, 1, 1, 0]`.
  - Row height: 32px (`h-8`), matching `SortableRow`.
  - Margin inline start: `depth * 16px`.
  - Icon placeholder: `size-3.5 rounded-sm bg-muted/80`.
  - Label placeholder: `Skeleton` bar with natural widths (`w-1/3`, `w-2/3`, `w-1/2`, `w-3/5`, `w-2/5`).
  - Subtle pulsing animation (`animate-pulse`).
- **Zero Layout Shift**: The container height, padding, and inner element positions align exactly with real tree rows.

### C. Top Streaming Progress Indicator
Location: Top of page tree container in `EditorSidebarPanel.tsx`
- Displayed when `isPlaceholderData` or `isFetching && Boolean(pages)` is true.
- A 1.5px indeterminate gradient line across the top:
  `bg-primary/20 overflow-hidden relative` with an inner animated bar `animate-[streaming_1.2s_ease-in-out_infinite] bg-primary`.
- Existing tree receives `opacity-70 transition-opacity duration-200 pointer-events-none`.

## 4. Hook & Query Enhancements

### `usePages` in `packages/sdk/src/react/hooks/pages.ts`
- Import `keepPreviousData` from `@tanstack/react-query`.
- Configure:
  ```ts
  export const usePages = <T = PageNode>(projectId: string | undefined, languageId?: string, branchId?: string) => {
    const client = useCmsClient();
    return useQuery({
      queryKey: queryKeys.pages.all(projectId ?? '', languageId, branchId),
      enabled: Boolean(projectId),
      placeholderData: keepPreviousData,
      queryFn: async () => { ... }
    });
  };
  ```

## 5. Testing & Verification Plan
1. **Unit Tests**:
   - `page-tree-skeleton.test.tsx`: Verify skeleton renders expected number of placeholder items and applies proper depth margins without errors.
   - `editor-sidebar-panel.test.tsx`: Verify loading state shows skeleton initially, updates when pages load, and preserves active selection.
2. **Type Checking & Linting**:
   - Run `bun run typecheck` across all packages.
   - Run `bunx biome check` on new and modified files.
3. **Manual / End-to-End Validation**:
   - Open studio editor at `http://localhost:4310/app/projects/:id/editor`.
   - Verify initial load shows smooth shimmer skeleton rather than "Loading...".
   - Switch languages and branches; verify previous tree remains visible with subtle streaming line and smooth transition.
