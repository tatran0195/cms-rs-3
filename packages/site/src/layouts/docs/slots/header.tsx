'use client';

import { cn } from '@cms/design-system/lib/utils';
import type { ComponentProps, ReactNode } from 'react';
import { SidebarToggle } from '../../../components/sidebar-toggle';
import { useSidebar } from '../../../context/sidebar-context';

export interface HeaderProps extends ComponentProps<'header'> {
  mobileHeader?: ReactNode;
  navLinks?: ReactNode;
  tools?: ReactNode;
  hasGranular?: boolean;
}

export function Header({ mobileHeader, navLinks, tools, hasGranular = false, className, ...props }: HeaderProps) {
  const { collapsed } = useSidebar();

  if (!hasGranular) {
    return <div className="[grid-area:header]">{mobileHeader}</div>;
  }

  return (
    <>
      {/* Mobile Header (md:hidden) in [grid-area:header] */}
      <div id="nd-subnav" className="md:hidden [grid-area:header] sticky top-0 z-30">
        {mobileHeader}
      </div>

      {/* Desktop Header bar when sidebar collapsed or nav links provided */}
      <header
        className={cn(
          'hidden md:flex items-center justify-between px-8 h-14 border-b border-border/40 [grid-area:header] sticky top-0 z-20 bg-background/85 backdrop-blur-xs',
          !navLinks && !collapsed && 'hidden pointer-events-none',
          className,
        )}
        {...props}
      >
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {collapsed && <SidebarToggle />}
          {navLinks}
        </div>
        <div className="flex items-center gap-2">{collapsed && tools}</div>
      </header>
    </>
  );
}
