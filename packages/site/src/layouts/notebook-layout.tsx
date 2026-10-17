import { ScrollArea } from '@cms/design-system/components/ui/scroll-area';
import { cn } from '@cms/design-system/lib/utils';
import type { DocsLayoutTemplate } from './types';

/**
 * Notebook Layout (`notebook`)
 * Modeled on Fumadocs Notebook layout:
 * - Elevated central notebook card canvas (fumadocs-notebook-paper) on a subtle muted canvas
 * - Clean top header bar with horizontal sub-header layout tabs
 * - Tangible notebook / documentation binder reading experience
 */
export const NotebookLayoutTemplate: DocsLayoutTemplate = {
  id: 'notebook',
  ReaderLayout: (slots) => (
    <div className="flex min-h-screen flex-col bg-muted/30">
      {slots.banner}

      {/* Header with attached horizontal layout tabs */}
      <div className="sticky top-0 z-30 border-border/70 border-b bg-background/85 backdrop-blur-md">
        {slots.header}
        {slots.navTabs && (
          <div className="border-border/60 border-t bg-muted/30 px-6 h-10 flex items-center gap-6 text-sm overflow-x-auto">
            {slots.navTabs}
          </div>
        )}
      </div>

      <div
        className="mx-auto flex w-full max-w-[96rem] flex-1 px-4 sm:px-6 lg:gap-8"
        data-documentation-layout="fumadocs-notebook"
        data-theme-region="content-shell"
      >
        {/* Left Sidebar */}
        <aside
          className="sticky top-[calc(var(--site-header-h,4rem)+1.5rem)] hidden h-[calc(100dvh-var(--site-header-h,4rem)-3rem)] w-60 shrink-0 border-border/60 border-e py-6 pe-4 lg:block"
          data-theme-region="sidebar"
        >
          <ScrollArea className="h-full">
            <div data-theme-region="sidebar-content">
              {slots.navigation}
            </div>
          </ScrollArea>
        </aside>

        {/* Elevated Notebook Card Paper */}
        <div className="flex flex-1 min-w-0 py-6">
          <div
            className="fumadocs-notebook-paper mx-auto w-full max-w-[960px] rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-10 lg:p-12 min-w-0"
            data-theme-region="notebook-paper"
          >
            {slots.content}
          </div>
        </div>
      </div>

      {slots.footer}
      {slots.overlays}
    </div>
  ),

  ProjectPreviewLayout: ({ mobileNavigation, navigation, content }) => (
    <>
      {mobileNavigation}
      <div
        className="flex min-h-0 flex-1 gap-3 bg-muted/30 p-4"
        data-documentation-layout="fumadocs-notebook-preview"
        data-theme-region="preview-shell"
      >
        <aside className="hidden w-52 flex-col border-border/60 border-e bg-card/40 p-3 md:flex" data-theme-region="sidebar">
          {navigation}
        </aside>
        <div className="min-w-0 flex-1 overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-sm">
          {content}
        </div>
      </div>
    </>
  ),

  StudioPreviewLayout: ({ header, navigation, content }) => (
    <div className="bg-muted/40 p-3" data-documentation-layout="fumadocs-notebook-studio" data-theme-region="preview-shell">
      <div className="mx-auto max-w-[46rem] overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {header}
        <div className="grid min-h-[20rem] grid-cols-[7rem_minmax(0,1fr)] border-border/60 border-t">
          <div className="border-border/60 border-e p-2 text-xs" data-theme-region="sidebar">
            {navigation}
          </div>
          <div className="min-w-0 p-4">{content}</div>
        </div>
      </div>
    </div>
  ),

  PageLayout: ({ article, tableOfContents }) => (
    <div
      className="grid min-w-0 grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_13rem]"
      data-documentation-layout="fumadocs-notebook-page"
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
