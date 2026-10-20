'use client';

import { cn } from '@cms/design-system/lib/utils';
import { Search } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import type { DocsLayoutTemplate } from '../types';
import { Container } from './slots/container';
import { Sidebar, SidebarProvider, SidebarTrigger } from './slots/sidebar';
import { TabDropdown } from './slots/tab-dropdown';

export * from './page';
export { ProgressCircle as FluxProgressCircle, TOC as FluxTOC } from './page/slots/toc';
export { Container } from './slots/container';
export { Sidebar, SidebarProvider, SidebarTrigger, useSidebar } from './slots/sidebar';
export { TabDropdown } from './slots/tab-dropdown';

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg role="img" viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

export interface NavigationPanelProps extends ComponentProps<'aside'> {
  head: ReactNode;
  tabDropdown?: ReactNode;
  tool?: ReactNode;
  link?: ReactNode;
}

export function NavigationPanel({ head, tabDropdown, tool, link, className, ...props }: NavigationPanelProps) {
  return (
    <aside
      className={cn(
        'fixed bottom-0 sm:bottom-6 z-40 w-full sm:max-w-[420px] left-1/2 -translate-x-1/2 p-2 border shadow-2xl rounded-t-2xl sm:rounded-2xl transition-all duration-200 bg-popover/90 text-popover-foreground backdrop-blur-md',
        className,
      )}
      data-theme-region="navigation-panel"
      data-flux-nav-panel="true"
      {...props}
    >
      {/* Row 1: Head / Brand + TOC Popover Portal Slot */}
      <div className="flex flex-row items-center ps-2.5 p-1 gap-2 min-h-11">
        <div className="flex min-w-0 max-w-[180px] items-center gap-2 shrink-0 truncate [&_a]:truncate [&_span]:truncate">{head}</div>
        <div id="flux-layout-slot" className="flex-1 min-w-0" />
      </div>

      {/* Row 2: TabDropdown/Version + Link + Tools */}
      <div className="flex flex-row items-center gap-1.5 p-2 sm:p-1 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex flex-row items-center gap-2 min-w-0 flex-1">{tabDropdown}</div>

        <div className="flex flex-row items-center text-muted-foreground px-0.5 empty:hidden">{link}</div>

        <div className="flex flex-row items-center text-muted-foreground gap-1 ms-auto shrink-0">{tool}</div>
      </div>
    </aside>
  );
}

export const FluxReaderLayoutComponent: DocsLayoutTemplate['ReaderLayout'] = (slots) => {
  const defaultBrand = <span className="font-semibold text-sm truncate tracking-tight text-foreground">Documentation</span>;

  return (
    <SidebarProvider>
      <Container data-theme-layout="flux">
        {/* Main Content Area */}
        <div className="w-full flex-1 flex flex-col items-center">
          {slots.banner}
          {slots.content}
        </div>

        {/* Navigation Drawer Overlay */}
        <Sidebar banner={slots.banner} navAnchors={slots.navAnchors} navigation={slots.sidebarTree ?? slots.navigation} />

        {/* Floating Dock Navigation Panel */}
        <NavigationPanel
          head={slots.brand ?? defaultBrand}
          tabDropdown={slots.fluxTab ?? (slots.navTabs && <TabDropdown navTabs={slots.navTabs} />)}
          link={
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub repository"
              className="grid size-7 place-items-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <GithubIcon className="size-4" />
            </a>
          }
          tool={
            <>
              {slots.languageButton}
              {slots.searchButton ?? (
                <button
                  type="button"
                  aria-label="Search"
                  className="grid size-7 place-items-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  <Search className="size-3.5" />
                </button>
              )}
              <SidebarTrigger />
              {slots.themeSwitch ?? slots.fluxTools}
            </>
          }
        />

        {slots.footer && <div className="pb-24 sm:pb-28">{slots.footer}</div>}
        {slots.overlays}
      </Container>
    </SidebarProvider>
  );
};
