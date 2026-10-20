'use client';

import { SpaciousPage, SpaciousReaderShell } from './spacious';
import type { DocsLayoutTemplate } from './types';

export * from './spacious';

export const SpaciousLayoutTemplate: DocsLayoutTemplate = {
  id: 'spacious',
  ReaderLayout: (slots) => <SpaciousReaderShell {...slots} />,

  ProjectPreviewLayout: ({ mobileNavigation, navigation, content }) => (
    <>
      {mobileNavigation}
      <div
        id="fd-spacious-layout"
        className="flex min-h-0 flex-1 bg-card/40 p-3"
        data-documentation-layout="spacious-preview"
        data-theme-region="preview-shell"
      >
        <aside className="hidden w-56 flex-col border-e-0 bg-transparent p-3 md:flex" data-theme-region="sidebar">
          {navigation}
        </aside>
        <div id="nd-page-panel" className="min-w-0 flex-1 overflow-y-auto rounded-2xl border border-border/80 bg-background p-6 shadow-xs">
          <div data-spacious-scroll-container="true" className="md:overflow-y-auto">
            {content}
          </div>
        </div>
      </div>
    </>
  ),

  StudioPreviewLayout: ({ header, navigation, content }) => (
    <div id="fd-spacious-layout" className="bg-card/40 p-3" data-documentation-layout="spacious-studio" data-theme-region="preview-shell">
      <div className="mx-auto w-full max-w-[var(--theme-content-max,48rem)]">
        {header}
        <div className="grid min-h-[20rem] grid-cols-[7.5rem_minmax(0,1fr)] gap-2 p-2">
          <div className="p-2 text-xs border-e-0" data-theme-region="sidebar">
            {navigation}
          </div>
          <div id="nd-page-panel" className="min-w-0 rounded-xl border border-border/80 bg-background p-4 shadow-xs">
            <div data-spacious-scroll-container="true" className="md:overflow-y-auto">
              {content}
            </div>
          </div>
        </div>
      </div>
    </div>
  ),

  PageLayout: (slots) => <SpaciousPage {...slots} />,
};
