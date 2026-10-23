'use client';

import { cn } from '@cms/design-system/lib/utils';
import type { ComponentProps, ReactNode } from 'react';
import { SidebarToggle } from '../../../components/sidebar-toggle';
import { useSidebar } from '../../../context/sidebar-context';

export interface HeaderProps extends ComponentProps<'header'> {
  mobileHeader?: ReactNode;
  brand?: ReactNode;
  navLinks?: ReactNode;
  searchFull?: ReactNode;
  searchButton?: ReactNode;
  tools?: ReactNode;
}

export function Header({ mobileHeader, brand, navLinks, searchFull, searchButton, tools, className, ...props }: HeaderProps) {
  const { collapsed } = useSidebar();

  return (
    <>
      {/* Mobile Header (md:hidden) in [grid-area:header] */}
      {mobileHeader && (
        <div id="nd-subnav" className="md:hidden [grid-area:header] sticky top-0 z-30">
          {mobileHeader}
        </div>
      )}

      {/* Desktop Header matching Fumadocs Notebook header.tsx */}
      <header
        className={cn(
          'sticky top-[var(--fd-docs-row-1,0px)] z-20 hidden md:flex items-center justify-between px-6 h-14 border-b border-border/50 bg-background/80 backdrop-blur-md [grid-area:header]',
          className,
        )}
        {...props}
      >
        <div className="flex items-center gap-3">
          {collapsed && (
            <div className="flex items-center gap-2">
              <SidebarToggle />
              {brand}
            </div>
          )}
          {searchFull ? <div className="w-60 min-w-0 max-w-sm">{searchFull}</div> : searchButton}
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground ms-auto">
          {navLinks}
          {tools && <div className="flex items-center gap-2">{tools}</div>}
        </div>
      </header>
    </>
  );
}
