'use client';

import { ScrollArea } from '@cms/design-system/components/ui/scroll-area';
import { cn } from '@cms/design-system/lib/utils';
import type { ComponentProps, ReactNode } from 'react';
import { SidebarToggle } from '../../../components/sidebar-toggle';
import { useSidebar } from '../../../context/sidebar-context';

export interface SidebarProps extends ComponentProps<'aside'> {
  brand?: ReactNode;
  searchFull?: ReactNode;
  navTabs?: ReactNode;
  navAnchors?: ReactNode;
  navigation?: ReactNode;
  sidebarTree?: ReactNode;
  sidebarTools?: ReactNode;
  tools?: ReactNode;
  hasGranular?: boolean;
}

export function Sidebar({
  brand,
  searchFull,
  navTabs,
  navAnchors,
  navigation,
  sidebarTree,
  sidebarTools,
  tools,
  hasGranular = false,
  className,
  ...props
}: SidebarProps) {
  const { collapsed, collapsible } = useSidebar();

  return (
    <aside
      id="nd-sidebar"
      data-collapsed={collapsed ? 'true' : 'false'}
      data-theme-region="sidebar"
      {...props}
      className={cn(
        'sticky top-[var(--fd-docs-row-1,0px)] z-20 hidden h-[calc(var(--fd-docs-height,100dvh)-var(--fd-docs-row-1,0px))] shrink-0 flex-col border-border/60 border-e bg-card/60 backdrop-blur-xs md:flex [grid-area:sidebar] transition-all duration-200',
        collapsed ? 'w-0 overflow-hidden border-none opacity-0 pointer-events-none' : 'w-full items-end *:w-[var(--fd-sidebar-width,268px)]',
        className,
      )}
    >
      {hasGranular ? (
        <>
          <div className="flex h-14 items-center justify-between px-4 border-b border-border/50">
            {brand}
            {collapsible && <SidebarToggle />}
          </div>
          {searchFull && <div className="px-3 pt-3 pb-1">{searchFull}</div>}
          {navTabs && <div className="px-3 py-1 border-b border-border/40">{navTabs}</div>}
          <ScrollArea className="flex-1 px-3 py-3">
            <div className="pb-12" data-theme-region="sidebar-content">
              {navAnchors}
              {sidebarTree ?? navigation}
            </div>
          </ScrollArea>
          {(sidebarTools || tools) && (
            <div className="mt-auto border-t border-border/50 p-3">
              {sidebarTools ?? (
                <div className="flex items-center justify-between border border-border/60 bg-muted/40 p-1 rounded-xl text-muted-foreground text-sm empty:hidden">
                  {tools}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <ScrollArea className="h-full">
          <div className="pt-6 pb-16 pe-4" data-theme-region="sidebar-content">
            {navigation}
          </div>
        </ScrollArea>
      )}
    </aside>
  );
}
