import { ScrollArea } from '@cms/design-system/components/ui/scroll-area';
import { cn } from '@cms/design-system/lib/utils';
import type { DocsLayoutTemplate } from './types';

/**
 * Spacious Layout (`spacious`)
 * Modeled on Fumadocs Spacious layout:
 * - Generous whitespace and roomier padding
 * - Subtle muted canvas backdrop (`bg-muted/40 dark:bg-muted/20`) with an elevated crisp inset documentation card (`bg-background rounded-2xl border shadow-xs`)
 * - Sidebar has NO right border (`border-e-0`); separation is created by the floating inset card
 * - Clean breadcrumb/path on the left and actions/tools on the right inside the panel header
 */
export const SpaciousLayoutTemplate: DocsLayoutTemplate = {
  id: 'spacious',
  ReaderLayout: (slots) => {
    const hasGranular = Boolean(slots.brand);

    return (
      <div className="flex min-h-screen flex-col bg-muted/40 dark:bg-muted/20">
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
          {/* Left Minimalist Sidebar: border-e-0 per Fumadocs Spacious */}
          <aside
            className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-e-0 bg-transparent p-4 md:flex"
            data-theme-region="sidebar"
          >
            {hasGranular ? (
              <>
                <div className="flex items-center justify-between pb-3">
                  {slots.brand}
                </div>
                {slots.searchFull && (
                  <div className="pt-2 pb-1">
                    {slots.searchFull}
                  </div>
                )}
                {slots.navTabs && <div className="py-2">{slots.navTabs}</div>}
                <ScrollArea className="flex-1 py-2">
                  <div data-theme-region="sidebar-content">
                    {slots.navAnchors}
                    {slots.sidebarTree ?? slots.navigation}
                  </div>
                </ScrollArea>
                {slots.tools && (
                  <div className="mt-auto border-t border-border/40 pt-3">
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

          {/* Elevated Crisp Inset Card Panel (#nd-page-panel) */}
          <div className="flex-1 min-w-0 p-2 sm:p-3 md:ps-0 flex flex-col">
            <div
              className="fumadocs-spacious-panel relative flex flex-1 flex-col rounded-2xl border border-border/80 bg-background p-6 shadow-xs sm:p-8 md:p-10 min-w-0 overflow-hidden"
              data-theme-region="spacious-panel"
            >
              {hasGranular && (
                <div className="hidden md:flex items-center justify-between pb-4 mb-6 border-b border-border/40">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground/80">Documentation</span>
                  </div>
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
        className="flex min-h-0 flex-1 bg-muted/40 p-3"
        data-documentation-layout="fumadocs-spacious-preview"
        data-theme-region="preview-shell"
      >
        <aside className="hidden w-56 flex-col border-e-0 bg-transparent p-3 md:flex" data-theme-region="sidebar">
          {navigation}
        </aside>
        <div className="min-w-0 flex-1 overflow-y-auto rounded-2xl border border-border/80 bg-background p-6 shadow-xs">
          {content}
        </div>
      </div>
    </>
  ),

  StudioPreviewLayout: ({ header, navigation, content }) => (
    <div className="bg-muted/40 p-3" data-documentation-layout="fumadocs-spacious-studio" data-theme-region="preview-shell">
      <div className="mx-auto max-w-[48rem]">
        {header}
        <div className="grid min-h-[20rem] grid-cols-[7.5rem_minmax(0,1fr)] gap-2 p-2">
          <div className="p-2 text-xs" data-theme-region="sidebar">
            {navigation}
          </div>
          <div className="min-w-0 rounded-xl border border-border/80 bg-background p-4 shadow-xs">{content}</div>
        </div>
      </div>
    </div>
  ),

  PageLayout: ({ article, tableOfContents }) => (
    <div
      className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_14rem]"
      data-documentation-layout="fumadocs-spacious-page"
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
