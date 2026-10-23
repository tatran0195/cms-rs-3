import { cn } from '@cms/design-system/lib/utils';
import type { DocsLayoutId, ResolvedTheme } from '@cms/shared/themes';
import { Book, Code2, Folder, Layers, Palette, Rocket, Search, Server, Terminal } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { TableOfContents } from '../components/toc';
import { TOCPopover } from '../components/toc-popover';
import { useDocumentationTheme } from '../components/documentation-theme-provider';
import { getDocsLayoutTemplate } from '../layouts';
import { DemoPage } from './demo-content';
import { createDemoTree, type DemoTreeNode, findDemoPage } from './demo-tree';

export interface LiveDocsLayoutPreviewProps {
  layoutId: DocsLayoutId;
  activePath: string;
  onNavigate: (path: string) => void;
  theme?: ResolvedTheme;
  className?: string;
}

const ICON_MAP: Record<string, typeof Book> = {
  Book,
  Rocket,
  Palette,
  Layers,
  Folder,
  Terminal,
  Server,
};

export function LiveDocsLayoutPreview({
  layoutId,
  activePath,
  onNavigate,
  theme: propTheme,
  className,
}: LiveDocsLayoutPreviewProps): ReactNode {
  const contextTheme = useDocumentationTheme();
  const theme = propTheme ?? contextTheme;
  const template = useMemo(() => getDocsLayoutTemplate(layoutId), [layoutId]);
  const tree = useMemo(() => createDemoTree(), []);
  const [activeRoot, setActiveRoot] = useState<'framework' | 'api'>('framework');

  const activePage = findDemoPage(tree.children, activePath);
  const normalizedPath = activePath.replace(/^\/+|\/+$/g, '');

  const rootFolder = tree.children.find((c) =>
    activeRoot === 'framework' ? c.type === 'folder' && c.name === 'Framework' : c.type === 'folder' && c.name === 'API Reference',
  );

  // ── Brand Slot ─────────────────────────────────────────────────────────────
  const brandSlot = (
    <div className="flex items-center gap-2">
      <span className="grid size-6 place-items-center rounded-lg bg-primary text-xs font-bold text-primary-foreground shadow-xs">
        D
      </span>
      <span className="font-semibold text-sm tracking-tight text-foreground">Docs Preview</span>
    </div>
  );

  // ── Search Slots ───────────────────────────────────────────────────────────
  const searchFullSlot = (
    <div className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg border border-border/70 bg-background/80 text-muted-foreground text-xs shadow-2xs">
      <Search className="size-3.5 shrink-0" />
      <span className="flex-1 truncate">Search documentation...</span>
      <kbd className="px-1.5 py-0.5 rounded border border-border/80 bg-muted text-[10px] font-mono">⌘K</kbd>
    </div>
  );

  const searchButtonSlot = (
    <button type="button" className="grid size-8 place-items-center rounded-lg border border-border/70 text-muted-foreground hover:text-foreground" aria-label="Search">
      <Search className="size-3.5" />
    </button>
  );

  // ── Tools Slot ─────────────────────────────────────────────────────────────
  const toolsSlot = (
    <div className="flex items-center gap-1.5">
      <a
        href="https://github.com/fuma-nama/fumadocs"
        target="_blank"
        rel="noreferrer"
        className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label="GitHub"
      >
        <Code2 className="size-4" />
      </a>
    </div>
  );

  // ── Navigation Links & Tabs ────────────────────────────────────────────────
  const navLinksSlot = (
    <nav className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
      <button
        type="button"
        onClick={() => {
          setActiveRoot('framework');
          onNavigate('');
        }}
        className={cn('cursor-pointer transition-colors hover:text-foreground', activeRoot === 'framework' ? 'text-primary font-semibold' : '')}
      >
        Guide
      </button>
      <button
        type="button"
        onClick={() => {
          setActiveRoot('framework');
          onNavigate('components/tabs');
        }}
        className="cursor-pointer transition-colors hover:text-foreground"
      >
        Components
      </button>
      <button
        type="button"
        onClick={() => {
          setActiveRoot('api');
          onNavigate('api');
        }}
        className={cn('cursor-pointer transition-colors hover:text-foreground', activeRoot === 'api' ? 'text-primary font-semibold' : '')}
      >
        API Reference
      </button>
    </nav>
  );

  const navTabsSlot = (
    <div className="flex items-center gap-1.5 text-xs">
      <button
        type="button"
        onClick={() => {
          setActiveRoot('framework');
          onNavigate('');
        }}
        className={cn(
          'px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer',
          activeRoot === 'framework' ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground hover:bg-muted',
        )}
      >
        Framework
      </button>
      <button
        type="button"
        onClick={() => {
          setActiveRoot('api');
          onNavigate('api');
        }}
        className={cn(
          'px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer',
          activeRoot === 'api' ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground hover:bg-muted',
        )}
      >
        API Reference
      </button>
    </div>
  );

  // ── Sidebar Tree Nodes ─────────────────────────────────────────────────────
  const renderSidebarItem = (node: DemoTreeNode, key: string): ReactNode => {
    if (node.type === 'separator') {
      return (
        <div key={key} className="px-2 pt-3 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          {node.name}
        </div>
      );
    }
    if (node.type === 'page') {
      const isSelected = normalizedPath === node.path.replace(/^\/+|\/+$/g, '');
      const Icon = node.icon ? ICON_MAP[node.icon] ?? Book : Book;
      return (
        <button
          key={key}
          type="button"
          onClick={() => onNavigate(node.path)}
          className={cn(
            'flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-xs font-medium text-start transition-colors cursor-pointer',
            isSelected ? 'bg-primary/15 text-primary font-semibold' : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
          )}
        >
          <Icon className="size-3.5 shrink-0" />
          <span className="truncate">{node.name}</span>
        </button>
      );
    }
    if (node.type === 'folder') {
      const Icon = node.icon ? ICON_MAP[node.icon] ?? Folder : Folder;
      return (
        <div key={key} className="space-y-0.5">
          {!node.root && (
            <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold text-muted-foreground/80">
              <Icon className="size-3 shrink-0" />
              <span>{node.name}</span>
            </div>
          )}
          <div className={cn('space-y-0.5', !node.root && 'ps-2 border-s border-border/40 ms-2')}>
            {node.children.map((child, idx) => renderSidebarItem(child, `${key}-${idx}`))}
          </div>
        </div>
      );
    }
    return null;
  };

  const sidebarTreeSlot = (
    <div className="space-y-1 text-xs">
      {rootFolder?.type === 'folder' ? rootFolder.children.map((child, idx) => renderSidebarItem(child, `tree-${idx}`)) : null}
    </div>
  );

  // ── Breadcrumb, TOC, Page Layout ───────────────────────────────────────────
  const breadcrumbSlot = (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
      <span>Docs</span>
      <span>/</span>
      <span className="text-foreground font-medium">{activePage?.name ?? 'Overview'}</span>
    </div>
  );

  const tableOfContentsSlot = (
    <TableOfContents
      headings={activePage?.headings ?? []}
      style={theme?.layout.tocStyle ?? 'clerk'}
      depth={theme?.layout.tocDepth ?? 3}
      label="On this page"
    />
  );

  const tocPopoverSlot = (
    <TOCPopover
      headings={activePage?.headings ?? []}
      style={theme?.layout.tocStyle ?? 'clerk'}
      depth={theme?.layout.tocDepth ?? 3}
      label="On this page"
    />
  );

  const pageContent = template.PageLayout({
    breadcrumb: breadcrumbSlot,
    article: <DemoPage activePath={activePath} onNavigate={onNavigate} />,
    tableOfContents: tableOfContentsSlot,
    tocPopover: tocPopoverSlot,
  });

  return (
    <div className={cn('w-full', className)}>
      {template.ReaderLayout({
        header: brandSlot,
        navigation: sidebarTreeSlot,
        content: pageContent,
        brand: brandSlot,
        searchFull: searchFullSlot,
        searchButton: searchButtonSlot,
        tools: toolsSlot,
        navLinks: navLinksSlot,
        navTabs: navTabsSlot,
        sidebarTree: sidebarTreeSlot,
      })}
    </div>
  );
}
