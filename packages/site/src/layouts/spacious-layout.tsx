import { ScrollArea } from '@cms/design-system/components/ui/scroll-area';
import { cn } from '@cms/design-system/lib/utils';
import type { CSSProperties } from 'react';
import { SidebarToggle } from '../components/sidebar-toggle';
import { useSidebar } from '../context/sidebar-context';
import type { DocsLayoutSlots, DocsLayoutTemplate } from './types';

function SpaciousReaderShell(slots: DocsLayoutSlots) {
  const hasGranular = Boolean(slots.brand);
  const { collapsed, collapsible } = useSidebar();

  return (
    <div
      id="fd-spacious-layout"
      data-sidebar-collapsed={collapsed ? 'true' : 'false'}
      data-documentation-layout="spacious"
      className="relative grid min-h-screen bg-card/40 dark:bg-card/20 md:h-screen md:min-h-0 md:overflow-clip [--fd-header-height:3.5rem] [--fd-sidebar-width:0px] md:[--fd-sidebar-width:268px] [--fd-sidebar-col:var(--fd-sidebar-width)] [--fd-page-width:760px] [--fd-toc-width:0px] xl:[--fd-toc-width:240px] transition-[grid-template-columns] duration-300 print:h-auto print:overflow-visible"
      style={
        {
          gridTemplate: `"sidebar header right" auto
"sidebar toc-popover right" var(--fd-toc-popover-height, 0px)
"sidebar main right" 1fr / var(--fd-sidebar-col) minmax(0, 1fr) auto`,
          '--fd-sidebar-col': collapsed ? '0px' : 'var(--fd-sidebar-width)',
          '--fd-page-width': '760px',
        } as CSSProperties
      }
    >
      {slots.banner}

      {/* Mobile Header (md:hidden) */}
      <div className={cn('[grid-area:header]', hasGranular && 'md:hidden')}>{slots.header}</div>

      {/* Left Minimalist Sidebar: border-e-0 per Fumadocs Spacious */}
      <aside
        id="nd-sidebar"
        data-collapsed={collapsed ? 'true' : 'false'}
        className={cn(
          'sticky top-0 hidden h-full shrink-0 flex-col border-e-0 bg-transparent md:flex [grid-area:sidebar] transition-all duration-200',
          collapsed ? 'w-0 p-0 overflow-hidden opacity-0 pointer-events-none' : 'w-[268px] p-4',
        )}
        data-theme-region="sidebar"
      >
        {hasGranular ? (
          <>
            <div className="flex items-center justify-between pb-3">
              {slots.brand}
              {collapsible && <SidebarToggle />}
            </div>
            {slots.searchFull && <div className="pt-2 pb-1">{slots.searchFull}</div>}
            {slots.navTabs && <div className="py-2">{slots.navTabs}</div>}
            <ScrollArea className="flex-1 py-2">
              <div data-theme-region="sidebar-content">
                {slots.navAnchors}
                {slots.sidebarTree ?? slots.navigation}
              </div>
            </ScrollArea>
            {slots.tools && (
              <div className="mt-auto border-t border-border/40 pt-3">
                <div className="flex items-center justify-between border border-border/60 bg-muted/40 p-1 rounded-xl text-muted-foreground text-sm empty:hidden">
                  {slots.tools}
                </div>
              </div>
            )}
          </>
        ) : (
          <ScrollArea className="h-full">
            <div data-theme-region="sidebar-content">{slots.navigation}</div>
          </ScrollArea>
        )}
      </aside>

      {/* Elevated Crisp Inset Card Panel (#nd-page-panel) with internal scrolling on desktop */}
      <div
        id="nd-page-panel"
        className="relative flex flex-col min-w-0 min-h-0 [grid-area:main] mx-2 my-2 bg-background md:ms-0 md:rounded-2xl md:border md:border-border/80 md:shadow-xs md:overflow-clip print:overflow-visible"
        data-theme-region="spacious-panel"
      >
        {/* Top Panel Header fade bar matching Fumadocs Spacious */}
        <header className="absolute inset-x-0 top-0 z-10 hidden md:flex items-center justify-between h-14 ps-6 pe-4 bg-background/85 backdrop-blur-md pointer-events-none *:pointer-events-auto border-b border-border/40">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {collapsed && <SidebarToggle />}
            {slots.navLinks ? slots.navLinks : <span className="font-medium text-foreground/90">Documentation</span>}
          </div>
          <div className="flex items-center gap-2">
            {slots.searchButton}
            {collapsed && slots.tools}
          </div>
        </header>

        {/* Internal Scroll Container for Desktop Viewport */}
        <div
          data-spacious-scroll-container="true"
          className="flex flex-1 flex-col items-start px-4 md:min-h-0 pt-6 md:pt-16 md:px-8 md:overflow-y-auto md:overscroll-y-contain md:scrollbar-thin"
        >
          <div className="min-w-0 flex-1 w-full">{slots.content}</div>
          {slots.footer && <div className="w-full mt-auto pt-8">{slots.footer}</div>}
        </div>
      </div>

      {slots.overlays}
    </div>
  );
}

/**
 * Spacious Layout (`spacious`)
 * Modeled 100% after upstream Fumadocs Spacious layout:
 * - Desktop locked viewport height: `md:h-screen md:overflow-clip`
 * - Grid template: `"sidebar header right" auto / "sidebar toc-popover right" var(...) / "sidebar main right" 1fr / var(--fd-sidebar-col) minmax(0, 1fr) auto`
 * - Subtle canvas backdrop (`bg-card/40 dark:bg-card/20`) with borderless sidebar (`border-e-0`)
 * - Elevated inset card panel (`#nd-page-panel`) with rounded-2xl border and shadow
 * - Panel-internal scroll container: desktop scrolling occurs inside `#nd-page-panel` (`md:overflow-y-auto md:overscroll-y-contain`)
 * - Top fade bar inside panel with breadcrumbs and actions
 * - Integrated Table of Contents side-by-side with `#nd-page`
 */
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
      <div className="mx-auto max-w-[48rem]">
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

  PageLayout: ({ article, tableOfContents, breadcrumb, footer, tocPopover }) => (
    <div
      className="flex flex-1 items-start gap-8 w-full min-w-0 justify-center"
      data-documentation-layout="spacious-page"
      data-theme-region="page-shell"
    >
      <div className="flex flex-col flex-1 min-w-0 max-w-[760px]">
        {/* Mobile TOC Popover when below desktop */}
        {tocPopover && <div className="md:hidden mb-4 w-full">{tocPopover}</div>}
        <article id="nd-page" className="flex flex-col gap-6 w-full min-w-0 pt-4 pb-12">
          {breadcrumb && <div className="mb-2 md:hidden">{breadcrumb}</div>}
          {article}
          {footer}
        </article>
      </div>

      {tableOfContents && (
        <aside className="sticky top-20 hidden xl:block w-[240px] shrink-0 self-start" data-theme-region="toc">
          {tableOfContents}
        </aside>
      )}
    </div>
  ),
};
