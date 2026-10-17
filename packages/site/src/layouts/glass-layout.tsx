import { ScrollArea } from '@cms/design-system/components/ui/scroll-area';
import { cn } from '@cms/design-system/lib/utils';
import type { DocsLayoutTemplate } from './types';

/**
 * Glass Layout (`glass`)
 * Modeled on Fumadocs Glass layout:
 * - Modern translucent floating card sidebar (`backdrop-blur-md`) with soft borders
 * - Top-right floating pill controls header
 * - Glassmorphic accents on panels and TOC
 * - Elevated floating feel over background canvas
 */
export const GlassLayoutTemplate: DocsLayoutTemplate = {
  id: 'glass',
  ReaderLayout: (slots) => {
    const hasGranular = Boolean(slots.brand);

    return (
      <div className="flex min-h-screen flex-col bg-background">
        {slots.banner}

        {/* Mobile Header (md:hidden) */}
        <div className={cn(hasGranular && 'md:hidden')}>
          {slots.header}
        </div>

        {/* Floating Pill Controls Header on Desktop */}
        {hasGranular && (
          <header className="sticky top-0 z-20 hidden h-14 items-center justify-end gap-2 bg-gradient-to-b from-background px-6 pt-3 pointer-events-none *:pointer-events-auto md:flex">
            {slots.searchFull && (
              <div className="rounded-full border border-border/70 bg-card/75 px-3 py-1 shadow-xs backdrop-blur-md">
                {slots.searchFull}
              </div>
            )}
            {slots.tools && (
              <div className="rounded-full border border-border/70 bg-card/75 px-3 py-1 shadow-xs backdrop-blur-md">
                {slots.tools}
              </div>
            )}
          </header>
        )}

        <div
          className="mx-auto flex w-full max-w-[96rem] flex-1 px-4 pt-2 pb-12 sm:px-6 lg:gap-8"
          data-documentation-layout="fumadocs-glass"
          data-theme-region="content-shell"
        >
          {/* Translucent Floating Card Sidebar */}
          <aside
            className="fumadocs-glass-sidebar sticky top-4 hidden h-[calc(100dvh-2rem)] w-68 shrink-0 flex-col rounded-2xl border border-border/70 bg-card/65 p-3.5 shadow-sm backdrop-blur-md md:flex"
            data-theme-region="sidebar"
          >
            {hasGranular ? (
              <>
                <div className="flex items-center justify-between px-2 pt-1 pb-3 border-b border-border/50">
                  {slots.brand}
                </div>
                {slots.navTabs && <div className="px-1 py-2 border-b border-border/40">{slots.navTabs}</div>}
                <ScrollArea className="flex-1 py-2">
                  <div className="pe-2" data-theme-region="sidebar-content">
                    {slots.navAnchors}
                    {slots.sidebarTree ?? slots.navigation}
                  </div>
                </ScrollArea>
                {slots.tools && (
                  <div className="mt-auto border-t border-border/50 pt-2 px-1">
                    {slots.tools}
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
        className="flex min-h-0 flex-1 gap-3 bg-muted/20 p-4"
        data-documentation-layout="fumadocs-glass-preview"
        data-theme-region="preview-shell"
      >
        <aside
          className="hidden w-56 flex-col rounded-xl border border-border/70 bg-card/70 p-3 shadow-xs backdrop-blur-sm md:flex"
          data-theme-region="sidebar"
        >
          {brand && <div className="border-b border-border/50 pb-2">{brand}</div>}
          <div className="flex-1 overflow-y-auto py-2">{navigation}</div>
          {tools && <div className="border-t border-border/50 pt-2">{tools}</div>}
        </aside>
        <div className="min-w-0 flex-1 overflow-y-auto rounded-xl border border-border/70 bg-background/80 p-4 backdrop-blur-sm">
          {content}
        </div>
      </div>
    </>
  ),

  StudioPreviewLayout: ({ header, navigation, content }) => (
    <div className="bg-muted/30 p-3" data-documentation-layout="fumadocs-glass-studio" data-theme-region="preview-shell">
      <div className="rounded-xl border border-border/70 bg-card/75 shadow-sm backdrop-blur-md">
        {header}
        <div className="grid min-h-[20rem] grid-cols-[7.5rem_minmax(0,1fr)]">
          <div className="border-border/60 border-e p-2 text-xs" data-theme-region="sidebar">
            {navigation}
          </div>
          <div className="min-w-0 p-3">{content}</div>
        </div>
      </div>
    </div>
  ),

  PageLayout: ({ article, tableOfContents }) => (
    <div
      className="grid min-w-0 grid-cols-1 gap-8 py-6 lg:py-10 xl:grid-cols-[minmax(0,1fr)_14rem]"
      data-documentation-layout="fumadocs-glass-page"
      data-theme-region="page-shell"
    >
      <div className="min-w-0 max-w-4xl">{article}</div>
      <aside className="hidden xl:block" data-theme-region="toc">
        <div className="sticky top-(--content-scroll-mt) max-h-[calc(100dvh-var(--content-scroll-mt)-2rem)] overflow-y-auto rounded-2xl border border-border/60 bg-card/50 p-4 backdrop-blur-sm shadow-xs">
          {tableOfContents}
        </div>
      </aside>
    </div>
  ),
};
