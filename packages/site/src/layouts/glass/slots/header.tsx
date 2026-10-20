'use client';

import { cn } from '@cms/design-system/lib/utils';
import type { ComponentProps, ReactNode } from 'react';
import { SidebarToggle } from '../../../components/sidebar-toggle';
import { useSidebar } from '../../../context/sidebar-context';

export const pillButtonClasses = 'rounded-full bg-card/80 text-foreground border border-border/70 backdrop-blur-md shadow-xs';

export interface HeaderProps extends ComponentProps<'header'> {
  mobileHeader?: ReactNode;
  searchFull?: ReactNode;
  tools?: ReactNode;
  hasGranular?: boolean;
}

export function Header({ mobileHeader, searchFull, tools, hasGranular = false, className, ...props }: HeaderProps) {
  const { collapsed } = useSidebar();

  return (
    <>
      {/* Mobile Header (md:hidden) */}
      <div className={cn(hasGranular && 'md:hidden')}>{mobileHeader}</div>

      {/* Floating Pill Controls Header on Desktop matching Fumadocs Glass header.tsx */}
      {hasGranular && (
        <header
          className={cn(
            'sticky top-0 z-20 hidden h-14 items-center justify-between gap-2 bg-gradient-to-b from-background px-6 pt-3 pointer-events-none *:pointer-events-auto md:flex mx-auto w-full max-w-[var(--theme-content-max,100%)]',
            className,
          )}
          {...props}
        >
          <div>
            {collapsed && (
              <div className={cn(pillButtonClasses, 'p-1')}>
                <SidebarToggle />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {searchFull && <div className="max-w-md w-full">{searchFull}</div>}
            {tools && <div className={cn(pillButtonClasses, 'px-3 py-1')}>{tools}</div>}
          </div>
        </header>
      )}
    </>
  );
}
