'use client';

import { NotebookPage, NotebookReaderShell } from './notebook';
import type { DocsLayoutTemplate } from './types';

export * from './notebook';

export const NotebookLayoutTemplate: DocsLayoutTemplate = {
  id: 'notebook',
  ReaderLayout: (slots) => <NotebookReaderShell {...slots} />,

  ProjectPreviewLayout: ({ mobileNavigation, navigation, content }) => (
    <>
      {mobileNavigation}
      <div
        id="nd-notebook-layout"
        className="flex min-h-0 flex-1 gap-3 bg-muted/30 p-4"
        data-documentation-layout="notebook-preview"
        data-theme-region="preview-shell"
      >
        <aside id="nd-sidebar" className="hidden w-72 shrink-0 flex-col border-border/60 border-e bg-card/40 p-3 md:flex" data-theme-region="sidebar">
          {navigation}
        </aside>
        <div className="min-w-0 flex-1 overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-sm">{content}</div>
      </div>
    </>
  ),

  StudioPreviewLayout: ({ header, navigation, content }) => (
    <div id="nd-notebook-layout" className="bg-muted/40 p-3" data-documentation-layout="notebook-studio" data-theme-region="preview-shell">
      <div className="mx-auto w-full max-w-[var(--theme-content-max,46rem)] overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {header}
        <div className="grid min-h-[20rem] grid-cols-[7rem_minmax(0,1fr)] border-border/60 border-t">
          <div id="nd-sidebar" className="border-border/60 border-e p-2 text-xs" data-theme-region="sidebar">
            {navigation}
          </div>
          <div className="min-w-0 p-4">{content}</div>
        </div>
      </div>
    </div>
  ),

  PageLayout: (slots) => <NotebookPage {...slots} />,
};
