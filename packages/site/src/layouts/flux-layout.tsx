import { ScrollArea } from '@cms/design-system/components/ui/scroll-area';
import { cn } from '@cms/design-system/lib/utils';
import { PanelLeft, X } from 'lucide-react';
import { useState } from 'react';
import type { DocsLayoutTemplate } from './types';

/**
 * Flux Layout (`flux`)
 * Modeled after upstream Fumadocs Flux layout:
 * - Aggressively minimalist, distraction-free reading canvas with no top desktop header
 * - Signature floating bottom navigation dock (`NavigationPanel`) fixed at `bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2`
 * - Logo, category tab dropdown, search button, tools, and drawer toggle inside floating dock
 * - Backdrop blur drawer for hierarchical navigation tree
 * - Maximized reading measure in `#nd-page`
 */
function FluxReaderLayoutComponent(slots: Parameters<DocsLayoutTemplate['ReaderLayout']>[0]) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const hasGranular = Boolean(slots.brand);

  return (
    <div
      id="nd-flux-layout"
      data-documentation-layout="fumadocs-flux"
      className="flex min-h-screen flex-col bg-background relative"
    >
      {slots.banner}

      {/* Mobile top header fallback when granular slots not provided */}
      {!hasGranular && slots.header}

      {/* Main Reading Canvas */}
      <div
        className="mx-auto flex w-full max-w-[920px] flex-1 min-w-0 flex-col px-4 pt-6 pb-32 sm:px-8 sm:pt-10"
        data-theme-region="content-shell"
      >
        <div className="min-w-0 flex-1">{slots.content}</div>
      </div>

      {/* Floating Bottom Navigation Dock (Fumadocs NavigationPanel) */}
      <aside
        data-flux-nav-panel="true"
        className="fixed bottom-4 sm:bottom-6 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-[420px] -translate-x-1/2 flex-col gap-2 rounded-2xl border border-border/80 bg-popover/90 p-2.5 text-popover-foreground shadow-2xl backdrop-blur-md transition-all duration-200 hover:shadow-primary/5"
        data-theme-region="navigation-panel"
      >
        <div className="flex items-center justify-between px-1">
          <div className="flex min-w-0 items-center gap-2">
            {slots.brand ?? <span className="font-semibold text-sm">Documentation</span>}
          </div>
          {slots.navTabs && <div className="min-w-0 max-w-[180px] overflow-hidden">{slots.navTabs}</div>}
        </div>

        <div className="flex items-center justify-between gap-1 border-border/50 border-t pt-1.5">
          <div className="flex items-center gap-1">
            {slots.searchButton}
            {slots.tools}
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(!drawerOpen)}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={drawerOpen ? 'Close Navigation' : 'Open Navigation'}
            aria-expanded={drawerOpen}
          >
            {drawerOpen ? <X className="size-4" /> : <PanelLeft className="size-4" />}
          </button>
        </div>
      </aside>

      {/* Navigation Rail / Drawer Overlay */}
      <div
        className={cn(
          'fixed inset-0 z-30 flex flex-col justify-end bg-background/60 pb-28 px-4 backdrop-blur-md transition-all duration-200',
          drawerOpen ? 'opacity-100 pointer-events-auto' : 'pointer-events-none opacity-0',
        )}
        onClick={() => setDrawerOpen(false)}
      >
        <div
          className="fumadocs-flux-rail mx-auto flex max-h-[75vh] w-full max-w-xl flex-col overflow-y-auto rounded-2xl border border-border bg-card/95 p-6 shadow-2xl backdrop-blur-lg"
          onClick={(e) => e.stopPropagation()}
          data-theme-region="sidebar"
        >
          <div className="mb-4 flex items-center justify-between border-border/60 border-b pb-3">
            <span className="font-semibold text-sm">Navigation</span>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="grid size-7 place-items-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          <ScrollArea className="flex-1">
            <div data-theme-region="sidebar-content">
              {slots.navAnchors}
              {slots.sidebarTree ?? slots.navigation}
            </div>
          </ScrollArea>
        </div>
      </div>

      {slots.footer}
      {slots.overlays}
    </div>
  );
}

export const FluxLayoutTemplate: DocsLayoutTemplate = {
  id: 'flux',
  ReaderLayout: (slots) => <FluxReaderLayoutComponent {...slots} />,

  ProjectPreviewLayout: ({ mobileNavigation, navigation, content }) => (
    <>
      {mobileNavigation}
      <div
        id="nd-flux-layout"
        className="flex min-h-0 flex-1 flex-col bg-background p-4 relative"
        data-documentation-layout="fumadocs-flux-preview"
        data-theme-region="preview-shell"
      >
        <div className="min-w-0 flex-1 overflow-y-auto pb-16">{content}</div>
        <aside
          data-flux-nav-panel="true"
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center justify-between gap-3 rounded-full border border-border/80 bg-popover/90 px-4 py-2 shadow-lg backdrop-blur-md"
        >
          <div className="text-xs font-medium">Flux Navigation</div>
        </aside>
      </div>
    </>
  ),

  StudioPreviewLayout: ({ header, navigation, content }) => (
    <div
      id="nd-flux-layout"
      className="bg-background p-3 relative"
      data-documentation-layout="fumadocs-flux-studio"
      data-theme-region="preview-shell"
    >
      <div className="mx-auto max-w-[44rem] min-h-[20rem] overflow-hidden pb-12">
        <div className="min-w-0">{content}</div>
      </div>
      <div
        data-flux-nav-panel="true"
        className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border/80 bg-popover/90 px-3 py-1 shadow-md"
      >
        <span className="size-1.5 rounded-full bg-primary" />
        <span className="text-[10px] text-muted-foreground font-medium">Flux Dock</span>
      </div>
    </div>
  ),

  PageLayout: ({ article, tableOfContents, breadcrumb, footer }) => (
    <div
      className="flex flex-1 items-start gap-8 w-full min-w-0 justify-center"
      data-documentation-layout="fumadocs-flux-page"
      data-theme-region="page-shell"
    >
      <article
        id="nd-page"
        className="flex flex-col gap-6 w-full min-w-0 max-w-[760px] pb-12"
      >
        {breadcrumb && <div className="mb-2">{breadcrumb}</div>}
        {article}
        {footer}
      </article>
      {tableOfContents && (
        <aside
          className="sticky top-6 hidden xl:block w-[240px] shrink-0 self-start"
          data-theme-region="toc"
        >
          {tableOfContents}
        </aside>
      )}
    </div>
  ),
};
