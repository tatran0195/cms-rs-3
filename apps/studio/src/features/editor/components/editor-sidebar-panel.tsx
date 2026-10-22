import { Button } from '@cms/design-system/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@cms/design-system/components/ui/dropdown-menu';
import { cn } from '@cms/design-system/lib/utils';
import { useT } from '@cms/i18n/react';
import type { Language, PageNode } from '@cms/sdk';
import { usePages, useReorderPages, useUpdateLanguage, useUpdateProjectConfig } from '@cms/sdk/react';
import type { NavAnchor, NavLink, NavTabItem } from '@cms/validators';
import { ExternalLink, FileText, FolderPlus, Layers, MoreHorizontal, Pin, Plus, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AnchorSettingsDialog } from './anchor-settings-dialog';
import { LinkSettingsDialog } from './link-settings-dialog';
import { LocaleSelector } from './locale-selector';
import { PageTreeSkeleton } from './page-tree-skeleton';
import { SortablePageTree } from './sortable-page-tree';
import { TabSettingsDialog } from './tab-settings-dialog';

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
    anchors?: NavAnchor[];
  };
  onSelectLanguage: (id: string) => void;
  onSelectPage: (id: string) => void;
  onAddPage: (parentId: string | null, languageId: string, slug?: string) => void;
  onInsertPage?: (node: PageNode, position: 'before' | 'after', relativeToId: string | null, languageId: string) => void;
  onAddGroup: (languageId: string, slug?: string) => void;
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
  isCreatingPage = false,
}: EditorSidebarPanelProps) {
  const t = useT();
  const [searchQuery, setSearchQuery] = useState('');

  // Dialog states
  const [tabDialogOpen, setTabDialogOpen] = useState(false);
  const [editingTab, setEditingTab] = useState<NavTabItem | null>(null);

  const [anchorDialogOpen, setAnchorDialogOpen] = useState(false);
  const [editingAnchor, setEditingAnchor] = useState<NavAnchor | null>(null);

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<NavLink | null>(null);

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
  const updateLanguage = useUpdateLanguage(projectId);
  const updateProject = useUpdateProjectConfig(projectId);

  const currentNavbarTabs = useMemo(
    () => (activeLangObj?.config?.navbar?.tabs ?? projectNavbar?.tabs ?? []) as NavTabItem[],
    [activeLangObj?.config?.navbar?.tabs, projectNavbar?.tabs],
  );

  const currentNavbarLinks = useMemo(
    () => (activeLangObj?.config?.navbar?.links ?? projectNavbar?.links ?? []) as NavLink[],
    [activeLangObj?.config?.navbar?.links, projectNavbar?.links],
  );

  const currentNavbarAnchors = useMemo(
    () => (activeLangObj?.config?.navbar?.anchors ?? projectNavbar?.anchors ?? []) as NavAnchor[],
    [activeLangObj?.config?.navbar?.anchors, projectNavbar?.anchors],
  );

  const filteredPages = useMemo(() => {
    const pages = allPages ?? [];
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
  }, [allPages, searchQuery]);

  const targetTab = useMemo(() => {
    if (currentNavbarTabs.length === 0) return null;
    if (selectedId) {
      const sel = (allPages ?? []).find((p) => p.id === selectedId);
      if (sel) {
        const cleanP = sel.path.replace(/^\/+|\/+$/g, '').toLowerCase();
        const cleanS = sel.slug.toLowerCase();
        const matched = currentNavbarTabs.find((t) => {
          const rawHref = (t.href ?? '').replace(/^\/+|\/+$/g, '').toLowerCase();
          return (
            rawHref &&
            (cleanP === rawHref ||
              cleanP.startsWith(`${rawHref}/`) ||
              cleanS === rawHref ||
              cleanS.startsWith(`${rawHref}-`) ||
              cleanS.startsWith(`${rawHref}/`))
          );
        });
        if (matched) return matched;
      }
    }
    return currentNavbarTabs[0];
  }, [currentNavbarTabs, selectedId, allPages]);

  // Construct unified tree nodes: if tabs exist, map tabs as root sections in single virtualized tree
  const displayPages = useMemo(() => {
    if (currentNavbarTabs.length === 0) {
      return filteredPages;
    }

    const assignedIds = new Set<string>();
    const treeNodes: PageNode[] = [];

    // Pre-index pages by parent
    const parentLookup = new Map<string, string | null>();
    for (const p of filteredPages) {
      parentLookup.set(p.id, p.parentId);
    }

    // 1. Create top-level root nodes for each tab
    currentNavbarTabs.forEach((tab, index) => {
      const tabId = `__tab__${tab.label}`;
      const rawHref = (tab.href ?? '').replace(/^\/+|\/+$/g, '').toLowerCase();

      const matchedIds = new Set<string>();
      for (const p of filteredPages) {
        const cleanP = p.path.replace(/^\/+|\/+$/g, '').toLowerCase();
        const cleanS = p.slug.toLowerCase();
        if (
          rawHref &&
          (cleanP === rawHref ||
            cleanP.startsWith(`${rawHref}/`) ||
            cleanS === rawHref ||
            cleanS.startsWith(`${rawHref}-`) ||
            cleanS.startsWith(`${rawHref}/`))
        ) {
          matchedIds.add(p.id);
        }
      }

      // Preserve ancestor groups
      for (const id of Array.from(matchedIds)) {
        let curr = parentLookup.get(id);
        while (curr) {
          matchedIds.add(curr);
          curr = parentLookup.get(curr);
        }
      }

      for (const id of Array.from(matchedIds)) {
        assignedIds.add(id);
      }

      // Add the tab root node
      treeNodes.push({
        id: tabId,
        parentId: null,
        languageId: currentLangId ?? '',
        kind: 'GROUP',
        title: tab.label,
        slug: tab.href ?? '',
        path: tab.href ?? '',
        icon: 'Layers',
        description: null,
        position: tab.position ?? index * 10,
        hidden: false,
        updatedAt: '',
      });

      // Add the tab's pages, re-pointing root pages to tabId
      for (const p of filteredPages) {
        if (matchedIds.has(p.id)) {
          treeNodes.push({
            ...p,
            parentId: p.parentId === null ? tabId : p.parentId,
          });
        }
      }
    });

    // 2. Tabs are strictly the top level of navigation; all other items sit inside them.
    // Any unassigned pages or groups are nested inside the primary tab so nothing sits along tabs at depth 0.
    const unassigned = filteredPages.filter((p) => !assignedIds.has(p.id));
    const primaryTab = currentNavbarTabs[0];
    if (unassigned.length > 0 && primaryTab) {
      const primaryTabId = `__tab__${primaryTab.label}`;
      for (const p of unassigned) {
        treeNodes.push({
          ...p,
          parentId: p.parentId === null ? primaryTabId : p.parentId,
        });
      }
    }

    return treeNodes;
  }, [filteredPages, currentNavbarTabs, currentLangId]);

  const isInitialLoading = (languagesPending && languages.length === 0) || (pagesPending && !allPages);
  const isStreamingUpdate = Boolean(isPlaceholderData || (isFetching && allPages && allPages.length > 0));

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {/* Consolidated Single Header Row */}
      <div className="flex items-center justify-between border-border border-b bg-muted/20 px-2 py-1">
        <div className="min-w-0 flex-1">
          {languages.length > 0 && (
            <LocaleSelector
              languages={languages}
              activeLanguageId={currentLangId}
              onSelect={onSelectLanguage}
              onAddLanguage={onAddLanguage}
              onLanguageSettings={onLanguageSettings}
              disabled={isCreatingPage}
            />
          )}
        </div>

        {/* Unified Creation Dropdown [ + ▾ ] */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 shrink-0 ms-1"
            aria-label="Add content or navigation"
            title="Add content or navigation"
            disabled={isCreatingPage}
          >
            <Plus className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 py-1">
              Content
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => {
                if (currentLangId) {
                  if (targetTab) {
                    const cleanHref = (targetTab.href ?? '').replace(/^\/+|\/+$/g, '');
                    onAddPage(null, currentLangId, cleanHref ? `${cleanHref}/untitled` : undefined);
                  } else {
                    onAddPage(null, currentLangId);
                  }
                }
              }}
              className="cursor-pointer flex items-center gap-2 text-xs"
            >
              <FileText className="size-3.5 text-muted-foreground" />
              <span>New page</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                if (currentLangId) {
                  if (targetTab) {
                    const cleanHref = (targetTab.href ?? '').replace(/^\/+|\/+$/g, '');
                    onAddGroup(currentLangId, cleanHref ? `${cleanHref}-new-group` : undefined);
                  } else {
                    onAddGroup(currentLangId);
                  }
                }
              }}
              className="cursor-pointer flex items-center gap-2 text-xs"
            >
              <FolderPlus className="size-3.5 text-muted-foreground" />
              <span>New group</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 py-1">
              Site Navigation
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => {
                setEditingTab(null);
                setTabDialogOpen(true);
              }}
              className="cursor-pointer flex items-center gap-2 text-xs"
            >
              <Layers className="size-3.5 text-muted-foreground" />
              <span>New tab</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setEditingAnchor(null);
                setAnchorDialogOpen(true);
              }}
              className="cursor-pointer flex items-center gap-2 text-xs"
            >
              <Pin className="size-3.5 text-muted-foreground" />
              <span>New anchor</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setEditingLink(null);
                setLinkDialogOpen(true);
              }}
              className="cursor-pointer flex items-center gap-2 text-xs"
            >
              <ExternalLink className="size-3.5 text-muted-foreground" />
              <span>New navbar link</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Filter pages search bar */}
      {(allPages?.length ?? 0) > 0 && (
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
      )}

      {/* Pinned Sidebar Anchors */}
      {currentNavbarAnchors.length > 0 && (
        <div className="border-border border-b px-2 py-1.5 space-y-0.5 bg-muted/10">
          {currentNavbarAnchors.map((anchor) => (
            <div
              key={anchor.label}
              className="group flex items-center justify-between rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            >
              <a
                href={anchor.href}
                target={anchor.external ? '_blank' : undefined}
                rel="noopener noreferrer"
                className="flex items-center gap-2 min-w-0 flex-1 truncate font-medium"
              >
                <Pin className="size-3 shrink-0 text-primary/70" />
                <span className="truncate">{anchor.label}</span>
                {anchor.external && <ExternalLink className="size-2.5 opacity-60" />}
              </a>
              <Button
                size="icon-xs"
                variant="ghost"
                className="opacity-0 group-hover:opacity-100 cursor-pointer size-5"
                onClick={() => {
                  setEditingAnchor(anchor);
                  setAnchorDialogOpen(true);
                }}
                aria-label={`Configure ${anchor.label}`}
              >
                <MoreHorizontal className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Indeterminate top streaming progress line */}
      {isStreamingUpdate && (
        <div className="relative h-0.5 w-full overflow-hidden bg-primary/15" role="progressbar">
          <div className="h-full w-1/3 bg-primary animate-pulse" />
        </div>
      )}

      {/* Main tree list area - single scroll container with full virtualization */}
      <div
        className={cn(
          'min-h-0 flex-1 flex flex-col overflow-hidden',
          isStreamingUpdate && 'opacity-70 transition-opacity duration-200 pointer-events-none',
        )}
        dir={dir}
      >
        {isInitialLoading ? (
          <PageTreeSkeleton count={8} />
        ) : displayPages.length === 0 ? (
          /* Empty state when no pages and no tabs exist */
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
            pages={displayPages}
            activeId={selectedId}
            treeKey={currentLangId ?? 'default'}
            onSelect={(id) => {
              if (!id.startsWith('__tab__')) {
                onSelectPage(id);
              }
            }}
            onAddChild={(parentId) => {
              if (currentLangId) {
                if (parentId?.startsWith('__tab__')) {
                  const tabLabel = parentId.replace('__tab__', '');
                  const tab = currentNavbarTabs.find((t) => t.label === tabLabel);
                  const cleanHref = (tab?.href ?? '').replace(/^\/+|\/+$/g, '');
                  if (cleanHref) {
                    onAddPage(null, currentLangId, `${cleanHref}/untitled`);
                  } else {
                    onAddPage(null, currentLangId);
                  }
                } else {
                  onAddPage(parentId, currentLangId);
                }
              }
            }}
            onSettings={(id) => {
              if (id.startsWith('__tab__')) {
                const tabLabel = id.replace('__tab__', '');
                const tab = currentNavbarTabs.find((t) => t.label === tabLabel);
                if (tab) {
                  setEditingTab(tab);
                  setTabDialogOpen(true);
                }
              } else {
                onOpenPageSettings(id);
              }
            }}
            onMove={(items) => {
              const cleaned = items
                .filter((it) => !it.id.startsWith('__tab__'))
                .map((it) => ({
                  id: it.id,
                  parentId: it.parentId?.startsWith('__tab__') ? null : it.parentId,
                  position: it.position,
                }));
              if (cleaned.length > 0) {
                reorderPages.mutate({ items: cleaned });
              }

              // Update tab positions alongside pages and groups
              const movedTabs = items.filter((it) => it.id.startsWith('__tab__'));
              if (movedTabs.length > 0) {
                const tabPosMap = new Map(movedTabs.map((t) => [t.id.replace('__tab__', ''), t.position]));
                let tabsChanged = false;
                const nextTabs = currentNavbarTabs.map((t) => {
                  const newPos = tabPosMap.get(t.label);
                  if (newPos !== undefined && newPos !== t.position) {
                    tabsChanged = true;
                    return { ...t, position: newPos };
                  }
                  return t;
                });
                if (tabsChanged) {
                  nextTabs.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
                  if (currentLangId) {
                    updateLanguage.mutate({
                      id: currentLangId,
                      body: { config: { navbar: { tabs: nextTabs } } },
                    });
                  } else {
                    updateProject.mutate({
                      config: { navbar: { tabs: nextTabs } },
                    });
                  }
                }
              }
            }}
            onInsertAfter={
              onInsertPage
                ? (node, parentId) => {
                    if (currentLangId) {
                      onInsertPage(node, 'after', parentId?.startsWith('__tab__') ? null : parentId, currentLangId);
                    }
                  }
                : undefined
            }
            onInsertBefore={
              onInsertPage
                ? (node, parentId) => {
                    if (currentLangId) {
                      onInsertPage(node, 'before', parentId?.startsWith('__tab__') ? null : parentId, currentLangId);
                    }
                  }
                : undefined
            }
          />
        )}
      </div>

      {/* Dialogs */}
      <TabSettingsDialog
        projectId={projectId}
        languageId={currentLangId}
        tab={editingTab}
        existingTabs={currentNavbarTabs}
        open={tabDialogOpen}
        onOpenChange={setTabDialogOpen}
      />

      <AnchorSettingsDialog
        projectId={projectId}
        languageId={currentLangId}
        anchor={editingAnchor}
        existingAnchors={currentNavbarAnchors}
        open={anchorDialogOpen}
        onOpenChange={setAnchorDialogOpen}
      />

      <LinkSettingsDialog
        projectId={projectId}
        languageId={currentLangId}
        link={editingLink}
        existingLinks={currentNavbarLinks}
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
      />
    </div>
  );
}
