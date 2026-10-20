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
        'sticky top-0 hidden h-full shrink-0 flex-col border-e-0 bg-transparent md:flex [grid-area:sidebar] transition-all duration-200',
        collapsed ? 'w-0 p-0 overflow-hidden opacity-0 pointer-events-none' : 'w-[var(--fd-sidebar-width,268px)] p-4',
        className,
      )}
    >
      {hasGranular ? (
        <>
          <div className="flex items-center justify-between pb-3">
            {brand}
            {collapsible && <SidebarToggle />}
          </div>
          {searchFull && <div className="pt-2 pb-1">{searchFull}</div>}
          {navTabs && <div className="py-2">{navTabs}</div>}
          <ScrollArea className="flex-1 py-2">
            <div data-theme-region="sidebar-content">
              {navAnchors}
              {sidebarTree ?? navigation}
            </div>
          </ScrollArea>
          {(sidebarTools || tools) && (
            <div className="mt-auto border-t border-border/40 pt-3">
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
          <div data-theme-region="sidebar-content">{navigation}</div>
        </ScrollArea>
      )}
    </aside>
  );
}
