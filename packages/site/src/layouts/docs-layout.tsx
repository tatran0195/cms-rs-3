import { ScrollArea } from '@cms/design-system/components/ui/scroll-area';
import { cn } from '@cms/design-system/lib/utils';
import { SidebarToggle } from '../components/sidebar-toggle';
import { useSidebar } from '../context/sidebar-context';
import type { DocsLayoutSlots, DocsLayoutTemplate } from './types';

function DocsStandardReaderShell(slots: DocsLayoutSlots) {
  const hasGranular = Boolean(slots.brand);
  const { collapsed, collapsible } = useSidebar();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {slots.banner}

      {/* Mobile Header (md:hidden) */}
      <div className={cn(hasGranular && 'md:hidden')}>{slots.header}</div>

      <div
        id="nd-docs-layout"
        data-documentation-layout="docs"
        className="relative grid min-h-(--fd-docs-height) flex-1 min-w-0 [--fd-docs-height:100dvh] [--fd-header-height:3.5rem] [--fd-sidebar-width:268px] [--fd-toc-width:240px]"
        style={{
          gridTemplate: `"sidebar sidebar header toc toc"
"sidebar sidebar tabs toc toc"
"sidebar sidebar main toc toc" 1fr / minmax(0, 0px) minmax(0, ${collapsed ? '0px' : '268px'}) minmax(0, 1fr) auto minmax(0, 0px)`,
        }}
        data-theme-region="content-shell"
      >
        {/* Desktop Persistent Sidebar */}
        <aside
          id="nd-sidebar"
          data-collapsed={collapsed ? 'true' : 'false'}
          className={cn(
            'sticky top-0 hidden h-screen shrink-0 flex-col border-border/70 border-e bg-card/50 backdrop-blur-xs md:flex [grid-area:sidebar] transition-all duration-200',
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

        {/* Desktop Top Header if provided or when collapsed */}
        {hasGranular && (
          <div
            className={cn(
              'hidden md:flex items-center justify-between px-8 h-14 border-b border-border/40 [grid-area:header]',
              !slots.navLinks && !collapsed && 'invisible pointer-events-none',
            )}
          >
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              {collapsed && <SidebarToggle />}
              {slots.navLinks}
            </div>
            <div className="flex items-center gap-2">{slots.tools}</div>
          </div>
        )}

        {/* Main content area */}
        <div className="min-w-0 flex-1 px-4 sm:px-6 lg:px-10 [grid-area:main]">{slots.content}</div>
      </div>

      {slots.footer}
      {slots.overlays}
    </div>
  );
}

/**
 * Standard Docs Layout (`docs`)
 * Modeled after upstream Fumadocs default documentation layout:
 * - Multi-column CSS grid (`#nd-docs-layout`):
 *   `sidebar sidebar header toc toc`
 *   `sidebar sidebar tabs toc toc`
 *   `sidebar sidebar main toc toc`
 * - Collapsible sidebar (`#nd-sidebar`) in `[grid-area:sidebar]` with brand, search, tree, and dock
 * - Category tabs in `[grid-area:tabs]`
 * - Article reading measure in `#nd-page` with sticky right-hand outline in `[grid-area:toc]`
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

  PageLayout: ({ article, tableOfContents, breadcrumb, footer }) => (
    <div
      className="flex flex-1 items-start gap-8 w-full min-w-0 justify-center py-6"
      data-documentation-layout="docs-page"
      data-theme-region="page-shell"
    >
      <article id="nd-page" className="flex flex-col gap-6 w-full min-w-0 max-w-[760px] pb-12">
        {breadcrumb && <div className="mb-2 md:hidden">{breadcrumb}</div>}
        {article}
        {footer}
      </article>
      {tableOfContents && (
        <aside className="sticky top-6 hidden xl:block w-[240px] shrink-0 self-start [grid-area:toc]" data-theme-region="toc">
          {tableOfContents}
        </aside>
      )}
    </div>
  ),
};
