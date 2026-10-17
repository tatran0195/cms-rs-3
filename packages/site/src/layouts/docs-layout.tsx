import { ScrollArea } from '@cms/design-system/components/ui/scroll-area';
import { cn } from '@cms/design-system/lib/utils';
import type { DocsLayoutTemplate } from './types';

/**
 * Standard Docs Layout (`docs`)
 * Modeled on Fumadocs default documentation layout:
 * - Persistent left sidebar extending to the top of viewport with logo and full search
 * - Header is hidden on desktop (`md:hidden`), active on mobile
 * - Central documentation reading measure
 * - Right-hand sticky table of contents outline
 */
export const DocsStandardLayoutTemplate: DocsLayoutTemplate = {
  id: 'docs',
  ReaderLayout: (slots) => {
    const hasGranular = Boolean(slots.brand);

    return (
      <div className="flex min-h-screen flex-col bg-background">
        {slots.banner}

        {/* Mobile Header (md:hidden) */}
        <div className={cn(hasGranular && 'md:hidden')}>
          {slots.header}
        </div>

        <div
          className="mx-auto flex w-full max-w-[90rem] flex-1 min-w-0"
          data-documentation-layout="fumadocs-docs"
          data-theme-region="content-shell"
        >
          {/* Desktop Persistent Sidebar (extends to top of screen) */}
          {hasGranular ? (
            <aside
              className="sticky top-0 hidden h-screen w-[272px] shrink-0 flex-col border-border/70 border-e bg-card/50 backdrop-blur-xs md:flex"
              data-theme-region="sidebar"
            >
              <div className="flex h-14 items-center justify-between px-4 border-b border-border/60">
                {slots.brand}
              </div>
              {slots.searchFull && (
                <div className="px-3 pt-3 pb-1">
                  {slots.searchFull}
                </div>
              )}
              {slots.navTabs && (
                <div className="px-3 py-1 border-b border-border/50">
                  {slots.navTabs}
                </div>
              )}
              <ScrollArea className="flex-1 px-3 py-3">
                <div className="pb-12" data-theme-region="sidebar-content">
                  {slots.navAnchors}
                  {slots.sidebarTree ?? slots.navigation}
                </div>
              </ScrollArea>
              {slots.tools && (
                <div className="mt-auto border-t border-border/60 p-3 flex items-center justify-between gap-1.5">
                  {slots.tools}
                </div>
              )}
            </aside>
          ) : (
            <aside
              className="sticky top-(--site-header-h) hidden h-[calc(100dvh-var(--site-header-h))] self-start border-border/70 border-e lg:block"
              data-theme-region="sidebar"
            >
              <ScrollArea className="h-full">
                <div className="pt-6 pb-16 pe-4" data-theme-region="sidebar-content">
                  {slots.navigation}
                </div>
              </ScrollArea>
            </aside>
          )}

          <div className="min-w-0 flex-1 px-4 sm:px-6 lg:px-10">{slots.content}</div>
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
        className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)]"
        data-documentation-layout="fumadocs-docs-preview"
        data-theme-region="preview-shell"
      >
        <aside className="hidden min-h-0 flex-col border-border border-e bg-card/40 md:flex" data-theme-region="sidebar">
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
        className="grid min-h-[22rem] grid-cols-[7.5rem_minmax(0,1fr)]"
        data-documentation-layout="fumadocs-docs-studio"
        data-theme-region="preview-shell"
      >
        <div className="border-border border-e bg-card/45 p-2 text-xs" data-theme-region="sidebar">
          {navigation}
        </div>
        <div className="min-w-0 p-3">{content}</div>
      </div>
    </>
  ),

  PageLayout: ({ article, tableOfContents }) => (
    <div
      className="grid min-w-0 grid-cols-1 gap-10 py-8 lg:py-12 lg:grid-cols-[minmax(0,1fr)_14rem]"
      data-documentation-layout="fumadocs-docs-page"
      data-theme-region="page-shell"
    >
      <div className="min-w-0 max-w-4xl">{article}</div>
      <aside className="hidden lg:block" data-theme-region="toc">
        <div className="sticky top-(--content-scroll-mt) max-h-[calc(100dvh-var(--content-scroll-mt)-2rem)] overflow-y-auto">
          {tableOfContents}
        </div>
      </aside>
    </div>
  ),
};
