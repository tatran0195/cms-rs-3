import { ScrollArea } from '@cms/design-system/components/ui/scroll-area';
import { cn } from '@cms/design-system/lib/utils';
import { renderReaderFrame } from './shared';
import type { DocsLayoutTemplate } from './types';

/**
 * Flux Layout (`flux`)
 * Modeled on Fumadocs Flux layout:
 * - Aggressively minimalist, distraction-free reading canvas
 * - Slim compact navigation rail
 * - Maximized typographic and code width
 */
export const FluxLayoutTemplate: DocsLayoutTemplate = {
  id: 'flux',
  ReaderLayout: (slots) =>
    renderReaderFrame(
      slots,
      <div
        className="mx-auto flex w-full max-w-[96rem] flex-1 flex-col px-4 pb-12 sm:px-6 lg:flex-row"
        data-documentation-layout="fumadocs-flux"
        data-theme-region="content-shell"
      >
        <aside
          className="fumadocs-flux-rail sticky top-(--site-header-h) hidden h-[calc(100dvh-var(--site-header-h))] w-56 shrink-0 border-border/60 border-e py-6 pe-4 lg:block"
          data-theme-region="sidebar"
        >
          <ScrollArea className="h-full">
            <div data-theme-region="sidebar-content">{slots.navigation}</div>
          </ScrollArea>
        </aside>
        <div className="min-w-0 flex-1 lg:ps-8">{slots.content}</div>
      </div>,
    ),

  ProjectPreviewLayout: ({ mobileNavigation, navigation, content }) => (
    <>
      {mobileNavigation}
      <div
        className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)]"
        data-documentation-layout="fumadocs-flux-preview"
        data-theme-region="preview-shell"
      >
        <aside className="hidden min-h-0 flex-col border-border/70 border-e bg-card/30 md:flex" data-theme-region="sidebar">
          {navigation}
        </aside>
        <div className="min-w-0 flex-1 overflow-y-auto">{content}</div>
      </div>
    </>
  ),

  StudioPreviewLayout: ({ header, navigation, content }) => (
    <div className="bg-card/30" data-documentation-layout="fumadocs-flux-studio" data-theme-region="preview-shell">
      {header}
      <div className="grid min-h-[20rem] grid-cols-[6.5rem_minmax(0,1fr)]">
        <div className="border-border/60 border-e p-2 text-xs" data-theme-region="sidebar">
          {navigation}
        </div>
        <div className="min-w-0 p-3">{content}</div>
      </div>
    </div>
  ),

  PageLayout: ({ article, tableOfContents }) => (
    <div
      className="grid min-w-0 grid-cols-1 gap-8 py-6 lg:py-10 xl:grid-cols-[minmax(0,1fr)_12rem]"
      data-documentation-layout="fumadocs-flux-page"
      data-theme-region="page-shell"
    >
      <div className="min-w-0 max-w-5xl">{article}</div>
      <aside className="hidden xl:block" data-theme-region="toc">
        <div className="sticky top-(--content-scroll-mt) max-h-[calc(100dvh-var(--content-scroll-mt)-2rem)] overflow-y-auto">
          {tableOfContents}
        </div>
      </aside>
    </div>
  ),
};
