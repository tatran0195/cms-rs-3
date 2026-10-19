import { ScrollArea } from '@cms/design-system/components/ui/scroll-area';
import { cn } from '@cms/design-system/lib/utils';
import type { CSSProperties } from 'react';
import { SidebarToggle } from '../components/sidebar-toggle';
import { useSidebar } from '../context/sidebar-context';
import type { DocsLayoutSlots, DocsLayoutTemplate } from './types';

function NotebookReaderShell(slots: DocsLayoutSlots) {
  const hasGranular = Boolean(slots.brand);
  const { collapsed, collapsible } = useSidebar();

  return (
    <div className="flex min-h-screen flex-col bg-card/40 dark:bg-card/20">
      {slots.banner}

      {/* Outer Grid Container modeled after Fumadocs NotebookLayout slots/container.tsx */}
      <div
        id="nd-notebook-layout"
        data-sidebar-collapsed={collapsed ? 'true' : 'false'}
        data-documentation-layout="notebook"
        className="relative grid overflow-x-clip min-h-(--fd-docs-height) flex-1 min-w-0 [--fd-docs-height:100dvh] [--fd-header-height:3.5rem] [--fd-toc-popover-height:2.5rem] [--fd-sidebar-width:260px] [--fd-toc-col:268px] transition-[--fd-sidebar-col]"
        style={
          {
            gridTemplate: `"sidebar sidebar header header ."
"sidebar sidebar toc-popover toc-popover ."
"sidebar sidebar main toc ." 1fr / minmax(min-content, 1fr) var(--fd-sidebar-col) minmax(0, calc(var(--fd-layout-width,97rem) - var(--fd-sidebar-col) - var(--fd-toc-col))) var(--fd-toc-col) minmax(min-content, 1fr)`,
            '--fd-docs-row-1': 'var(--fd-banner-height, 0px)',
            '--fd-docs-row-2': 'calc(var(--fd-docs-row-1) + var(--fd-header-height))',
            '--fd-docs-row-3': 'calc(var(--fd-docs-row-2) + var(--fd-toc-popover-height))',
            '--fd-sidebar-col': collapsed ? '0px' : 'var(--fd-sidebar-width)',
            '--fd-sidebar-width': '260px',
            '--fd-toc-col': '268px',
            '--fd-header-height': '3.5rem',
            '--fd-toc-popover-height': '2.5rem',
          } as CSSProperties
        }
        data-theme-region="content-shell"
      >
        {/* Left Sidebar [grid-area:sidebar] */}
        <aside
          id="nd-sidebar"
          data-collapsed={collapsed ? 'true' : 'false'}
          className={cn(
            'sticky top-(--fd-docs-row-1) z-20 hidden h-[calc(var(--fd-docs-height,100dvh)-var(--fd-docs-row-1,0px))] shrink-0 flex-col border-border/60 border-e bg-card/60 backdrop-blur-xs md:flex [grid-area:sidebar] transition-all duration-200',
            collapsed ? 'w-0 overflow-hidden border-none opacity-0 pointer-events-none' : 'w-[260px]',
          )}
          data-theme-region="sidebar"
        >
          {hasGranular ? (
            <>
              <div className="flex h-14 items-center justify-between px-4 border-b border-border/50">
                {slots.brand}
                {collapsible && <SidebarToggle />}
              </div>
              {slots.searchFull && <div className="px-3 pt-3 pb-1">{slots.searchFull}</div>}
              {slots.navTabs && <div className="px-3 py-1 border-b border-border/40">{slots.navTabs}</div>}
              <ScrollArea className="flex-1 px-3 py-3">
                <div className="pb-12" data-theme-region="sidebar-content">
                  {slots.navAnchors}
                  {slots.sidebarTree ?? slots.navigation}
                </div>
              </ScrollArea>
              {slots.tools && (
                <div className="mt-auto border-t border-border/50 p-3">
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
        <header
          className={cn(
            'sticky top-(--fd-docs-row-1) z-30 flex items-center justify-between px-6 h-14 border-b border-border/50 bg-background/80 backdrop-blur-md [grid-area:header]',
          )}
        >
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {collapsed && <SidebarToggle />}
            {slots.navLinks}
          </div>
          <div className="flex items-center gap-2">
            {slots.searchButton}
            {collapsed && slots.tools}
          </div>
        </header>

        {/* Content slots rendered with contents so toc-popover, main, and toc snap to grid areas */}
        <div className="notebook-paper contents" data-theme-region="content-slot">
          {slots.content}
        </div>
      </div>

      {slots.footer}
      {slots.overlays}
    </div>
  );
}

/**
 * Notebook Layout (`notebook`)
 * Modeled 100% after upstream Fumadocs Notebook layout:
 * - Multi-track grid (`#nd-notebook-layout`) on a tinted canvas (`bg-card/40 dark:bg-card/20`):
 *   `sidebar sidebar header header .`
 *   `sidebar sidebar toc-popover toc-popover .`
 *   `sidebar sidebar main toc .`
 * - Sticky sidebar on left (`#nd-sidebar`) in `[grid-area:sidebar]`
 * - Top header in `[grid-area:header]`
 * - Mobile/Tablet TOC popover in `[grid-area:toc-popover]` for screens < xl
 * - Main container in `[grid-area:main]` with elevated notebook card paper (`*:max-w-[900px]`)
 * - Desktop sticky Table of Contents in `[grid-area:toc]`
 */
export const NotebookLayoutTemplate: DocsLayoutTemplate = {
  id: 'notebook',
  ReaderLayout: (slots) => <NotebookReaderShell {...slots} />,

  ProjectPreviewLayout: ({ mobileNavigation, navigation, content }) => (
    <>
      {mobileNavigation}
      <div
        id="nd-notebook-layout"
        className="flex min-h-0 flex-1 gap-3 bg-muted/30 p-4"
        data-documentation-layout="notebook-preview"
        data-theme-region="preview-shell"
      >
        <aside id="nd-sidebar" className="hidden w-52 flex-col border-border/60 border-e bg-card/40 p-3 md:flex" data-theme-region="sidebar">
          {navigation}
        </aside>
        <div className="min-w-0 flex-1 overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-sm">{content}</div>
      </div>
    </>
  ),

  StudioPreviewLayout: ({ header, navigation, content }) => (
    <div id="nd-notebook-layout" className="bg-muted/40 p-3" data-documentation-layout="notebook-studio" data-theme-region="preview-shell">
      <div className="mx-auto max-w-[46rem] overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {header}
        <div className="grid min-h-[20rem] grid-cols-[7rem_minmax(0,1fr)] border-border/60 border-t">
          <div id="nd-sidebar" className="border-border/60 border-e p-2 text-xs" data-theme-region="sidebar">
            {navigation}
          </div>
          <div className="min-w-0 p-4">{content}</div>
        </div>
      </div>
    </div>
  ),

  PageLayout: ({ article, tableOfContents, breadcrumb, footer, tocPopover }) => (
    <div className="contents" data-documentation-layout="notebook-page" data-theme-region="page-shell">
      {/* Mobile & Tablet TOC Popover in [grid-area:toc-popover] */}
      {tocPopover && <div className="[grid-area:toc-popover] sticky top-(--fd-docs-row-2) z-10 xl:hidden w-full">{tocPopover}</div>}

      {/* Main Container in [grid-area:main] with Notebook Card Paper styling */}
      <main className="grid [grid-area:main] p-4 sm:p-6 lg:p-8" data-layout-main="">
        <article
          id="nd-page"
          data-layout-content=""
          className="flex flex-col min-w-0 px-6 py-6 gap-4 md:px-8 md:pt-8 xl:px-10 xl:pt-10 *:max-w-[900px] notebook-paper bg-background rounded-2xl border border-border/80 shadow-xs"
        >
          {breadcrumb && <div className="mb-2 md:hidden">{breadcrumb}</div>}
          {article}
          {footer}
        </article>
      </main>

      {/* Desktop Sticky TOC in [grid-area:toc] */}
      {tableOfContents && (
        <aside
          id="nd-toc"
          className="sticky top-(--fd-docs-row-1) h-[calc(var(--fd-docs-height,100dvh)-var(--fd-docs-row-1,0px))] flex flex-col [grid-area:toc] w-[268px] pt-12 pe-4 pb-2 max-xl:hidden self-start"
          data-theme-region="toc"
        >
          {tableOfContents}
        </aside>
      )}
    </div>
  ),
};
