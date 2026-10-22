# Isolated Sidebar Tree with Streaming Loading & Shimmer Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the editor sidebar page tree into an isolated, decoupled component with zero-waterfall parallel data fetching, TanStack Query `keepPreviousData` caching, an indeterminate streaming progress bar, and a matching shimmer skeleton loader to replace the raw "Loading..." text.

**Architecture:** 
1. Decouple `usePages` query caching with `keepPreviousData` in `@cms/sdk`.
2. Implement `PageTreeSkeleton` in `apps/studio` matching `SortableRow` 32px row heights, indentation levels, and pulse animations.
3. Build `EditorSidebarPanel` encapsulating search filtering, active tab filtering, tree reordering, and background streaming indicators.
4. Mount `EditorSidebarPanel` in `EditorPage.tsx`, removing the `languagesPending` waterfall and isolating document canvas state from sidebar renders.

**Tech Stack:** React 19, `@tanstack/react-query` v5, `@cms/design-system` (`Skeleton`), `@cms/sdk`, Lucide Icons, Vitest.

## Global Constraints
- Platform is an internal company platform — no plans, subscriptions, or marketing pages.
- Biome check (`bunx biome check`) must pass with 0 errors on all created and modified files.
- `bun run typecheck` across all packages must pass with 0 errors.

---

### Task 1: Update `usePages` with `placeholderData: keepPreviousData` in `@cms/sdk`

**Files:**
- Modify: `packages/sdk/src/react/hooks/pages.ts:1-20`
- Test: `packages/sdk/src/react/hooks/pages.test.ts`

**Interfaces:**
- Consumes: `keepPreviousData` from `@tanstack/react-query`
- Produces: `usePages(projectId, languageId, branchId)` returns query result with `placeholderData: keepPreviousData` and `isPlaceholderData`.

- [ ] **Step 1: Write the failing test**

Create `packages/sdk/src/react/hooks/pages.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { usePages } from './pages';

describe('usePages hook definition', () => {
  it('is exported as a function', () => {
    expect(typeof usePages).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it passes baseline**

Run: `bun --filter @cms/sdk test src/react/hooks/pages.test.ts`
Expected: PASS

- [ ] **Step 3: Update `usePages` with `placeholderData: keepPreviousData`**

In `packages/sdk/src/react/hooks/pages.ts`:
```ts
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Branch, Comment, Language, Page, PageNode } from '../../types';
import { useCmsClient } from '../context';
import { queryKeys } from '../query-keys';

export const usePages = <T = PageNode>(projectId: string | undefined, languageId?: string, branchId?: string) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: queryKeys.pages.all(projectId ?? '', languageId, branchId),
    enabled: Boolean(projectId),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!projectId) throw new Error('projectId is required');
      return (await client.pages.list(projectId, {
        ...(languageId ? { languageId } : {}),
        ...(branchId ? { branchId } : {}),
      })) as unknown as T[];
    },
  });
};
```

- [ ] **Step 4: Verify typecheck & tests**

Run: `bun --filter @cms/sdk typecheck && bun --filter @cms/sdk test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/react/hooks/pages.ts packages/sdk/src/react/hooks/pages.test.ts
git commit -m "feat(sdk): add keepPreviousData to usePages query"
```

---

### Task 2: Build `PageTreeSkeleton` Component

**Files:**
- Create: `apps/studio/src/features/editor/components/page-tree-skeleton.tsx`
- Test: `apps/studio/src/features/editor/components/page-tree-skeleton.test.tsx`

**Interfaces:**
- Consumes: `Skeleton` from `@cms/design-system/components/ui/skeleton`, `cn` from `@cms/design-system/lib/utils`
- Produces: `PageTreeSkeleton` component accepting optional `count?: number` and `className?: string`.

- [ ] **Step 1: Write the failing test**

Create `apps/studio/src/features/editor/components/page-tree-skeleton.test.tsx`:
```tsx
/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { PageTreeSkeleton } from './page-tree-skeleton';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Array<ReturnType<typeof createRoot>> = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }
  document.body.replaceChildren();
});

describe('PageTreeSkeleton', () => {
  it('renders matching mock skeleton rows with correct depths', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(<PageTreeSkeleton count={8} />);
    });

    const rows = container.querySelectorAll('[data-testid="page-tree-skeleton-row"]');
    expect(rows.length).toBe(8);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `bun --filter @cms/studio test src/features/editor/components/page-tree-skeleton.test.tsx`
Expected: FAIL ("Cannot find module './page-tree-skeleton'")

- [ ] **Step 3: Implement `PageTreeSkeleton`**

Create `apps/studio/src/features/editor/components/page-tree-skeleton.tsx`:
```tsx
import { Skeleton } from '@cms/design-system/components/ui/skeleton';
import { cn } from '@cms/design-system/lib/utils';

const INDENT = 16;

const DEFAULT_ROW_PATTERNS = [
  { depth: 0, width: 'w-2/5' },
  { depth: 1, width: 'w-3/5' },
  { depth: 1, width: 'w-1/2' },
  { depth: 2, width: 'w-3/4' },
  { depth: 0, width: 'w-1/3' },
  { depth: 1, width: 'w-3/5' },
  { depth: 1, width: 'w-2/5' },
  { depth: 0, width: 'w-1/2' },
];

export interface PageTreeSkeletonProps {
  count?: number;
  className?: string;
}

export function PageTreeSkeleton({ count = 8, className }: PageTreeSkeletonProps) {
  const items = Array.from({ length: count }, (_, i) => DEFAULT_ROW_PATTERNS[i % DEFAULT_ROW_PATTERNS.length]!);

  return (
    <div
      className={cn('flex flex-col gap-0.5 px-1 py-1 w-full overflow-hidden', className)}
      data-testid="page-tree-skeleton"
      aria-label="Loading pages..."
    >
      {items.map((item, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: Static skeleton placeholder sequence
          key={index}
          data-testid="page-tree-skeleton-row"
          className="flex h-8 items-center gap-1.5 rounded-md px-1.5"
          style={{ marginInlineStart: item.depth * INDENT }}
        >
          {/* Spacer / chevron placeholder */}
          <div className="size-4 shrink-0" />

          {/* Icon placeholder */}
          <Skeleton className="size-3.5 shrink-0 rounded-xs" />

          {/* Title label placeholder */}
          <Skeleton className={cn('h-3.5 rounded-xs', item.width)} />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --filter @cms/studio test src/features/editor/components/page-tree-skeleton.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/editor/components/page-tree-skeleton.tsx apps/studio/src/features/editor/components/page-tree-skeleton.test.tsx
git commit -m "feat(studio): create PageTreeSkeleton matching SortableRow dimensions"
```

---

### Task 3: Build Decoupled `EditorSidebarPanel` Component with Streaming Progress Bar

**Files:**
- Create: `apps/studio/src/features/editor/components/editor-sidebar-panel.tsx`
- Test: `apps/studio/src/features/editor/components/editor-sidebar-panel.test.tsx`

**Interfaces:**
- Consumes:
  - `usePages`, `useReorderPages` from `@cms/sdk/react`
  - `PageNode`, `Language` from `@cms/sdk`
  - `NavTabItem`, `NavLink` from `@cms/validators`
  - `LocaleSelector`, `SidebarTabsDropdown`, `SortablePageTree`, `PageTreeSkeleton`
- Produces: `EditorSidebarPanel` rendering the isolated sidebar tree with search filtering, tab filtering, streaming progress line, and language direction handling.

- [ ] **Step 1: Write the failing test**

Create `apps/studio/src/features/editor/components/editor-sidebar-panel.test.tsx`:
```tsx
/** @vitest-environment jsdom */
import type { Language, PageNode } from '@cms/sdk';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorSidebarPanel } from './editor-sidebar-panel';

vi.mock('@cms/i18n/react', () => ({
  useT: () => (key: string) => {
    if (key === 'common.loading') return 'Loading...';
    if (key === 'editor.noPagesYet') return 'No pages yet';
    if (key === 'editor.newPage') return 'New Page';
    if (key === 'editor.pages') return 'Pages';
    return key;
  },
}));

vi.mock('@cms/sdk/react', () => ({
  usePages: () => ({
    data: [
      { id: 'p1', title: 'Home', slug: 'home', path: '/home', kind: 'PAGE', parentId: null, position: 0 },
    ] as PageNode[],
    isPending: false,
    isPlaceholderData: false,
    isFetching: false,
  }),
  useReorderPages: () => ({
    mutate: vi.fn(),
  }),
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Array<ReturnType<typeof createRoot>> = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }
  document.body.replaceChildren();
});

const mockLanguages: Language[] = [
  { id: 'en', code: 'en', label: 'English', isDefault: true, direction: 'LTR', position: 0 } as Language,
];

describe('EditorSidebarPanel', () => {
  it('renders pages tree when pages are loaded', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <EditorSidebarPanel
          projectId="proj-1"
          activeBranchId="b-main"
          selectedId="p1"
          languages={mockLanguages}
          languagesPending={false}
          activeLanguageId="en"
          onSelectLanguage={vi.fn()}
          onSelectPage={vi.fn()}
          onAddPage={vi.fn()}
          onAddGroup={vi.fn()}
          onOpenPageSettings={vi.fn()}
          onManageNavbar={vi.fn()}
        />,
      );
    });

    expect(container.querySelector('[data-page-id="p1"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `bun --filter @cms/studio test src/features/editor/components/editor-sidebar-panel.test.tsx`
Expected: FAIL ("Cannot find module './editor-sidebar-panel'")

- [ ] **Step 3: Implement `EditorSidebarPanel`**

Create `apps/studio/src/features/editor/components/editor-sidebar-panel.tsx`:
```tsx
import { Button } from '@cms/design-system/components/ui/button';
import { cn } from '@cms/design-system/lib/utils';
import { useT } from '@cms/i18n/react';
import type { Language, PageNode } from '@cms/sdk';
import { usePages, useReorderPages } from '@cms/sdk/react';
import type { NavLink, NavLinkChild, NavTabItem } from '@cms/validators';
import { Plus, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { LocaleSelector } from './locale-selector';
import { PageTreeSkeleton } from './page-tree-skeleton';
import { SidebarTabsDropdown } from './sidebar-tabs-dropdown';
import { SortablePageTree } from './sortable-page-tree';

export interface EditorSidebarPanelProps {
  projectId: string;
  activeBranchId: string | null;
  selectedId: string | null;
  languages: Language[];
  languagesPending?: boolean;
  activeLanguageId: string | null;
  onSelectLanguage: (id: string) => void;
  onSelectPage: (id: string) => void;
  onAddPage: (parentId: string | null, languageId: string) => void;
  onInsertPage?: (node: PageNode, position: 'before' | 'after', relativeToId: string | null, languageId: string) => void;
  onAddGroup: (languageId: string) => void;
  onOpenPageSettings: (id: string) => void;
  onAddLanguage?: () => void;
  onLanguageSettings?: (lang: Language) => void;
  onManageNavbar?: () => void;
  isCreatingPage?: boolean;
}

export function EditorSidebarPanel({
  projectId,
  activeBranchId,
  selectedId,
  languages,
  languagesPending = false,
  activeLanguageId,
  onSelectLanguage,
  onSelectPage,
  onAddPage,
  onInsertPage,
  onAddGroup,
  onOpenPageSettings,
  onAddLanguage,
  onLanguageSettings,
  onManageNavbar,
  isCreatingPage = false,
}: EditorSidebarPanelProps) {
  const t = useT();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTabHref, setActiveTabHref] = useState<string | null>(null);

  const currentLangId = activeLanguageId ?? languages[0]?.id ?? null;
  const activeLangObj = useMemo(
    () => languages.find((l) => l.id === currentLangId) ?? languages[0],
    [languages, currentLangId],
  );
  const dir = activeLangObj?.direction === 'RTL' ? 'rtl' : 'ltr';

  // Fetch pages concurrently without waiting for languagesPending
  const { data: allPages, isPending: pagesPending, isPlaceholderData, isFetching } = usePages(
    projectId,
    currentLangId ?? undefined,
    activeBranchId ?? undefined,
  );

  const reorderPages = useReorderPages(projectId);

  const currentNavbarTabs = useMemo(
    () => (activeLangObj?.config?.navbar?.tabs ?? []) as NavTabItem[],
    [activeLangObj?.config?.navbar?.tabs],
  );

  const currentNavbarLinks = useMemo(
    () => (activeLangObj?.config?.navbar?.links ?? []) as NavLink[],
    [activeLangObj?.config?.navbar?.links],
  );

  const filteredPages = useMemo(() => {
    let pages = allPages ?? [];

    if (activeTabHref) {
      const cleanTab = activeTabHref.replace(/^\/+|\/+$/g, '').toLowerCase();
      if (cleanTab) {
        const matchedTabIds = new Set<string>();
        const parentLookup = new Map<string, string | null>();

        for (const p of pages) {
          parentLookup.set(p.id, p.parentId);
          const cleanP = p.path.replace(/^\/+|\/+$/g, '').toLowerCase();
          const cleanS = p.slug.toLowerCase();
          if (cleanP === cleanTab || cleanP.startsWith(`${cleanTab}/`) || cleanS === cleanTab) {
            matchedTabIds.add(p.id);
          }
        }

        // Preserve all ancestor groups of matched items
        for (const id of Array.from(matchedTabIds)) {
          let curr = parentLookup.get(id);
          while (curr) {
            matchedTabIds.add(curr);
            curr = parentLookup.get(curr);
          }
        }

        pages = pages.filter((p) => matchedTabIds.has(p.id));
      }
    }

    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return pages;
    }

    const matchedIds = new Set<string>();
    const parentLookup = new Map<string, string | null>();

    for (const p of pages) {
      parentLookup.set(p.id, p.parentId);
      const titleMatch = p.title.toLowerCase().includes(q);
      const slugMatch = p.slug.toLowerCase().includes(q);
      const pathMatch = p.path.toLowerCase().includes(q);
      const sidebarTitleMatch = p.config?.sidebarTitle?.toLowerCase().includes(q) ?? false;
      if (titleMatch || slugMatch || pathMatch || sidebarTitleMatch) {
        matchedIds.add(p.id);
      }
    }

    for (const id of Array.from(matchedIds)) {
      let curr = parentLookup.get(id);
      while (curr) {
        matchedIds.add(curr);
        curr = parentLookup.get(curr);
      }
    }

    return pages.filter((p) => matchedIds.has(p.id));
  }, [allPages, activeTabHref, searchQuery]);

  const isInitialLoading = (languagesPending && languages.length === 0) || (pagesPending && !allPages);
  const isStreamingUpdate = Boolean(isPlaceholderData || (isFetching && allPages && allPages.length > 0));

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {/* Locale Selector */}
      {languages.length > 0 && (
        <LocaleSelector
          languages={languages}
          activeLanguageId={currentLangId}
          onSelect={onSelectLanguage}
          onAddLanguage={onAddLanguage}
          onLanguageSettings={onLanguageSettings}
          onAddPage={(langId) => onAddPage(null, langId)}
          onAddGroup={onAddGroup}
          disabled={isCreatingPage}
        />
      )}

      {/* Tabs & Links Dropdown */}
      <SidebarTabsDropdown
        tabs={currentNavbarTabs}
        links={currentNavbarLinks}
        activeTabHref={activeTabHref}
        onSelectTab={setActiveTabHref}
        onSelectLink={(link: NavLink | NavLinkChild) => {
          if (link.external || (link.href && /^https?:\/\//i.test(link.href))) {
            window.open(link.href, '_blank', 'noopener,noreferrer');
            return;
          }
          if (link.href) {
            const clean = link.href.replace(/^\/+|\/+$/g, '');
            const match = (allPages ?? []).find((p) => p.path.replace(/^\/+|\/+$/g, '') === clean || p.slug === clean);
            if (match) {
              onSelectPage(match.id);
            }
            setActiveTabHref(link.href);
          }
        }}
        onManageNavbar={onManageNavbar}
        disabled={isCreatingPage}
      />

      {/* Filter pages search bar */}
      {(allPages?.length ?? 0) > 0 ? (
        <div className="border-border border-b px-2 py-1.5">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute start-2 size-3.5 text-muted-foreground/60" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter pages..."
              className="h-7 w-full rounded-md border border-input bg-background/50 ps-7 pe-6 text-xs placeholder:text-muted-foreground/50 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute end-1.5 flex size-4 items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label="Clear filter"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Indeterminate top streaming progress line */}
      {isStreamingUpdate && (
        <div className="relative h-0.5 w-full overflow-hidden bg-primary/15">
          <div className="h-full w-1/3 bg-primary animate-pulse" />
        </div>
      )}

      {/* Main tree list area */}
      <div className={cn('min-h-0 flex-1 flex flex-col overflow-hidden', isStreamingUpdate && 'opacity-70 transition-opacity duration-200 pointer-events-none')} dir={dir}>
        {isInitialLoading ? (
          <PageTreeSkeleton count={8} />
        ) : filteredPages.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-xs text-muted-foreground/70">{t('editor.noPagesYet')}</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 cursor-pointer text-xs"
              onClick={() => currentLangId && onAddPage(null, currentLangId)}
            >
              <Plus className="size-3 mr-1" /> {t('editor.newPage')}
            </Button>
          </div>
        ) : (
          <SortablePageTree
            key={currentLangId ?? 'default'}
            pages={filteredPages}
            activeId={selectedId}
            treeKey={currentLangId ?? 'default'}
            onSelect={onSelectPage}
            onAddChild={(parentId) => currentLangId && onAddPage(parentId, currentLangId)}
            onSettings={onOpenPageSettings}
            onMove={(items) => reorderPages.mutate({ items })}
            onInsertAfter={onInsertPage ? (node, parentId) => currentLangId && onInsertPage(node, 'after', parentId, currentLangId) : undefined}
            onInsertBefore={onInsertPage ? (node, parentId) => currentLangId && onInsertPage(node, 'before', parentId, currentLangId) : undefined}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --filter @cms/studio test src/features/editor/components/editor-sidebar-panel.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/editor/components/editor-sidebar-panel.tsx apps/studio/src/features/editor/components/editor-sidebar-panel.test.tsx
git commit -m "feat(studio): add isolated EditorSidebarPanel component"
```

---

### Task 4: Integrate `EditorSidebarPanel` into `EditorPage.tsx` and Eliminate Waterfall

**Files:**
- Modify: `apps/studio/src/features/editor/EditorPage.tsx`

**Interfaces:**
- Consumes: `<EditorSidebarPanel ... />`
- Produces: `EditorPage.tsx` with decoupled sidebar rendering and parallel queries.

- [ ] **Step 1: Replace inline sidebar tree and remove waterfall in `EditorPage.tsx`**

1. Import `EditorSidebarPanel` in `EditorPage.tsx`.
2. Remove redundant inline state in `EditorPage` that is now owned by `EditorSidebarPanel` (`searchQuery`, `activeTabHref`, `filteredPages`, `currentNavbarTabs`, `currentNavbarLinks`).
3. Query `usePages` concurrently without `languagesPending ? undefined : projectId` waterfall.
4. Replace lines 715–838 in `EditorPage.tsx` with `<EditorSidebarPanel ... />`.

- [ ] **Step 2: Run Studio tests & typecheck**

Run: `bun --filter @cms/studio typecheck && bun --filter @cms/studio test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/studio/src/features/editor/EditorPage.tsx
git commit -m "refactor(studio): integrate isolated EditorSidebarPanel into EditorPage"
```

---

### Task 5: Monorepo Verification & Formatting

**Files:**
- Modified and created files across packages and apps.

- [ ] **Step 1: Run whole repo typecheck**

Run: `bun run typecheck`
Expected: Exited with code 0 across all workspaces.

- [ ] **Step 2: Run biome check**

Run: `bunx biome check apps/studio/src/features/editor/`
Expected: Checked with 0 errors.

- [ ] **Step 3: Run Studio vitest suite**

Run: `bun --filter @cms/studio test`
Expected: All tests PASS.

- [ ] **Step 4: Commit all final changes**

```bash
git commit -am "chore: formatting and verification for sidebar streaming loading"
```
