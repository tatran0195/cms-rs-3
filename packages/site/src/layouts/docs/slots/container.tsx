'use client';

import { cn } from '@cms/design-system/lib/utils';
import type { ComponentProps, CSSProperties } from 'react';
import { useSidebar } from '../../../context/sidebar-context';

export function Container({ className, style, children, ...props }: ComponentProps<'div'>) {
  const { collapsed } = useSidebar();

  return (
    <div
      id="nd-docs-layout"
      data-sidebar-collapsed={collapsed ? 'true' : 'false'}
      data-documentation-layout="docs"
      data-theme-region="content-shell"
      {...props}
      style={
        {
          gridTemplate: `"sidebar header header" auto
"sidebar toc-popover toc-popover" auto
"sidebar tabs tabs" auto
"sidebar main toc" 1fr
"sidebar footer footer" auto / var(--fd-sidebar-col) minmax(0, 1fr) var(--fd-toc-col)`,
          '--fd-header-height': 'var(--site-header-h, 3.5rem)',
          '--fd-docs-row-1': 'var(--fd-banner-height, 0px)',
          '--fd-docs-row-2': 'calc(var(--fd-banner-height, 0px) + var(--fd-header-height, 3.5rem))',
          '--fd-docs-row-3': 'calc(var(--fd-docs-row-2) + var(--fd-toc-popover-height, 0px))',
          '--fd-sidebar-col': collapsed ? '0px' : 'var(--fd-sidebar-width, 288px)',
          '--fd-toc-col': 'var(--fd-toc-width, 268px)',
          ...style,
        } as CSSProperties
      }
      className={cn(
        'relative grid overflow-x-clip min-h-[var(--fd-docs-height,100dvh)] flex-1 min-w-0 w-full max-w-none [--fd-docs-height:100dvh] [--fd-toc-popover-height:0px] max-xl:[--fd-toc-popover-height:2.5rem] [--fd-sidebar-width:0px] md:[--fd-sidebar-width:288px] [--fd-toc-width:0px] xl:[--fd-toc-width:268px] transition-[--fd-sidebar-col]',
        className,
      )}
    >
      {children}
    </div>
  );
}
