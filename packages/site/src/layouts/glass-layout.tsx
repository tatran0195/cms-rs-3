'use client';

import { GlassPage, GlassReaderShell } from './glass';
import type { DocsLayoutTemplate } from './types';

export * from './glass';

export const GlassLayoutTemplate: DocsLayoutTemplate = {
  id: 'glass',
  ReaderLayout: (slots) => <GlassReaderShell {...slots} />,

  ProjectPreviewLayout: ({ mobileNavigation, navigation, content, brand, tools }) => (
    <>
      {mobileNavigation}
      <div
        id="fd-glass-layout"
        className="flex min-h-0 flex-1 gap-3 bg-muted/20 p-4"
        data-documentation-layout="glass-preview"
        data-theme-region="preview-shell"
      >
        <aside
          id="nd-sidebar"
          className="glass-sidebar hidden w-72 shrink-0 flex-col rounded-xl border border-border/70 bg-card/70 p-3 shadow-xs backdrop-blur-sm md:flex"
          data-theme-region="sidebar"
        >
          {brand && <div className="border-b border-border/50 p-2">{brand}</div>}
          <div className="flex-1 overflow-y-auto p-2">{navigation}</div>
          {tools && <div className="border-t border-border/50 p-2">{tools}</div>}
        </aside>
        <div className="min-w-0 flex-1 overflow-y-auto rounded-xl border border-border/70 bg-background/80 p-6 shadow-xs backdrop-blur-xs">
          {content}
        </div>
      </div>
    </>
  ),

  StudioPreviewLayout: ({ header, navigation, content }) => (
    <div id="fd-glass-layout" className="bg-muted/20 p-3" data-documentation-layout="glass-studio" data-theme-region="preview-shell">
      <div className="mx-auto w-full max-w-[var(--theme-content-max,46rem)] overflow-hidden rounded-xl border border-border/70 bg-background/80 shadow-xs backdrop-blur-sm">
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

  PageLayout: (slots) => <GlassPage {...slots} />,
};
