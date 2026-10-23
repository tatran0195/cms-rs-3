'use client';

import { cn } from '@cms/design-system/lib/utils';
import type { ComponentProps, CSSProperties } from 'react';
import { useSidebar } from '../../../context/sidebar-context';

export function Container({ className, style, children, ...props }: ComponentProps<'div'>) {
  const { collapsed } = useSidebar();

  return (
    <div
      id="nd-notebook-layout"
      data-sidebar-collapsed={collapsed ? 'true' : 'false'}
      data-documentation-layout="notebook"
      data-theme-region="content-shell"
      {...props}
      style={
        {
          gridTemplate: `"sidebar sidebar header header ." auto
"sidebar sidebar toc-popover toc-popover ." auto
"sidebar sidebar main toc ." 1fr
"sidebar sidebar footer footer ." auto / minmax(min-content, 1fr) var(--fd-sidebar-col) minmax(0, calc(var(--fd-layout-width,1600px) - var(--fd-sidebar-col) - var(--fd-toc-col))) var(--fd-toc-col) minmax(min-content, 1fr)`,
          '--fd-header-height': 'var(--site-header-h, 3.5rem)',
          '--fd-docs-row-1': 'var(--fd-banner-height, 0px)',
          '--fd-docs-row-2': 'calc(var(--fd-docs-row-1) + var(--fd-header-height, 3.5rem))',
          '--fd-docs-row-3': 'calc(var(--fd-docs-row-2) + var(--fd-toc-popover-height, 0px))',
          '--fd-sidebar-col': collapsed ? '0px' : 'var(--fd-sidebar-width)',
          ...style,
        } as CSSProperties
      }
      className={cn(
        'relative grid overflow-x-clip min-h-[var(--fd-docs-height,100dvh)] flex-1 min-w-0 w-full max-w-none [--fd-docs-height:100dvh] [--fd-header-height:3.5rem] [--fd-toc-popover-height:0px] max-xl:[--fd-toc-popover-height:2.5rem] [--fd-sidebar-width:0px] md:[--fd-sidebar-width:268px] [--fd-toc-col:0px] xl:[--fd-toc-col:268px] transition-[--fd-sidebar-col]',
        className,
      )}
    >
      {children}
    </div>
  );
}
