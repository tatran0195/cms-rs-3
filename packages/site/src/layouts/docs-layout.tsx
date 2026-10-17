import { ScrollArea } from '@cms/design-system/components/ui/scroll-area';
import { cn } from '@cms/design-system/lib/utils';
import { renderReaderFrame } from './shared';
import type { DocsLayoutTemplate } from './types';

/**
 * Standard Docs Layout (`docs`)
 * Modeled on Fumadocs default documentation layout:
 * - Persistent left sidebar with tree navigation and search
 * - Sticky top header shell
 * - Central documentation reading measure
 * - Right-hand sticky table of contents outline
 */
export const DocsStandardLayoutTemplate: DocsLayoutTemplate = {
  id: 'docs',
  ReaderLayout: (slots) =>
    renderReaderFrame(
      slots,
      <div
        className="mx-auto grid w-full max-w-[90rem] flex-1 grid-cols-1 px-4 sm:px-6 lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:gap-10"
        data-documentation-layout="fumadocs-docs"
        data-theme-region="content-shell"
      >
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
        <div className="min-w-0 flex-1">{slots.content}</div>
      </div>,
    ),

  ProjectPreviewLayout: ({ mobileNavigation, navigation, content }) => (
    <>
      {mobileNavigation}
      <div
        className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)]"
        data-documentation-layout="fumadocs-docs-preview"
        data-theme-region="preview-shell"
      >
        <aside className="hidden min-h-0 flex-col border-border border-e bg-card/40 md:flex" data-theme-region="sidebar">
          {navigation}
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
      className="grid min-w-0 grid-cols-1 gap-10 py-8 lg:py-12 xl:grid-cols-[minmax(0,1fr)_13rem]"
      data-documentation-layout="fumadocs-docs-page"
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
