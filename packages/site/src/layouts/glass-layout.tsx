import { ScrollArea } from '@cms/design-system/components/ui/scroll-area';
import { cn } from '@cms/design-system/lib/utils';
import { renderReaderFrame } from './shared';
import type { DocsLayoutTemplate } from './types';

/**
 * Glass Layout (`glass`)
 * Modeled on Fumadocs Glass layout:
 * - Modern translucent floating sidebar & header
 * - Frosted backdrop blur (`backdrop-blur-md`) with soft borders
 * - Elevated floating panels over canvas
 */
export const GlassLayoutTemplate: DocsLayoutTemplate = {
  id: 'glass',
  ReaderLayout: (slots) =>
    renderReaderFrame(
      slots,
      <div
        className="mx-auto flex w-full max-w-[92rem] flex-1 flex-col px-4 pt-4 pb-12 sm:px-6 lg:flex-row lg:gap-8"
        data-documentation-layout="fumadocs-glass"
        data-theme-region="content-shell"
      >
        <aside
          className="fumadocs-glass-sidebar sticky top-(--site-header-h) hidden h-[calc(100dvh-var(--site-header-h)-2rem)] w-64 shrink-0 rounded-2xl border border-border/70 bg-card/65 p-3 shadow-xs backdrop-blur-md lg:block"
          data-theme-region="sidebar"
        >
          <ScrollArea className="h-full">
            <div className="pe-2" data-theme-region="sidebar-content">
              {slots.navigation}
            </div>
          </ScrollArea>
        </aside>
        <div className="min-w-0 flex-1">{slots.content}</div>
      </div>,
    ),

  ProjectPreviewLayout: ({ mobileNavigation, navigation, content }) => (
    <>
      {mobileNavigation}
      <div
        className="flex min-h-0 flex-1 gap-3 bg-muted/30 p-4"
        data-documentation-layout="fumadocs-glass-preview"
        data-theme-region="preview-shell"
      >
        <aside
          className="hidden w-56 flex-col rounded-xl border border-border/70 bg-card/70 p-3 shadow-xs backdrop-blur-sm md:flex"
          data-theme-region="sidebar"
        >
          {navigation}
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
        <div className="sticky top-(--content-scroll-mt) max-h-[calc(100dvh-var(--content-scroll-mt)-2rem)] overflow-y-auto rounded-2xl border border-border/60 bg-card/50 p-4 backdrop-blur-sm">
          {tableOfContents}
        </div>
      </aside>
    </div>
  ),
};
