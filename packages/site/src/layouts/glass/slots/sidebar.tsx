'use client';

import { ScrollArea } from '@cms/design-system/components/ui/scroll-area';
import { cn } from '@cms/design-system/lib/utils';
import type { ComponentProps, ReactNode } from 'react';
import { SidebarToggle } from '../../../components/sidebar-toggle';
import { useSidebar } from '../../../context/sidebar-context';

export interface SidebarProps extends ComponentProps<'aside'> {
  brand?: ReactNode;
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
        'glass-sidebar sticky top-4 hidden h-[calc(100dvh-2rem)] shrink-0 flex-col rounded-2xl border border-border/70 bg-card/65 shadow-sm backdrop-blur-md md:flex transition-all duration-200',
        collapsed ? 'w-0 p-0 m-0 border-none overflow-hidden opacity-0 pointer-events-none' : 'w-[var(--fd-sidebar-width,268px)] p-3.5',
        className,
      )}
    >
      {hasGranular ? (
        <>
          <div className="flex items-center justify-between px-2 pt-1 pb-3 border-b border-border/50">
            {brand}
            {collapsible && <SidebarToggle />}
          </div>
          {navTabs && <div className="px-1 py-2 border-b border-border/40">{navTabs}</div>}
          <ScrollArea className="flex-1 py-2">
            <div className="pe-2" data-theme-region="sidebar-content">
              {navAnchors}
              {sidebarTree ?? navigation}
            </div>
          </ScrollArea>
          {(sidebarTools || tools) && (
            <div className="mt-auto border-t border-border/40 pt-2">
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
          <div className="pe-2" data-theme-region="sidebar-content">
            {navigation}
          </div>
        </ScrollArea>
      )}
    </aside>
  );
}
