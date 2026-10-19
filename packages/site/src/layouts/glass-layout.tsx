import { ScrollArea } from '@cms/design-system/components/ui/scroll-area';
import { cn } from '@cms/design-system/lib/utils';
import type { DocsLayoutTemplate } from './types';

/**
 * Glass Layout (`glass`)
 * Modeled after upstream Fumadocs Glass layout:
 * - Multi-track grid (`#fd-glass-layout`) with floating translucent header and frosted glass sidebar
 * - Floating rounded-full pill controls bar with backdrop-blur-md
 * - Elevated floating frosted sidebar (`#nd-sidebar` / `fumadocs-glass-sidebar`)
 * - Article reading measure in `#nd-page` with frosted glass accents
 */
export const GlassLayoutTemplate: DocsLayoutTemplate = {
  id: 'glass',
  ReaderLayout: (slots) => {
    const hasGranular = Boolean(slots.brand);

    return (
      <div id="fd-glass-layout" data-documentation-layout="glass" className="flex min-h-screen flex-col bg-background relative">
        {slots.banner}

        {/* Mobile Header (md:hidden) */}
        <div className={cn(hasGranular && 'md:hidden')}>{slots.header}</div>

        {/* Floating Pill Controls Header on Desktop */}
        {hasGranular && (
          <header className="sticky top-0 z-20 hidden h-14 items-center justify-end gap-2 bg-gradient-to-b from-background px-6 pt-3 pointer-events-none *:pointer-events-auto md:flex">
            {slots.searchFull && (
              <div className="rounded-full border border-border/70 bg-card/75 px-3 py-1 shadow-xs backdrop-blur-md">{slots.searchFull}</div>
            )}
            {slots.tools && <div className="rounded-full border border-border/70 bg-card/75 px-3 py-1 shadow-xs backdrop-blur-md">{slots.tools}</div>}
          </header>
        )}

        <div className="mx-auto flex w-full max-w-[96rem] flex-1 px-4 pt-2 pb-12 sm:px-6 lg:gap-8" data-theme-region="content-shell">
          {/* Translucent Floating Card Sidebar */}
          <aside
            id="nd-sidebar"
            className="glass-sidebar sticky top-4 hidden h-[calc(100dvh-2rem)] w-68 shrink-0 flex-col rounded-2xl border border-border/70 bg-card/65 p-3.5 shadow-sm backdrop-blur-md md:flex"
            data-theme-region="sidebar"
          >
            {hasGranular ? (
              <>
                <div className="flex items-center justify-between px-2 pt-1 pb-3 border-b border-border/50">{slots.brand}</div>
                {slots.navTabs && <div className="px-1 py-2 border-b border-border/40">{slots.navTabs}</div>}
                <ScrollArea className="flex-1 py-2">
                  <div className="pe-2" data-theme-region="sidebar-content">
                    {slots.navAnchors}
                    {slots.sidebarTree ?? slots.navigation}
                  </div>
                </ScrollArea>
                {slots.tools && (
                  <div className="mt-auto border-t border-border/50 pt-2 px-1">
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

          <div className="min-w-0 flex-1">{slots.content}</div>
        </div>

        {slots.footer}
        {slots.overlays}
      </div>
    );
  },

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

  PageLayout: ({ article, tableOfContents, breadcrumb, footer }) => (
    <div
      className="flex flex-1 items-start gap-8 w-full min-w-0 justify-center"
      data-documentation-layout="glass-page"
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
