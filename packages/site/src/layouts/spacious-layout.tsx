import { ScrollArea } from '@cms/design-system/components/ui/scroll-area';
import { cn } from '@cms/design-system/lib/utils';
import { renderReaderFrame } from './shared';
import type { DocsLayoutTemplate } from './types';

/**
 * Spacious Layout (`spacious`)
 * Modeled on Fumadocs Spacious layout:
 * - Inset documentation panel with generous outer margins and breathing room
 * - Relaxed-spaced sidebar docking beside the elevated frame
 * - Modern rounded card contour
 */
export const SpaciousLayoutTemplate: DocsLayoutTemplate = {
  id: 'spacious',
  ReaderLayout: (slots) =>
    renderReaderFrame(
      slots,
      <div
        className="mx-auto flex w-full max-w-[94rem] flex-1 flex-col px-4 pt-4 pb-14 sm:px-6 lg:flex-row lg:gap-8"
        data-documentation-layout="fumadocs-spacious"
        data-theme-region="content-shell"
      >
        <aside
          className="sticky top-(--site-header-h) hidden h-[calc(100dvh-var(--site-header-h)-2rem)] w-64 shrink-0 pt-4 lg:block"
          data-theme-region="sidebar"
        >
          <ScrollArea className="h-full">
            <div className="pe-4" data-theme-region="sidebar-content">
              {slots.navigation}
            </div>
          </ScrollArea>
        </aside>
        <div className="fumadocs-spacious-panel min-w-0 flex-1 rounded-3xl border border-border/70 bg-card/60 p-6 shadow-xs backdrop-blur-xs sm:p-10 lg:p-12">
          {slots.content}
        </div>
      </div>,
    ),

  ProjectPreviewLayout: ({ mobileNavigation, navigation, content }) => (
    <>
      {mobileNavigation}
      <div
        className="flex min-h-0 flex-1 gap-3 bg-muted/40 p-4"
        data-documentation-layout="fumadocs-spacious-preview"
        data-theme-region="preview-shell"
      >
        <aside className="hidden w-56 flex-col border border-border/60 rounded-xl bg-card/60 p-3 md:flex" data-theme-region="sidebar">
          {navigation}
        </aside>
        <div className="fumadocs-spacious-panel min-w-0 flex-1 overflow-y-auto rounded-2xl border border-border/70 bg-card/80 p-6 shadow-xs">
          {content}
        </div>
      </div>
    </>
  ),

  StudioPreviewLayout: ({ header, navigation, content }) => (
    <div className="bg-muted/40 p-3" data-documentation-layout="fumadocs-spacious-studio" data-theme-region="preview-shell">
      <div className="rounded-2xl border border-border/70 bg-card shadow-xs">
        {header}
        <div className="grid min-h-[20rem] grid-cols-[7.5rem_minmax(0,1fr)]">
          <div className="border-border/60 border-e p-3 text-xs" data-theme-region="sidebar">
            {navigation}
          </div>
          <div className="min-w-0 p-4">{content}</div>
        </div>
      </div>
    </div>
  ),

  PageLayout: ({ article, tableOfContents }) => (
    <div
      className="grid min-w-0 grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1fr)_14rem]"
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
