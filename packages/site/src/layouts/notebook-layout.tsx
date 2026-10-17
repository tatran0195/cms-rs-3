import { ScrollArea } from '@cms/design-system/components/ui/scroll-area';
import { cn } from '@cms/design-system/lib/utils';
import type { DocsLayoutTemplate } from './types';

/**
 * Notebook Layout (`notebook`)
 * Modeled on Fumadocs Notebook layout:
 * - Tinted canvas background with an elevated card-style notebook reading pane
 * - Integrated header spanning or sitting atop the paper frame
 * - Dedicated navigation dock
 * - Centered focused reading measure
 */
export const NotebookLayoutTemplate: DocsLayoutTemplate = {
  id: 'notebook',
  ReaderLayout: (slots) => (
    <>
      {slots.banner}
      <section
        className="fumadocs-notebook-reader flex flex-1 flex-col bg-muted/40"
        data-documentation-layout="fumadocs-notebook"
      >
        {slots.header}
        <div className="mx-auto flex w-full max-w-[86rem] flex-1 flex-col px-4 pb-12 sm:px-6 lg:flex-row lg:gap-8" data-theme-region="content-shell">
          <aside
            className="sticky top-(--site-header-h) hidden h-[calc(100dvh-var(--site-header-h)-2rem)] w-64 shrink-0 pt-6 lg:block"
            data-theme-region="sidebar"
          >
            <ScrollArea className="h-full">
              <div className="pe-4" data-theme-region="sidebar-content">
                {slots.navigation}
              </div>
            </ScrollArea>
          </aside>
          <div className="fumadocs-notebook-paper min-w-0 flex-1 rounded-2xl border border-border/80 bg-card p-6 shadow-xs sm:p-8 lg:mt-4 lg:p-10">
            {slots.content}
          </div>
        </div>
      </section>
      {slots.footer}
      {slots.overlays}
    </>
  ),

  ProjectPreviewLayout: ({ mobileNavigation, navigation, content }) => (
    <>
      {mobileNavigation}
      <div
        className="flex min-h-0 flex-1 flex-col gap-3 bg-muted/50 p-4"
        data-documentation-layout="fumadocs-notebook-preview"
        data-theme-region="preview-shell"
      >
        <aside className="hidden max-h-40 flex-col border border-border rounded-lg bg-card md:flex" data-theme-region="sidebar">
          {navigation}
        </aside>
        <div className="fumadocs-notebook-paper min-h-0 w-full flex-1 overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-sm">
          {content}
        </div>
      </div>
    </>
  ),

  StudioPreviewLayout: ({ header, navigation, content }) => (
    <div className="bg-muted/40 p-3" data-documentation-layout="fumadocs-notebook-studio" data-theme-region="preview-shell">
      <div className="mx-auto max-w-[48rem] rounded-xl border border-border bg-card shadow-sm">
        {header}
        <div className="border-border border-b px-3 py-2 text-xs" data-theme-region="sidebar">
          {navigation}
        </div>
        <div className="min-h-[20rem] p-4">{content}</div>
      </div>
    </div>
  ),

  PageLayout: ({ article, tableOfContents }) => (
    <div
      className="grid min-w-0 grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_13rem]"
      data-documentation-layout="fumadocs-notebook-page"
      data-theme-region="page-shell"
    >
      <div className="min-w-0">{article}</div>
      <aside className="hidden xl:block" data-theme-region="toc">
        <div className="sticky top-(--content-scroll-mt) max-h-[calc(100dvh-var(--content-scroll-mt)-2rem)] overflow-y-auto">
          {tableOfContents}
        </div>
      </aside>
    </div>
  ),
};
