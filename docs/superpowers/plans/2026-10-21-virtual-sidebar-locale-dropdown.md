# Virtual Sidebar & Locale Dropdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a dedicated Locale Selector dropdown in the editor sidebar subheader and virtualize the page tree using TanStack Virtual, eliminating vertical multi-language stacking and sidebar overflow.

**Architecture:** Replace the vertically stacked `orderedLanguages.map(...)` in `EditorPage.tsx` with a single active locale view driven by a `LocaleSelector` dropdown in the sidebar subheader. The selected locale's pages render in a full-height container virtualized by `@tanstack/react-virtual` in `SortablePageTree.tsx`, backed by backend fixes in `cms-db` ensuring complete page list fetching without SQL errors or 100-item truncation.

**Tech Stack:** React 19, `@tanstack/react-virtual` (v3), `@dnd-kit`, `@cms/design-system`, Tailwind CSS, Axum / SQLx (Rust backend).

## Global Constraints
- Internal company deployment only: NO billing, pricing, plans, or marketing routes.
- Preserve existing comments and docstrings.
- Follow existing design system tokens and patterns in `@cms/design-system`.

---

### Task 1: Fix Backend Page Query & Deserialization in cms-db and cms-api

**Files:**
- Modify: `crates/cms-db/src/page.rs:402-404` and `crates/cms-db/src/page.rs:114-133`
- Modify: `crates/cms-api/src/project/handlers/pages.rs:91-94`
- Test: `crates/cms-api/tests/test_04_page_hierarchy.rs`

**Interfaces:**
- Consumes: PostgreSQL `"Page"` table with `custom_id` column.
- Produces: `PageListItem` list via `/api/projects/{projectId}/pages` with `custom_id` supported and page limits scaled up to 10,000 for editor trees.

- [ ] **Step 1: Write/inspect failing test or curl check**

Verify that `crates/cms-db/src/page.rs` query matches `PageListItemRow` fields:
```bash
cargo test -p cms-api --test test_04_page_hierarchy
```

- [ ] **Step 2: Add custom_id to SELECT query in cms-db**

In `crates/cms-db/src/page.rs`, update line 403:
```rust
        let mut query_builder: QueryBuilder<Postgres> = QueryBuilder::new(
            r#"SELECT id, project_id, branch_id, language_id, parent_id, kind, path, slug, title, description, icon, config, translation_key, custom_id, position, is_published, created_at, updated_at FROM "Page" WHERE project_id = "#,
        );
```
And add `#[sqlx(default)]` to `custom_id` in `PageListItemRow` (lines 128) as a safety safeguard.

- [ ] **Step 3: Update page limit in cms-api project pages handler**

In `crates/cms-api/src/project/handlers/pages.rs`, update line 92 to allow up to 10,000 items (or full list when querying for tree):
```rust
    let page_size = query.limit.unwrap_or(10_000).clamp(1, 10_000);
    let page_num = query.offset.map(|o| (o / page_size as i64) + 1).unwrap_or(1) as u64;
    let mut result =
        cms_biz::page::PageService::list_pages(&state.biz_context(), &auth.user.id, query, page_num, page_size as u64)
            .await?;
```

- [ ] **Step 4: Compile and test backend**

Run: `cargo test -p cms-api --test test_04_page_hierarchy`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add crates/cms-db/src/page.rs crates/cms-api/src/project/handlers/pages.rs
git commit -m "fix(db): include custom_id in page query and raise editor page limit"
```

---

### Task 2: Create LocaleSelector Component for Editor Sidebar

**Files:**
- Create: `apps/studio/src/features/editor/components/locale-selector.tsx`
- Create: `apps/studio/src/features/editor/components/locale-selector.test.tsx`

**Interfaces:**
- Consumes: `Language[]`, `activeLanguageId: string | null`, callbacks `onSelect(id: string)`, `onAddLanguage()`, `onLanguageSettings(lang: Language)`, `onAddPage(langId: string)`, `onAddGroup(langId: string)`.
- Produces: `LocaleSelector` component rendering a dropdown selector trigger with quick action buttons.

- [ ] **Step 1: Write unit test for LocaleSelector**

Create `apps/studio/src/features/editor/components/locale-selector.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleSelector } from './locale-selector';
import type { Language } from '@cms/sdk';

const mockLanguages: Language[] = [
  { id: 'l-en', projectId: 'p1', code: 'en', label: 'English', direction: 'LTR', isDefault: true, position: 0, createdAt: '', updatedAt: '' },
  { id: 'l-es', projectId: 'p1', code: 'es', label: 'Spanish', direction: 'LTR', isDefault: false, position: 1, createdAt: '', updatedAt: '' },
];

describe('LocaleSelector', () => {
  it('renders active language label and default badge', () => {
    render(
      <LocaleSelector
        languages={mockLanguages}
        activeLanguageId="l-en"
        onSelect={vi.fn()}
        onAddLanguage={vi.fn()}
        onLanguageSettings={vi.fn()}
        onAddPage={vi.fn()}
        onAddGroup={vi.fn()}
      />
    );
    expect(screen.getByText('English')).toBeDefined();
    expect(screen.getByText('Default')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/studio/src/features/editor/components/locale-selector.test.tsx`
Expected: FAIL (file not found)

- [ ] **Step 3: Implement LocaleSelector**

Create `apps/studio/src/features/editor/components/locale-selector.tsx`:
```tsx
import { Button } from '@cms/design-system/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@cms/design-system/components/ui/dropdown-menu';
import { useT } from '@cms/i18n/react';
import type { Language } from '@cms/sdk';
import { Check, ChevronDown, FolderPlus, Globe, Plus, Settings2 } from 'lucide-react';
import { useMemo } from 'react';

export interface LocaleSelectorProps {
  languages: Language[];
  activeLanguageId: string | null;
  onSelect: (languageId: string) => void;
  onAddLanguage: () => void;
  onLanguageSettings: (language: Language) => void;
  onAddPage: (languageId: string) => void;
  onAddGroup: (languageId: string) => void;
  disabled?: boolean;
}

export function LocaleSelector({
  languages,
  activeLanguageId,
  onSelect,
  onAddLanguage,
  onLanguageSettings,
  onAddPage,
  onAddGroup,
  disabled = false,
}: LocaleSelectorProps) {
  const t = useT();
  const orderedLanguages = useMemo(
    () => [...languages].sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0) || a.position - b.position),
    [languages],
  );

  const activeLang = orderedLanguages.find((l) => l.id === activeLanguageId) ?? orderedLanguages[0];

  if (!activeLang) return null;

  return (
    <div className="flex items-center justify-between gap-1.5 border-border border-b bg-muted/20 px-2 py-1.5" data-testid="locale-selector">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-start text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label={`Select locale. Currently ${activeLang.label}`}
          >
            <Globe className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{activeLang.label}</span>
            <span className="text-[10px] text-muted-foreground uppercase">({activeLang.code})</span>
            {activeLang.isDefault && (
              <span className="shrink-0 rounded bg-accent px-1 py-0.2 font-medium text-[9px] text-accent-foreground">
                {t('editor.default') || 'Default'}
              </span>
            )}
            <ChevronDown className="ms-auto size-3 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {orderedLanguages.map((lang) => {
            const isSelected = lang.id === activeLang.id;
            return (
              <DropdownMenuItem
                key={lang.id}
                onClick={() => onSelect(lang.id)}
                className="flex cursor-pointer items-center justify-between text-xs"
              >
                <div className="flex min-w-0 items-center gap-2">
                  {isSelected ? <Check className="size-3.5 text-primary" /> : <span className="size-3.5" />}
                  <span className="truncate font-medium">{lang.label}</span>
                  <span className="text-[10px] text-muted-foreground uppercase">({lang.code})</span>
                </div>
                {lang.isDefault && (
                  <span className="shrink-0 rounded bg-accent px-1 text-[9px] text-accent-foreground">
                    {t('editor.default') || 'Default'}
                  </span>
                )}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onAddLanguage} className="flex cursor-pointer items-center gap-2 text-xs">
            <Plus className="size-3.5 text-muted-foreground" />
            <span>{t('editor.addLanguage') || 'Add language'}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onLanguageSettings(activeLang)}
            className="flex cursor-pointer items-center gap-2 text-xs"
          >
            <Settings2 className="size-3.5 text-muted-foreground" />
            <span>{t('editor.langSettings.settings') || 'Language settings'}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Quick actions for active language */}
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          size="icon-xs"
          variant="ghost"
          className="cursor-pointer"
          onClick={() => onAddGroup(activeLang.id)}
          aria-label={t('editor.newGroup')}
          title={t('editor.newGroup')}
          disabled={disabled}
        >
          <FolderPlus className="size-3" />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          className="cursor-pointer"
          onClick={() => onAddPage(activeLang.id)}
          aria-label={t('editor.newPage')}
          title={t('editor.newPage')}
          disabled={disabled}
        >
          <Plus className="size-3" />
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/studio/src/features/editor/components/locale-selector.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/editor/components/locale-selector.tsx apps/studio/src/features/editor/components/locale-selector.test.tsx
git commit -m "feat(studio): add LocaleSelector component for editor sidebar"
```

---

### Task 3: Refactor EditorPage to Use LocaleSelector and Single Tree

**Files:**
- Modify: `apps/studio/src/features/editor/EditorPage.tsx:100-110,670-760`

**Interfaces:**
- Consumes: `LocaleSelector`, `orderedLanguages`, `filteredPagesByLanguage`.
- Produces: Single active language page tree in sidebar without vertical stacking.

- [ ] **Step 1: Update EditorPage language state**

In `EditorPage.tsx`:
Add `activeLanguageId` state:
```tsx
  const [activeLanguageId, setActiveLanguageId] = useState<string | null>(null);

  // Sync activeLanguageId with default language once loaded
  useEffect(() => {
    if (!activeLanguageId && defaultLanguageId) {
      setActiveLanguageId(defaultLanguageId);
    }
  }, [defaultLanguageId, activeLanguageId]);

  // Sync activeLanguageId with selected page's language when user navigates
  useEffect(() => {
    if (page?.languageId && page.languageId !== activeLanguageId) {
      setActiveLanguageId(page.languageId);
    }
  }, [page?.languageId]);
```

- [ ] **Step 2: Update sidebar JSX to render LocaleSelector and single SortablePageTree**

In `EditorPage.tsx`, replace the `orderedLanguages.map(...)` block with:
```tsx
            {view === 'content' && orderedLanguages.length > 0 && (
              <LocaleSelector
                languages={orderedLanguages}
                activeLanguageId={activeLanguageId ?? defaultLanguageId}
                onSelect={(id) => {
                  setActiveLanguageId(id);
                  const firstInLang = (allPages ?? []).find((p) => p.languageId === id && p.kind === 'PAGE');
                  if (firstInLang) setSelectedId(firstInLang.id);
                }}
                onAddLanguage={() => setAddLangOpen(true)}
                onLanguageSettings={(lang) => setLangSettings(lang)}
                onAddPage={(langId) => addPage(null, langId)}
                onAddGroup={(langId) => addGroup(langId)}
                disabled={createPage.isPending}
              />
            )}
```
And render `SortablePageTree` for `activeLanguageId`:
```tsx
            <div className="flex-1 min-h-0 relative flex flex-col overflow-hidden">
              {view === 'config' ? (
                <div className="overflow-y-auto px-2 py-2">
                  <ConfigSectionList
                    active={configSection}
                    onSelect={(section) => {
                      setConfigSection(section);
                      setMobileSidebarOpen(false);
                    }}
                  />
                </div>
              ) : isPending ? (
                <p className="px-3 py-3 text-muted-foreground text-sm">{t('common.loading')}</p>
              ) : (
                (() => {
                  const currentLangId = activeLanguageId ?? defaultLanguageId;
                  const langPages = currentLangId ? (filteredPagesByLanguage.get(currentLangId) ?? []) : [];
                  const activeLangObj = orderedLanguages.find((l) => l.id === currentLangId);
                  const dir = activeLangObj?.direction === 'RTL' ? 'rtl' : 'ltr';

                  return (
                    <div className="flex-1 min-h-0 flex flex-col" dir={dir}>
                      {langPages.length === 0 ? (
                        <div className="p-4 text-center">
                          <p className="text-xs text-muted-foreground/70">{t('editor.noPagesYet')}</p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2 cursor-pointer text-xs"
                            onClick={() => currentLangId && addPage(null, currentLangId)}
                          >
                            <Plus className="size-3 mr-1" /> {t('editor.newPage')}
                          </Button>
                        </div>
                      ) : (
                        <SortablePageTree
                          pages={langPages}
                          activeId={activeTreeId}
                          treeKey={currentLangId ?? 'default'}
                          onSelect={(id) => {
                            setSelectedId(id);
                            setMobileSidebarOpen(false);
                            setFocusedTreeOpen(false);
                          }}
                          onAddChild={(parentId) => currentLangId && addPage(parentId, currentLangId)}
                          onSettings={(id) => setSettingsForId(id)}
                          onMove={(items) => reorderPages.mutate({ items })}
                        />
                      )}
                    </div>
                  );
                })()
              )}
            </div>
```

- [ ] **Step 3: Run type check in apps/studio**

Run: `bun run --cwd apps/studio typecheck`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add apps/studio/src/features/editor/EditorPage.tsx
git commit -m "feat(studio): integrate LocaleSelector and single-locale page tree in editor"
```

---

### Task 4: Enhance SortablePageTree TanStack Virtualization

**Files:**
- Modify: `apps/studio/src/features/editor/components/sortable-page-tree.tsx:385-458`
- Test: `apps/studio/src/features/editor/components/sortable-page-tree.test.tsx`

**Interfaces:**
- Consumes: `@tanstack/react-virtual` `useVirtualizer`, `@dnd-kit/core`.
- Produces: Smooth full-height virtualized tree list filling `flex-1 min-h-0` with zero overflow.

- [ ] **Step 1: Update SortablePageTree virtualizer container styling**

In `sortable-page-tree.tsx`, ensure the outer element fills `h-full flex-1 min-h-0`:
```tsx
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div ref={parentRef} className="relative h-full flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable] px-1 py-1">
          <div
            style={{
              height: `${virtualizer.getTotalSize() || flat.length * 32}px`,
              position: 'relative',
              width: '100%',
            }}
          >
            {displayItems.map((virtualRow) => {
              const item = flat[virtualRow.index];
              if (!item) return null;
              return (
                <div
                  key={item.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <SortableRow
                    id={item.id}
                    node={item.node}
                    depth={item.id === draggingId && projection ? projection.depth : item.depth}
                    active={activeId === item.id}
                    hasChildren={parentIds.has(item.id)}
                    collapsed={collapsed.has(item.id)}
                    onToggleCollapse={toggleCollapse}
                    onSelect={onSelect}
                    onAddChild={onAddChild}
                    onSettings={onSettings}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </SortableContext>
```

- [ ] **Step 2: Run test suite for SortablePageTree**

Run: `bun test apps/studio/src/features/editor/components/sortable-page-tree.test.tsx`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/studio/src/features/editor/components/sortable-page-tree.tsx
git commit -m "fix(studio): optimize SortablePageTree virtual container for full-height scrolling"
```

---

### Task 5: End-to-End Verification & Browser Validation

**Files:**
- Test in browser: `http://localhost:4310/app/projects/34c59d77-9474-439f-918e-40193594770d/editor`

- [ ] **Step 1: Build & restart cms-server with fix**

Run: `cargo build -p cms-server` and ensure backend is serving on port 3000.

- [ ] **Step 2: Run browser subagent verification**

Navigate to `http://localhost:4310/app/projects/34c59d77-9474-439f-918e-40193594770d/editor`:
- Verify LocaleSelector renders in sidebar subheader.
- Verify virtualized page tree scrolls cleanly with no double scrollbars.
- Open dropdown, switch to Spanish, verify tree switches cleanly.
- Verify search filter operates smoothly on virtual list.
- Take screenshot of editor sidebar.

- [ ] **Step 3: Run studio typecheck and test suites**

Run: `bun run --cwd apps/studio typecheck && bun test --cwd apps/studio`
Expected: PASS with 0 errors.

- [ ] **Step 4: Final commit and cleanup**

```bash
git status
```
