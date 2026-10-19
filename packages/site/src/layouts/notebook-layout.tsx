import { ScrollArea } from '@cms/design-system/components/ui/scroll-area';
import { cn } from '@cms/design-system/lib/utils';
import { SidebarToggle } from '../components/sidebar-toggle';
import { useSidebar } from '../context/sidebar-context';
import type { DocsLayoutSlots, DocsLayoutTemplate } from './types';

function NotebookReaderShell(slots: DocsLayoutSlots) {
  const hasGranular = Boolean(slots.brand);
  const { collapsed, collapsible } = useSidebar();

  return (
    <div className="flex min-h-screen flex-col bg-card/40 dark:bg-card/20">
      {slots.banner}

      {/* Header with attached horizontal layout tabs */}
      <div className="sticky top-0 z-30 border-border/70 border-b bg-background/85 backdrop-blur-md">
        {slots.header}
        {slots.navTabs && (
          <div className="border-border/60 border-t bg-muted/30 px-6 h-10 flex items-center gap-6 text-sm overflow-x-auto">{slots.navTabs}</div>
        )}
      </div>

      <div
        id="nd-notebook-layout"
        data-documentation-layout="notebook"
        className="mx-auto flex w-full max-w-[96rem] flex-1 px-4 sm:px-6 lg:gap-8"
        data-theme-region="content-shell"
      >
        {/* Left Sidebar */}
        <aside
          id="nd-sidebar"
          data-collapsed={collapsed ? 'true' : 'false'}
          className={cn(
            'sticky top-[calc(var(--site-header-h,4rem)+1.5rem)] hidden h-[calc(100dvh-var(--site-header-h,4rem)-3rem)] shrink-0 flex-col border-border/60 border-e lg:flex transition-all duration-200',
            collapsed ? 'w-0 p-0 m-0 border-none overflow-hidden opacity-0 pointer-events-none' : 'w-60 py-6 pe-4',
          )}
          data-theme-region="sidebar"
        >
          {hasGranular ? (
            <>
              <div className="flex items-center justify-between pb-3">
                {slots.brand}
                {collapsible && <SidebarToggle />}
              </div>
              {slots.searchFull && <div className="pt-2 pb-1">{slots.searchFull}</div>}
              <ScrollArea className="flex-1 py-2">
                <div data-theme-region="sidebar-content">
                  {slots.navAnchors}
                  {slots.sidebarTree ?? slots.navigation}
                </div>
              </ScrollArea>
              {slots.tools && (
                <div className="mt-auto border-t border-border/40 pt-3">
                  <div className="flex items-center justify-between border border-border/60 bg-muted/40 p-1 rounded-xl text-muted-foreground text-sm empty:hidden">
                    {slots.tools}
                  </div>
                </div>
              )}
            </>
          ) : (
            <ScrollArea className="h-full">
              <div data-theme-region="sidebar-content">{slots.navigation}</div>
            </ScrollArea>
          )}
        </aside>

        {/* Elevated Notebook Card Paper */}
        <div className="flex flex-1 min-w-0 py-6">
          <div
            className="notebook-paper mx-auto w-full max-w-[960px] rounded-2xl border border-border bg-background p-6 shadow-xs sm:p-10 lg:p-12 min-w-0"
            data-theme-region="notebook-paper"
          >
            {collapsed && (
              <div className="hidden lg:flex items-center mb-4">
                <SidebarToggle />
              </div>
            )}
            {slots.content}
          </div>
        </div>
      </div>

      {slots.footer}
      {slots.overlays}
    </div>
  );
}

/**
 * Notebook Layout (`notebook`)
 * Modeled after upstream Fumadocs Notebook layout:
 * - Multi-track grid (`#nd-notebook-layout`) on a tinted canvas (`bg-card/40 dark:bg-card/20`)
 * - Clean sidebar on left (`#nd-sidebar`) in `[grid-area:sidebar]`
 * - Elevated central paper sheet (`fumadocs-notebook-paper` / `data-layout-content`)
 * - Article reading measure in `#nd-page` with margin TOC in `[grid-area:toc]`
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

  PageLayout: ({ article, tableOfContents, breadcrumb, footer }) => (
    <div
      className="flex flex-1 items-start gap-8 w-full min-w-0 justify-center"
      data-documentation-layout="notebook-page"
      data-theme-region="page-shell"
    >
      <article id="nd-page" className="flex flex-col gap-6 w-full min-w-0 max-w-[760px] pb-12">
        {breadcrumb && <div className="mb-2 md:hidden">{breadcrumb}</div>}
        {article}
        {footer}
      </article>
      {tableOfContents && (
        <aside className="sticky top-6 hidden xl:block w-[240px] shrink-0 self-start" data-theme-region="toc">
          {tableOfContents}
        </aside>
      )}
    </div>
  ),
};
