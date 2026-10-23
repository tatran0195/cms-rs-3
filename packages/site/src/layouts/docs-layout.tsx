'use client';

import { DocsPage, DocsStandardReaderShell } from './docs';
import type { DocsLayoutTemplate } from './types';

export * from './docs';

export const DocsStandardLayoutTemplate: DocsLayoutTemplate = {
  id: 'docs',
  ReaderLayout: (slots) => <DocsStandardReaderShell {...slots} />,

  ProjectPreviewLayout: ({ mobileNavigation, navigation, content, brand, tools }) => (
    <>
      {mobileNavigation}
      <div
        id="nd-docs-layout"
        className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[288px_minmax(0,1fr)]"
        data-documentation-layout="docs-preview"
        data-theme-region="preview-shell"
      >
        <aside id="nd-sidebar" className="hidden min-h-0 w-72 flex-col border-border border-e bg-card/40 md:flex" data-theme-region="sidebar">
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
        id="nd-docs-layout"
        className="grid min-h-[22rem] grid-cols-[7.5rem_minmax(0,1fr)]"
        data-documentation-layout="docs-studio"
        data-theme-region="preview-shell"
      >
        <div id="nd-sidebar" className="border-border border-e bg-card/45 p-2 text-xs" data-theme-region="sidebar">
          {navigation}
        </div>
        <div className="min-w-0 p-3">{content}</div>
      </div>
    </>
  ),

  PageLayout: (slots) => <DocsPage {...slots} />,
};
