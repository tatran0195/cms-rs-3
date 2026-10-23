import { Button } from '@cms/design-system/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@cms/design-system/components/ui/dropdown-menu';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@cms/design-system/components/ui/input-group';
import { cn } from '@cms/design-system/lib/utils';
import { useT } from '@cms/i18n/react';
import type { Language, PageNode } from '@cms/sdk';
import { usePages, useReorderPages, useUpdateLanguage, useUpdatePage, useUpdateProjectConfig } from '@cms/sdk/react';
import { slugify } from '@cms/shared/utils';
import type { NavAnchor, NavLink, NavTabItem } from '@cms/validators';
import { ExternalLink, FileText, FolderPlus, Layers, MoreHorizontal, Pin, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
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
  onInsertPage?: (
    node: PageNode,
    position: 'before' | 'after',
    relativeToId: string | null,
    languageId: string,
    slug?: string,
  ) => void;
  onAddGroup: (languageId: string, slug?: string) => void;
  onOpenPageSettings: (id: string) => void;
  onAddLanguage?: () => void;
  onLanguageSettings?: (lang: Language) => void;
  onManageNavbar?: () => void;
  onOpenSiteConfig?: () => void;
  isCreatingPage?: boolean;
}

export function getTabPrefix(tab: NavTabItem | null | undefined): string {
  if (!tab) return '';
  const rawHref = tab.href?.trim() ?? '';
  if (/^(?:https?:)?\/\//i.test(rawHref)) {
    return slugify(tab.label);
  }
  const noQuery = rawHref.split('?')[0] ?? '';
  const cleaned = noQuery
    .replace(/#/g, '-')
    .replace(/^\/+|\/+$/g, '')
    .trim()
    .toLowerCase();

  if (cleaned) {
    return cleaned;
  }
  return slugify(tab.label);
}

export function findTabForPage(
  page: Pick<PageNode, 'path' | 'slug'>,
  tabs: NavTabItem[],
): NavTabItem | null {
  if (!tabs || tabs.length === 0) return null;

  const sortedTabs = [...tabs]
    .map((t) => ({ tab: t, prefix: getTabPrefix(t) }))
    .filter((item) => item.prefix.length > 0)
    .sort((a, b) => b.prefix.length - a.prefix.length);

  const cleanP = (page.path ?? '').replace(/^\/+|\/+$/g, '').toLowerCase();
  const cleanS = (page.slug ?? '').toLowerCase();

  for (const { tab, prefix } of sortedTabs) {
    if (
      cleanP === prefix ||
      cleanP.startsWith(`${prefix}/`) ||
      cleanP.startsWith(`${prefix}-`) ||
      cleanS === prefix ||
      cleanS.startsWith(`${prefix}-`) ||
      cleanS.startsWith(`${prefix}/`)
    ) {
      return tab;
    }
  }

  return null;
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
  onOpenSiteConfig,
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
  const updatePage = useUpdatePage(projectId);
  const updateLanguage = useUpdateLanguage(projectId);
  const updateProject = useUpdateProjectConfig(projectId);
  const [selectedTabLabel, setSelectedTabLabel] = useState<string | null>(null);

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
    if (selectedTabLabel) {
      const found = currentNavbarTabs.find((t) => t.label === selectedTabLabel);
      if (found) return found;
    }
    if (selectedId) {
      const sel = (allPages ?? []).find((p) => p.id === selectedId);
      if (sel) {
        const found = findTabForPage(sel, currentNavbarTabs);
        if (found) return found;
      }
    }
    return currentNavbarTabs[0];
  }, [currentNavbarTabs, selectedTabLabel, selectedId, allPages]);

  // Construct unified tree nodes: if tabs exist, map tabs as root sections in single virtualized tree
  const displayPages = useMemo(() => {
    if (currentNavbarTabs.length === 0) {
      return filteredPages;
    }

    // 1. Direct page-to-tab matches (most specific prefix wins)
    const pageTabMap = new Map<string, NavTabItem>();
    for (const p of filteredPages) {
      const matchedTab = findTabForPage(p, currentNavbarTabs);
      if (matchedTab) {
        pageTabMap.set(p.id, matchedTab);
      }
    }

    // 2. Ancestor propagation: if child has a tab, its parent group belongs to the same tab
    const childrenByParent = new Map<string, string[]>();
    for (const p of filteredPages) {
      if (p.parentId) {
        const list = childrenByParent.get(p.parentId) ?? [];
        list.push(p.id);
        childrenByParent.set(p.parentId, list);
      }
    }

    for (const p of filteredPages) {
      const tab = pageTabMap.get(p.id);
      if (tab) {
        let currParentId = p.parentId;
        while (currParentId) {
          if (!pageTabMap.has(currParentId)) {
            pageTabMap.set(currParentId, tab);
          }
          const parentObj = filteredPages.find((item) => item.id === currParentId);
          currParentId = parentObj?.parentId ?? null;
        }
      }
    }

    // 3. Descendant propagation: if parent group has a tab, all its children/descendants belong to that tab
    const propagateToChildren = (parentId: string, tab: NavTabItem) => {
      const childIds = childrenByParent.get(parentId) ?? [];
      for (const cid of childIds) {
        if (!pageTabMap.has(cid)) {
          pageTabMap.set(cid, tab);
        }
        propagateToChildren(cid, tab);
      }
    };
    for (const p of filteredPages) {
      const tab = pageTabMap.get(p.id);
      if (tab) {
        propagateToChildren(p.id, tab);
      }
    }

    // 4. Default remaining unassigned pages to primary tab
    const primaryTab = currentNavbarTabs[0];
    if (primaryTab) {
      for (const p of filteredPages) {
        if (!pageTabMap.has(p.id)) {
          pageTabMap.set(p.id, primaryTab);
        }
      }
    }

    const treeNodes: PageNode[] = [];

    // 5. Construct virtual tree nodes: each tab is a root group, with its assigned pages inside
    currentNavbarTabs.forEach((tab, index) => {
      const tabId = `__tab__${tab.label}`;
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

      for (const p of filteredPages) {
        if (pageTabMap.get(p.id) === tab) {
          treeNodes.push({
            ...p,
            parentId: p.parentId === null ? tabId : p.parentId,
          });
        }
      }
    });

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
          <DropdownMenuContent align="end" className="w-48">
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
          <InputGroup density="compact" className="h-7 bg-background/50 text-xs">
            <InputGroupAddon align="inline-start">
              <Search className="size-3.5 text-muted-foreground/60" />
            </InputGroupAddon>
            <InputGroupInput
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter pages..."
              className="text-xs placeholder:text-muted-foreground/50"
            />
            {searchQuery ? (
              <InputGroupAddon align="inline-end">
                <InputGroupButton size="icon-xs" onClick={() => setSearchQuery('')} aria-label="Clear filter">
                  <X className="size-3" />
                </InputGroupButton>
              </InputGroupAddon>
            ) : null}
          </InputGroup>
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
              if (id.startsWith('__tab__')) {
                const tabLabel = id.replace('__tab__', '');
                setSelectedTabLabel(tabLabel);
              } else {
                const sel = (allPages ?? []).find((p) => p.id === id);
                if (sel) {
                  const found = findTabForPage(sel, currentNavbarTabs);
                  if (found) setSelectedTabLabel(found.label);
                }
                onSelectPage(id);
              }
            }}
            onAddChild={(parentId) => {
              if (currentLangId) {
                if (parentId?.startsWith('__tab__')) {
                  const tabLabel = parentId.replace('__tab__', '');
                  const tab = currentNavbarTabs.find((t) => t.label === tabLabel);
                  const prefix = getTabPrefix(tab);
                  onAddPage(null, currentLangId, prefix ? `${prefix}/untitled` : undefined);
                } else {
                  const parentNode = (allPages ?? []).find((p) => p.id === parentId);
                  const tab = parentNode ? findTabForPage(parentNode, currentNavbarTabs) : null;
                  const prefix = getTabPrefix(tab ?? targetTab);
                  onAddPage(parentId, currentLangId, prefix ? `${prefix}/untitled` : undefined);
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

              // Detect cross-tab moves and update page slug with destination tab prefix
              if (currentNavbarTabs.length > 0) {
                for (const it of items) {
                  if (it.id.startsWith('__tab__')) continue;
                  const originalPage = (allPages ?? []).find((p) => p.id === it.id);
                  if (!originalPage) continue;

                  let destTab: NavTabItem | null = null;
                  if (it.parentId?.startsWith('__tab__')) {
                    const tabLabel = it.parentId.replace('__tab__', '');
                    destTab = currentNavbarTabs.find((t) => t.label === tabLabel) ?? null;
                  } else if (it.parentId) {
                    const parentPage = (allPages ?? []).find((p) => p.id === it.parentId);
                    destTab = parentPage ? findTabForPage(parentPage, currentNavbarTabs) : null;
                  }

                  const origTab = findTabForPage(originalPage, currentNavbarTabs);
                  if (destTab && origTab && destTab.label !== origTab.label) {
                    const origPrefix = getTabPrefix(origTab);
                    const destPrefix = getTabPrefix(destTab);

                    let baseSlug = originalPage.slug;
                    if (origPrefix && baseSlug.startsWith(`${origPrefix}-`)) {
                      baseSlug = baseSlug.slice(origPrefix.length + 1);
                    } else if (origPrefix && baseSlug.startsWith(`${origPrefix}/`)) {
                      baseSlug = baseSlug.slice(origPrefix.length + 1);
                    } else if (origPrefix && baseSlug === origPrefix) {
                      baseSlug = 'page';
                    }

                    const nextSlug = destPrefix ? `${destPrefix}-${baseSlug}` : baseSlug;
                    if (nextSlug !== originalPage.slug) {
                      updatePage.mutate({
                        pageId: it.id,
                        body: { slug: nextSlug },
                      });
                    }
                  }
                }
              }

              if (cleaned.length > 0) {
                reorderPages.mutate({ items: cleaned });
              }

              // Update tab positions only if tab order actually changed
              const movedTabs = items.filter((it) => it.id.startsWith('__tab__'));
              if (movedTabs.length > 1) {
                const orderedLabels = movedTabs
                  .sort((a, b) => a.position - b.position)
                  .map((t) => t.id.replace('__tab__', ''));
                const currentLabels = currentNavbarTabs.map((t) => t.label);
                const orderChanged = orderedLabels.some((lbl, idx) => lbl !== currentLabels[idx]);
                if (orderChanged) {
                  const nextTabs: NavTabItem[] = orderedLabels
                    .map((lbl, idx) => {
                      const existing = currentNavbarTabs.find((t) => t.label === lbl);
                      return existing ? { ...existing, position: (idx + 1) * 10 } : null;
                    })
                    .filter((t): t is NonNullable<typeof t> => t !== null);

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
                      const effectiveParentId = parentId?.startsWith('__tab__') ? null : parentId;
                      let tab: NavTabItem | null = null;
                      if (parentId?.startsWith('__tab__')) {
                        const tabLabel = parentId.replace('__tab__', '');
                        tab = currentNavbarTabs.find((t) => t.label === tabLabel) ?? null;
                      } else {
                        tab = findTabForPage(node, currentNavbarTabs);
                      }
                      const prefix = getTabPrefix(tab ?? targetTab);
                      const slug = prefix ? `${prefix}/untitled` : undefined;
                      onInsertPage(node, 'after', effectiveParentId, currentLangId, slug);
                    }
                  }
                : undefined
            }
            onInsertBefore={
              onInsertPage
                ? (node, parentId) => {
                    if (currentLangId) {
                      const effectiveParentId = parentId?.startsWith('__tab__') ? null : parentId;
                      let tab: NavTabItem | null = null;
                      if (parentId?.startsWith('__tab__')) {
                        const tabLabel = parentId.replace('__tab__', '');
                        tab = currentNavbarTabs.find((t) => t.label === tabLabel) ?? null;
                      } else {
                        tab = findTabForPage(node, currentNavbarTabs);
                      }
                      const prefix = getTabPrefix(tab ?? targetTab);
                      const slug = prefix ? `${prefix}/untitled` : undefined;
                      onInsertPage(node, 'before', effectiveParentId, currentLangId, slug);
                    }
                  }
                : undefined
            }
          />
        )}
      </div>

      {/* Pinned footer actions matching Mintlify */}
      <div className="mt-auto shrink-0 border-border border-t p-2 flex flex-col gap-1.5 bg-sidebar/50">
        {onOpenSiteConfig && (
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2 text-xs font-normal h-8 border-border/70 hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground"
            onClick={onOpenSiteConfig}
            aria-label="Site configuration"
          >
            <SlidersHorizontal className="size-3.5" />
            <span>Site configuration</span>
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white shadow-xs transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 h-8"
            aria-label="New page"
          >
            <Plus className="size-3.5" />
            <span>New page</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52" side="top">
            <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 py-1">
              Content
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => {
                if (currentLangId) {
                  const prefix = getTabPrefix(targetTab);
                  onAddPage(null, currentLangId, prefix ? `${prefix}/untitled` : undefined);
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
                  const prefix = getTabPrefix(targetTab);
                  onAddGroup(currentLangId, prefix ? `${prefix}-new-group` : undefined);
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
