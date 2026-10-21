'use client';

import { cn } from '@cms/design-system/lib/utils';
import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import { useSidebar } from '../../../context/sidebar-context';

export interface ContainerProps extends Omit<ComponentProps<'div'>, 'content'> {
  banner?: ReactNode;
  header?: ReactNode;
  sidebar?: ReactNode;
  content?: ReactNode;
  footer?: ReactNode;
  overlays?: ReactNode;
  navLinks?: ReactNode;
  searchButton?: ReactNode;
  tools?: ReactNode;
}

export function Container({
  banner,
  header,
  sidebar,
  content,
  footer,
  overlays,
  navLinks,
  searchButton,
  tools,
  className,
  style,
  ...props
}: ContainerProps) {
  const { collapsed } = useSidebar();

  return (
    <div
      id="fd-spacious-layout"
      data-sidebar-collapsed={collapsed ? 'true' : 'false'}
      data-documentation-layout="spacious"
      {...props}
      style={
        {
          gridTemplate: `"sidebar header right" auto
"sidebar toc-popover right" var(--fd-toc-popover-height, 0px)
"sidebar main right" 1fr / var(--fd-sidebar-col) minmax(0, 1fr) auto`,
          '--fd-sidebar-col': collapsed ? '0px' : 'var(--fd-sidebar-width)',
          ...style,
        } as CSSProperties
      }
      className={cn(
        'relative grid min-h-screen bg-card/40 dark:bg-card/20 md:h-screen md:min-h-0 md:overflow-clip [--fd-header-height:3.5rem] [--fd-sidebar-width:0px] md:[--fd-sidebar-width:268px] [--fd-sidebar-col:var(--fd-sidebar-width)] [--fd-toc-width:0px] xl:[--fd-toc-width:var(--fd-toc-col,268px)] transition-[grid-template-columns] duration-300 print:h-auto print:overflow-visible',
        className,
      )}
    >
      {banner}
      {header}
      {sidebar}

      {/* Elevated Crisp Inset Card Panel (#nd-page-panel) with internal scrolling on desktop */}
      <div
        id="nd-page-panel"
        className="relative flex flex-col min-w-0 min-h-0 [grid-area:main] mx-2 my-2 bg-background md:ms-0 md:rounded-2xl md:border md:border-border/80 md:shadow-xs md:overflow-clip print:overflow-visible"
        data-theme-region="spacious-panel"
      >
        {/* Top Panel Header fade bar matching Fumadocs Spacious */}
        <header className="absolute inset-x-0 top-0 z-10 hidden md:flex items-center justify-between h-14 ps-6 pe-4 bg-gradient-to-b from-background to-transparent pointer-events-none *:pointer-events-auto">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {navLinks ? navLinks : <span className="font-medium text-foreground/90">Documentation</span>}
          </div>
          <div className="flex items-center gap-2">
            {searchButton}
            {collapsed && tools}
          </div>
        </header>

        {/* Internal Scroll Container for Desktop Viewport */}
        <div
          data-spacious-scroll-container="true"
          className="flex flex-1 flex-col items-start px-4 md:min-h-0 pt-6 md:pt-14 md:px-[max(1.5rem,calc((100%-var(--fd-page-width,900px)-var(--fd-toc-width,268px))/2))] md:overflow-y-auto md:overscroll-y-contain md:scrollbar-thin"
        >
          <div className="min-w-0 flex-1 w-full">{content}</div>
          {footer && <div className="w-full mt-auto pt-8">{footer}</div>}
        </div>
      </div>

      {overlays}
    </div>
  );
}
