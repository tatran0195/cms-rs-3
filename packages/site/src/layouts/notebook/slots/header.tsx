'use client';

import { cn } from '@cms/design-system/lib/utils';
import type { ComponentProps, ReactNode } from 'react';
import { SidebarToggle } from '../../../components/sidebar-toggle';
import { useSidebar } from '../../../context/sidebar-context';

export interface HeaderProps extends ComponentProps<'header'> {
  navLinks?: ReactNode;
  searchButton?: ReactNode;
  tools?: ReactNode;
}

export function Header({ navLinks, searchButton, tools, className, ...props }: HeaderProps) {
  const { collapsed } = useSidebar();

  return (
    <header
      className={cn(
        'sticky top-[var(--fd-docs-row-1,0px)] z-30 flex items-center justify-between px-6 h-14 border-b border-border/50 bg-background/80 backdrop-blur-md [grid-area:header]',
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        {collapsed && <SidebarToggle />}
        {navLinks}
      </div>
      <div className="flex items-center gap-2">
        {searchButton}
        {collapsed && tools}
      </div>
    </header>
  );
}
