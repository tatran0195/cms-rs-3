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
import { usePages, useReorderPages } from '@cms/sdk/react';
import type { NavAnchor, NavLink, NavTabItem } from '@cms/validators';
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  FolderPlus,
  Layers,
  MoreHorizontal,
  Pin,
  Plus,
  Search,
  X,
} from 'lucide-react';
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
  isCreatingPage = false,
}: EditorSidebarPanelProps) {
  const t = useT();
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedTabs, setCollapsedTabs] = useState<Record<string, boolean>>({});

  // Dialog states
  const [tabDialogOpen, setTabDialogOpen] = useState(false);
  const [editingTab, setEditingTab] = useState<NavTabItem | null>(null);

  const [anchorDialogOpen, setAnchorDialogOpen] = useState(false);
  const [editingAnchor, setEditingAnchor] = useState<NavAnchor | null>(null);

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<NavLink | null>(null);

  const currentLangId = activeLanguageId ?? languages[0]?.id ?? null;
  const activeLangObj = useMemo(
    () => languages.find((l) => l.id === currentLangId) ?? languages[0],
    [languages, currentLangId],
  );
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

  // Partition pages into tabs based on base path prefix
  const { tabGroups, unassignedPages } = useMemo(() => {
    const pages = filteredPages;
    if (currentNavbarTabs.length === 0) {
      return { tabGroups: [], unassignedPages: pages };
    }

    const assignedIds = new Set<string>();
    const groups = currentNavbarTabs.map((tab) => {
      const rawHref = (tab.href ?? '').replace(/^\/+|\/+$/g, '').toLowerCase();
      const matchedIds = new Set<string>();
      const parentLookup = new Map<string, string | null>();

      for (const p of pages) {
        parentLookup.set(p.id, p.parentId);
        const cleanP = p.path.replace(/^\/+|\/+$/g, '').toLowerCase();
        const cleanS = p.slug.toLowerCase();
        if (rawHref && (cleanP === rawHref || cleanP.startsWith(`${rawHref}/`) || cleanS === rawHref)) {
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

      for (const id of Array.from(matchedIds)) {
        assignedIds.add(id);
      }

      const tabPages = pages.filter((p) => matchedIds.has(p.id));
      return { tab, pages: tabPages };
    });

    const unassigned = pages.filter((p) => !assignedIds.has(p.id));
    return { tabGroups: groups, unassignedPages: unassigned };
  }, [filteredPages, currentNavbarTabs]);

  const toggleTabCollapse = (label: string) => {
    setCollapsedTabs((prev) => ({ ...prev, [label]: !prev[label] }));
  };

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
              onClick={() => currentLangId && onAddPage(null, currentLangId)}
              className="cursor-pointer flex items-center gap-2 text-xs"
            >
              <FileText className="size-3.5 text-muted-foreground" />
              <span>New page</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => currentLangId && onAddGroup(currentLangId)}
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

      {/* Main tree list area */}
      <div
        className={cn(
          'min-h-0 flex-1 flex flex-col overflow-y-auto',
          isStreamingUpdate && 'opacity-70 transition-opacity duration-200 pointer-events-none',
        )}
        dir={dir}
      >
        {isInitialLoading ? (
          <PageTreeSkeleton count={8} />
        ) : currentNavbarTabs.length > 0 ? (
          /* Approach B: Root Tab Sections in Tree */
          <div className="flex-1 divide-y divide-border/60">
            {tabGroups.map(({ tab, pages: tabPages }) => {
              const isCollapsed = collapsedTabs[tab.label] ?? false;
              return (
                <div key={tab.label} className="py-0.5">
                  <div className="group flex items-center justify-between px-2.5 py-1.5 text-xs font-semibold text-foreground/90 hover:bg-muted/40 transition-colors">
                    <button
                      type="button"
                      onClick={() => toggleTabCollapse(tab.label)}
                      className="flex items-center gap-1.5 min-w-0 flex-1 truncate cursor-pointer text-start"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
                      )}
                      <Layers className="size-3 text-primary/80 shrink-0" />
                      <span className="truncate uppercase tracking-wide text-[11px] font-bold">{tab.label}</span>
                      <span className="text-[10px] text-muted-foreground font-normal">({tabPages.length})</span>
                    </button>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        className="cursor-pointer size-6"
                        onClick={() => currentLangId && onAddPage(null, currentLangId)}
                        title={`Add page to ${tab.label}`}
                      >
                        <Plus className="size-3" />
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        className="cursor-pointer size-6"
                        onClick={() => {
                          setEditingTab(tab);
                          setTabDialogOpen(true);
                        }}
                        title="Tab settings"
                      >
                        <MoreHorizontal className="size-3" />
                      </Button>
                    </div>
                  </div>

                  {!isCollapsed && (
                    <div className="ps-2">
                      {tabPages.length === 0 ? (
                        <p className="px-6 py-2 text-[11px] text-muted-foreground/60 italic">No pages in this tab</p>
                      ) : (
                        <SortablePageTree
                          key={`${tab.label}-${currentLangId ?? 'default'}`}
                          pages={tabPages}
                          activeId={selectedId}
                          treeKey={`${tab.label}-${currentLangId ?? 'default'}`}
                          onSelect={onSelectPage}
                          onAddChild={(parentId) => currentLangId && onAddPage(parentId, currentLangId)}
                          onSettings={onOpenPageSettings}
                          onMove={(items) => reorderPages.mutate({ items })}
                          onInsertAfter={
                            onInsertPage
                              ? (node, parentId) => currentLangId && onInsertPage(node, 'after', parentId, currentLangId)
                              : undefined
                          }
                          onInsertBefore={
                            onInsertPage
                              ? (node, parentId) => currentLangId && onInsertPage(node, 'before', parentId, currentLangId)
                              : undefined
                          }
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Unassigned root pages, if any exist */}
            {unassignedPages.length > 0 && (
              <div className="py-0.5">
                <div className="flex items-center px-2.5 py-1.5 text-xs font-semibold text-muted-foreground">
                  <span className="uppercase tracking-wide text-[11px]">{t('editor.pages')}</span>
                  <span className="ms-1 text-[10px] font-normal">({unassignedPages.length})</span>
                </div>
                <div className="ps-2">
                  <SortablePageTree
                    key={`unassigned-${currentLangId ?? 'default'}`}
                    pages={unassignedPages}
                    activeId={selectedId}
                    treeKey={`unassigned-${currentLangId ?? 'default'}`}
                    onSelect={onSelectPage}
                    onAddChild={(parentId) => currentLangId && onAddPage(parentId, currentLangId)}
                    onSettings={onOpenPageSettings}
                    onMove={(items) => reorderPages.mutate({ items })}
                    onInsertAfter={
                      onInsertPage
                        ? (node, parentId) => currentLangId && onInsertPage(node, 'after', parentId, currentLangId)
                        : undefined
                    }
                    onInsertBefore={
                      onInsertPage
                        ? (node, parentId) => currentLangId && onInsertPage(node, 'before', parentId, currentLangId)
                        : undefined
                    }
                  />
                </div>
              </div>
            )}
          </div>
        ) : filteredPages.length === 0 ? (
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
          /* Standard nested tree when no tabs are configured */
          <SortablePageTree
            key={currentLangId ?? 'default'}
            pages={filteredPages}
            activeId={selectedId}
            treeKey={currentLangId ?? 'default'}
            onSelect={onSelectPage}
            onAddChild={(parentId) => currentLangId && onAddPage(parentId, currentLangId)}
            onSettings={onOpenPageSettings}
            onMove={(items) => reorderPages.mutate({ items })}
            onInsertAfter={
              onInsertPage
                ? (node, parentId) => currentLangId && onInsertPage(node, 'after', parentId, currentLangId)
                : undefined
            }
            onInsertBefore={
              onInsertPage
                ? (node, parentId) => currentLangId && onInsertPage(node, 'before', parentId, currentLangId)
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
