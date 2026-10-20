import { ScrollArea } from '@cms/design-system/components/ui/scroll-area';
import { cn } from '@cms/design-system/lib/utils';
import { SidebarToggle } from '../components/sidebar-toggle';
import { useSidebar } from '../context/sidebar-context';
import type { DocsLayoutSlots, DocsLayoutTemplate } from './types';

const pillButtonClasses = 'rounded-full bg-card/80 text-foreground border border-border/70 backdrop-blur-md shadow-xs';

function GlassReaderShell(slots: DocsLayoutSlots) {
  const hasGranular = Boolean(slots.brand);
  const { collapsed, collapsible } = useSidebar();

  return (
    <div
      id="fd-glass-layout"
      data-sidebar-collapsed={collapsed ? 'true' : 'false'}
      data-documentation-layout="glass"
      className="flex min-h-screen flex-col bg-background relative"
    >
      {slots.banner}

      {/* Mobile Header (md:hidden) */}
      <div className={cn(hasGranular && 'md:hidden')}>{slots.header}</div>

      {/* Floating Pill Controls Header on Desktop matching Fumadocs Glass header.tsx */}
      {hasGranular && (
        <header className="sticky top-0 z-20 hidden h-14 items-center justify-between gap-2 bg-gradient-to-b from-background px-6 pt-3 pointer-events-none *:pointer-events-auto md:flex">
          <div>
            {collapsed && (
              <div className={cn(pillButtonClasses, 'p-1')}>
                <SidebarToggle />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {slots.searchFull && <div className="max-w-md w-full">{slots.searchFull}</div>}
            {slots.tools && <div className={cn(pillButtonClasses, 'px-3 py-1')}>{slots.tools}</div>}
          </div>
        </header>
      )}

      <div className="mx-auto flex w-full max-w-[96rem] flex-1 px-4 pt-2 pb-12 sm:px-6 lg:gap-8" data-theme-region="content-shell">
        {/* Translucent Floating Card Sidebar matching Fumadocs Glass sidebar */}
        <aside
          id="nd-sidebar"
          data-collapsed={collapsed ? 'true' : 'false'}
          className={cn(
            'glass-sidebar sticky top-4 hidden h-[calc(100dvh-2rem)] shrink-0 flex-col rounded-2xl border border-border/70 bg-card/65 shadow-sm backdrop-blur-md md:flex transition-all duration-200',
            collapsed ? 'w-0 p-0 m-0 border-none overflow-hidden opacity-0 pointer-events-none' : 'w-[268px] p-3.5',
          )}
          data-theme-region="sidebar"
        >
          {hasGranular ? (
            <>
              <div className="flex items-center justify-between px-2 pt-1 pb-3 border-b border-border/50">
                {slots.brand}
                {collapsible && <SidebarToggle />}
              </div>
              {slots.navTabs && <div className="px-1 py-2 border-b border-border/40">{slots.navTabs}</div>}
              <ScrollArea className="flex-1 py-2">
                <div className="pe-2" data-theme-region="sidebar-content">
                  {slots.navAnchors}
                  {slots.sidebarTree ?? slots.navigation}
                </div>
              </ScrollArea>
              {slots.tools && (
                <div className="mt-auto border-t border-border/40 pt-2">
                  <div className="flex items-center justify-between border border-border/60 bg-muted/40 p-1 rounded-xl text-muted-foreground text-sm empty:hidden">
                    {slots.tools}
                  </div>
                </div>
              )}
            </>
          ) : (
            <ScrollArea className="h-full">
              <div className="pe-2" data-theme-region="sidebar-content">
                {slots.navigation}
              </div>
            </ScrollArea>
          )}
        </aside>

        <div className="min-w-0 flex-1 pt-4 md:pt-6">{slots.content}</div>
      </div>

      {slots.footer}
      {slots.overlays}
    </div>
  );
}

/**
 * Glass Layout (`glass`)
 * Modeled 100% after upstream Fumadocs Glass layout:
 * - Floating translucent header with rounded-full pill buttons
 * - Elevated floating frosted glass sidebar (`#nd-sidebar` / `glass-sidebar`)
 * - Article reading measure in `#nd-page` with frosted glass aesthetics
 * - Hover-expanding outline TOC
 */
export const GlassLayoutTemplate: DocsLayoutTemplate = {
  id: 'glass',
  ReaderLayout: (slots) => <GlassReaderShell {...slots} />,

  ProjectPreviewLayout: ({ mobileNavigation, navigation, content, brand, tools }) => (
    <>
      {mobileNavigation}
      <div
        id="fd-glass-layout"
        className="flex min-h-0 flex-1 gap-3 bg-muted/20 p-4"
        data-documentation-layout="glass-preview"
        data-theme-region="preview-shell"
      >
        <aside
          id="nd-sidebar"
          className="glass-sidebar hidden w-56 flex-col rounded-xl border border-border/70 bg-card/70 p-3 shadow-xs backdrop-blur-sm md:flex"
          data-theme-region="sidebar"
        >
          {brand && <div className="border-b border-border/50 p-2">{brand}</div>}
          <div className="flex-1 overflow-y-auto p-2">{navigation}</div>
          {tools && <div className="border-t border-border/50 p-2">{tools}</div>}
        </aside>
        <div className="min-w-0 flex-1 overflow-y-auto rounded-xl border border-border/70 bg-background/80 p-6 shadow-xs backdrop-blur-xs">
          {content}
        </div>
      </div>
    </>
  ),

  StudioPreviewLayout: ({ header, navigation, content }) => (
    <div id="fd-glass-layout" className="bg-muted/20 p-3" data-documentation-layout="glass-studio" data-theme-region="preview-shell">
      <div className="mx-auto max-w-[46rem] overflow-hidden rounded-xl border border-border/70 bg-background/80 shadow-xs backdrop-blur-sm">
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
    <div
      className="flex flex-1 items-start gap-8 w-full min-w-0 justify-center"
      data-documentation-layout="glass-page"
      data-theme-region="page-shell"
    >
      <div className="flex flex-col flex-1 min-w-0 max-w-[760px]">
        {tocPopover && <div className="md:hidden mb-4 w-full">{tocPopover}</div>}
        <article id="nd-page" className="flex flex-col gap-6 w-full min-w-0 pb-12">
          {breadcrumb && <div className="mb-2 md:hidden">{breadcrumb}</div>}
          {article}
          {footer}
        </article>
      </div>

      {tableOfContents && (
        <aside className="sticky top-20 hidden xl:block w-[240px] shrink-0 self-start" data-theme-region="toc">
          {tableOfContents}
        </aside>
      )}
    </div>
  ),
};
