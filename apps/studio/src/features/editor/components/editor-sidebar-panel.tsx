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
  projectNavbar?: {
    tabs?: NavTabItem[];
    links?: NavLink[];
  };
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

const noop = () => {
  // no-op fallback
};

export function EditorSidebarPanel({
  projectId,
  activeBranchId,
  selectedId,
  languages,
  languagesPending = false,
  activeLanguageId,
  projectNavbar,
  onSelectLanguage,
  onSelectPage,
  onAddPage,
  onInsertPage,
  onAddGroup,
  onOpenPageSettings,
  onAddLanguage = noop,
  onLanguageSettings = noop,
  onManageNavbar,
  isCreatingPage = false,
}: EditorSidebarPanelProps) {
  const t = useT();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTabHref, setActiveTabHref] = useState<string | null>(null);

  const currentLangId = activeLanguageId ?? languages[0]?.id ?? null;
  const activeLangObj = useMemo(() => languages.find((l) => l.id === currentLangId) ?? languages[0], [languages, currentLangId]);
  const dir = activeLangObj?.direction === 'RTL' ? 'rtl' : 'ltr';

  // Fetch pages concurrently without waiting for languagesPending
  const {
    data: allPages,
    isPending: pagesPending,
    isPlaceholderData,
    isFetching,
  } = usePages(projectId, currentLangId ?? undefined, activeBranchId ?? undefined);

  const reorderPages = useReorderPages(projectId);

  const currentNavbarTabs = useMemo(
    () => (activeLangObj?.config?.navbar?.tabs ?? projectNavbar?.tabs ?? []) as NavTabItem[],
    [activeLangObj?.config?.navbar?.tabs, projectNavbar?.tabs],
  );

  const currentNavbarLinks = useMemo(
    () => (activeLangObj?.config?.navbar?.links ?? projectNavbar?.links ?? []) as NavLink[],
    [activeLangObj?.config?.navbar?.links, projectNavbar?.links],
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
        <div className="relative h-0.5 w-full overflow-hidden bg-primary/15" role="progressbar">
          <div className="h-full w-1/3 bg-primary animate-pulse" />
        </div>
      )}

      {/* Main tree list area */}
      <div
        className={cn(
          'min-h-0 flex-1 flex flex-col overflow-hidden',
          isStreamingUpdate && 'opacity-70 transition-opacity duration-200 pointer-events-none',
        )}
        dir={dir}
      >
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
