import { ScrollArea } from '@cms/design-system/components/ui/scroll-area';
import { cn } from '@cms/design-system/lib/utils';
import type { CSSProperties } from 'react';
import { SidebarToggle } from '../components/sidebar-toggle';
import { useSidebar } from '../context/sidebar-context';
import type { DocsLayoutSlots, DocsLayoutTemplate } from './types';

function DocsStandardReaderShell(slots: DocsLayoutSlots) {
  const hasGranular = Boolean(slots.brand);
  const { collapsed, collapsible } = useSidebar();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {slots.banner}

      {/* Outer Grid Container modeled exactly after Fumadocs DocsLayout slots/container.tsx */}
      <div
        id="nd-docs-layout"
        data-sidebar-collapsed={collapsed ? 'true' : 'false'}
        data-documentation-layout="docs"
        className="relative grid overflow-x-clip min-h-[var(--fd-docs-height,100dvh)] flex-1 min-w-0 [--fd-docs-height:100dvh] [--fd-header-height:0px] max-md:[--fd-header-height:3.5rem] [--fd-toc-popover-height:0px] max-xl:[--fd-toc-popover-height:2.5rem] [--fd-sidebar-width:0px] md:[--fd-sidebar-width:268px] [--fd-toc-width:0px] xl:[--fd-toc-width:268px] transition-[--fd-sidebar-col]"
        style={
          {
            gridTemplate: `"sidebar sidebar header toc toc"
"sidebar sidebar toc-popover toc toc"
"sidebar sidebar tabs toc toc"
"sidebar sidebar main toc toc" 1fr / minmax(min-content, 1fr) var(--fd-sidebar-col) minmax(0, calc(var(--fd-layout-width,97rem) - var(--fd-sidebar-width) - var(--fd-toc-width))) var(--fd-toc-width) minmax(min-content, 1fr)`,
            '--fd-docs-row-1': 'var(--fd-banner-height, 0px)',
            '--fd-docs-row-2': 'calc(var(--fd-docs-row-1) + var(--fd-header-height, 0px))',
            '--fd-docs-row-3': 'calc(var(--fd-docs-row-2) + var(--fd-toc-popover-height, 0px))',
            '--fd-sidebar-col': collapsed ? '0px' : 'var(--fd-sidebar-width)',
          } as CSSProperties
        }
        data-theme-region="content-shell"
      >
        {/* Desktop Sticky Sidebar [grid-area:sidebar] */}
        <aside
          id="nd-sidebar"
          data-collapsed={collapsed ? 'true' : 'false'}
          className={cn(
            'sticky top-[var(--fd-docs-row-1,0px)] z-20 hidden h-[calc(var(--fd-docs-height,100dvh)-var(--fd-docs-row-1,0px))] shrink-0 flex-col border-border/70 border-e bg-card/50 backdrop-blur-xs md:flex [grid-area:sidebar] transition-all duration-200',
            collapsed ? 'w-0 overflow-hidden border-none opacity-0 pointer-events-none' : 'w-[268px]',
          )}
          data-theme-region="sidebar"
        >
          {hasGranular ? (
            <>
              <div className="flex h-14 items-center justify-between px-4 border-b border-border/60">
                {slots.brand}
                {collapsible && <SidebarToggle />}
              </div>
              {slots.searchFull && <div className="px-3 pt-3 pb-1">{slots.searchFull}</div>}
              {slots.navTabs && <div className="px-3 py-1 border-b border-border/50">{slots.navTabs}</div>}
              <ScrollArea className="flex-1 px-3 py-3">
                <div className="pb-12" data-theme-region="sidebar-content">
                  {slots.navAnchors}
                  {slots.sidebarTree ?? slots.navigation}
                </div>
              </ScrollArea>
              {slots.tools && (
                <div className="mt-auto border-t border-border/60 p-3">
                  <div className="flex items-center justify-between border border-border/60 bg-muted/40 p-1 rounded-xl text-muted-foreground text-sm empty:hidden">
                    {slots.tools}
                  </div>
                </div>
              )}
            </>
          ) : (
            <ScrollArea className="h-full">
              <div className="pt-6 pb-16 pe-4" data-theme-region="sidebar-content">
                {slots.navigation}
              </div>
            </ScrollArea>
          )}
        </aside>

        {/* Top Header [grid-area:header] */}
        {hasGranular ? (
          <>
            {/* Mobile Header (md:hidden) */}
            <div className="md:hidden [grid-area:header] sticky top-0 z-30">{slots.header}</div>

            {/* Desktop Header bar when sidebar collapsed or nav links provided */}
            <header
              className={cn(
                'hidden md:flex items-center justify-between px-8 h-14 border-b border-border/40 [grid-area:header] sticky top-0 z-20 bg-background/85 backdrop-blur-xs',
                !slots.navLinks && !collapsed && 'invisible pointer-events-none',
              )}
            >
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                {collapsed && <SidebarToggle />}
                {slots.navLinks}
              </div>
              <div className="flex items-center gap-2">{collapsed && slots.tools}</div>
            </header>
          </>
        ) : (
          <div className="[grid-area:header]">{slots.header}</div>
        )}

        {/* Content slots rendered with contents so toc-popover, main, and toc snap to grid areas */}
        <div className="contents" data-theme-region="content-slot">
          {slots.content}
        </div>
      </div>

      {slots.footer}
      {slots.overlays}
    </div>
  );
}

/**
 * Standard Docs Layout (`docs`)
 * Modeled 100% after upstream Fumadocs default documentation layout:
 * - 5-column CSS grid (`#nd-docs-layout`):
 *   `sidebar sidebar header toc toc`
 *   `sidebar sidebar toc-popover toc toc`
 *   `sidebar sidebar tabs toc toc`
 *   `sidebar sidebar main toc toc`
 * - Collapsible sticky sidebar (`#nd-sidebar`) in `[grid-area:sidebar]` with brand, search, tree, and tools dock
 * - Mobile/Tablet TOC Popover in `[grid-area:toc-popover]` with progress ring and collapsible headings drawer
 * - Centered main container in `[grid-area:main]` with article measure `#nd-page` max-w-[900px]
 * - Desktop sticky Table of Contents in `[grid-area:toc]` with width 268px on xl+
 */
export const DocsStandardLayoutTemplate: DocsLayoutTemplate = {
  id: 'docs',
  ReaderLayout: (slots) => <DocsStandardReaderShell {...slots} />,

  ProjectPreviewLayout: ({ mobileNavigation, navigation, content, brand, tools }) => (
    <>
      {mobileNavigation}
      <div
        id="nd-docs-layout"
        className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)]"
        data-documentation-layout="docs-preview"
        data-theme-region="preview-shell"
      >
        <aside id="nd-sidebar" className="hidden min-h-0 flex-col border-border border-e bg-card/40 md:flex" data-theme-region="sidebar">
          {brand && <div className="border-b border-border/60 p-3">{brand}</div>}
          <div className="flex-1 overflow-y-auto p-2">{navigation}</div>
          {tools && <div className="border-t border-border/60 p-2">{tools}</div>}
        </aside>
        <div className="min-w-0 flex-1 overflow-y-auto">{content}</div>
      </div>
    </>
  ),

  StudioPreviewLayout: ({ header, navigation, content }) => (
    <>
      {header}
      <div
        id="nd-docs-layout"
        className="grid min-h-[22rem] grid-cols-[7.5rem_minmax(0,1fr)]"
        data-documentation-layout="docs-studio"
        data-theme-region="preview-shell"
      >
        <div id="nd-sidebar" className="border-border border-e bg-card/45 p-2 text-xs" data-theme-region="sidebar">
          {navigation}
        </div>
        <div className="min-w-0 p-3">{content}</div>
      </div>
    </>
  ),

  PageLayout: ({ article, tableOfContents, breadcrumb, footer, tocPopover }) => (
    <div className="contents" data-documentation-layout="docs-page" data-theme-region="page-shell">
      {/* Mobile & Tablet TOC Popover in [grid-area:toc-popover] */}
      {tocPopover && <div className="[grid-area:toc-popover] sticky top-[var(--fd-docs-row-2,0px)] z-10 xl:hidden w-full">{tocPopover}</div>}

      {/* Main Container in [grid-area:main] matching Fumadocs slots/container.tsx */}
      <main className="grid [grid-area:main] justify-items-center w-full min-w-0" data-layout-main="">
        <article
          id="nd-page"
          data-layout-content=""
          className="flex flex-col min-w-0 w-full max-w-[900px] px-4 py-6 gap-4 md:px-6 md:pt-8 xl:px-8 xl:pt-14"
        >
          {breadcrumb && <div className="mb-2 md:hidden">{breadcrumb}</div>}
          {article}
          {footer}
        </article>
      </main>

      {/* Desktop Sticky TOC in [grid-area:toc] matching Fumadocs slots/toc.tsx */}
      {tableOfContents && (
        <aside
          id="nd-toc"
          className="sticky top-[var(--fd-docs-row-1,0px)] h-[calc(var(--fd-docs-height,100dvh)-var(--fd-docs-row-1,0px))] flex flex-col [grid-area:toc] w-[var(--fd-toc-width,268px)] pt-12 pe-4 pb-2 max-xl:hidden self-start"
          data-theme-region="toc"
        >
          {tableOfContents}
        </aside>
      )}
    </div>
  ),
};
