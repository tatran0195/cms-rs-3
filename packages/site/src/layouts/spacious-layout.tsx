import { ScrollArea } from '@cms/design-system/components/ui/scroll-area';
import { cn } from '@cms/design-system/lib/utils';
import type { DocsLayoutTemplate } from './types';

/**
 * Spacious Layout (`spacious`)
 * Modeled on Fumadocs Spacious layout:
 * - Generous whitespace and roomier padding
 * - Soft canvas backdrop with an elevated inset main documentation panel
 * - Top-right page actions and minimalist sidebar
 */
export const SpaciousLayoutTemplate: DocsLayoutTemplate = {
  id: 'spacious',
  ReaderLayout: (slots) => {
    const hasGranular = Boolean(slots.brand);

    return (
      <div className="flex min-h-screen flex-col bg-card">
        {slots.banner}

        {/* Mobile Header (md:hidden) */}
        <div className={cn(hasGranular && 'md:hidden')}>
          {slots.header}
        </div>

        <div
          className="mx-auto flex w-full flex-1 min-w-0"
          data-documentation-layout="fumadocs-spacious"
          data-theme-region="content-shell"
        >
          {/* Left Minimalist Sidebar */}
          <aside
            className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-border/60 border-e bg-card p-4 md:flex"
            data-theme-region="sidebar"
          >
            {hasGranular ? (
              <>
                <div className="flex items-center justify-between pb-4 border-b border-border/50">
                  {slots.brand}
                </div>
                {slots.searchFull && (
                  <div className="pt-3 pb-1">
                    {slots.searchFull}
                  </div>
                )}
                {slots.navTabs && <div className="py-2 border-b border-border/40">{slots.navTabs}</div>}
                <ScrollArea className="flex-1 py-3">
                  <div data-theme-region="sidebar-content">
                    {slots.navAnchors}
                    {slots.sidebarTree ?? slots.navigation}
                  </div>
                </ScrollArea>
                {slots.tools && (
                  <div className="mt-auto border-t border-border/50 pt-3">
                    {slots.tools}
                  </div>
                )}
              </>
            ) : (
              <ScrollArea className="h-full">
                <div data-theme-region="sidebar-content">
                  {slots.navigation}
                </div>
              </ScrollArea>
            )}
          </aside>

          {/* Elevated Spacious Panel */}
          <div className="flex-1 min-w-0 p-2 sm:p-3 lg:p-4 flex flex-col">
            <div
              className="fumadocs-spacious-panel relative flex flex-1 flex-col rounded-2xl border border-border bg-background p-6 shadow-sm md:p-10 lg:p-14 min-w-0"
              data-theme-region="spacious-panel"
            >
              {hasGranular && (
                <div className="hidden md:flex items-center justify-between border-b border-border/50 pb-5 mb-6">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Documentation</span>
                  <div className="flex items-center gap-2">
                    {slots.tools}
                  </div>
                </div>
              )}
              <div className="min-w-0 flex-1">{slots.content}</div>
            </div>
          </div>
        </div>

        {slots.footer}
        {slots.overlays}
      </div>
    );
  },

  ProjectPreviewLayout: ({ mobileNavigation, navigation, content }) => (
    <>
      {mobileNavigation}
      <div
        className="flex min-h-0 flex-1 bg-card p-3"
        data-documentation-layout="fumadocs-spacious-preview"
        data-theme-region="preview-shell"
      >
        <aside className="hidden w-56 flex-col p-3 md:flex" data-theme-region="sidebar">
          {navigation}
        </aside>
        <div className="min-w-0 flex-1 overflow-y-auto rounded-xl border border-border bg-background p-6 shadow-sm">
          {content}
        </div>
      </div>
    </>
  ),

  StudioPreviewLayout: ({ header, navigation, content }) => (
    <div className="bg-card p-3" data-documentation-layout="fumadocs-spacious-studio" data-theme-region="preview-shell">
      <div className="mx-auto max-w-[48rem]">
        {header}
        <div className="grid min-h-[20rem] grid-cols-[7.5rem_minmax(0,1fr)] gap-2 p-2">
          <div className="p-2 text-xs" data-theme-region="sidebar">
            {navigation}
          </div>
          <div className="min-w-0 rounded-lg border border-border bg-background p-4 shadow-xs">{content}</div>
        </div>
      </div>
    </div>
  ),

  PageLayout: ({ article, tableOfContents }) => (
    <div
      className="grid min-w-0 grid-cols-1 gap-12 xl:grid-cols-[minmax(0,1fr)_13rem]"
      data-documentation-layout="fumadocs-spacious-page"
      data-theme-region="page-shell"
    >
      <div className="min-w-0 max-w-4xl">{article}</div>
      <aside className="hidden xl:block" data-theme-region="toc">
        <div className="sticky top-(--content-scroll-mt) max-h-[calc(100dvh-var(--content-scroll-mt)-2rem)] overflow-y-auto">
          {tableOfContents}
        </div>
      </aside>
    </div>
  ),
};
