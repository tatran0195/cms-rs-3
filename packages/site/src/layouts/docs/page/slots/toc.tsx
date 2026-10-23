'use client';

import { cn } from '@cms/design-system/lib/utils';
import type { ComponentProps, ReactNode } from 'react';

export interface TOCProps extends ComponentProps<'aside'> {
  toc?: ReactNode;
  tocPopover?: ReactNode;
}

export function TOC({ toc, tocPopover, className, style, ...props }: TOCProps) {
  return (
    <>
      {/* Mobile & Tablet TOC Popover in [grid-area:toc-popover] */}
      {tocPopover && (
        <div className="[grid-area:toc-popover] sticky z-10 xl:hidden w-full" style={{ top: 'var(--fd-docs-row-2, var(--site-header-h, 3.5rem))' }}>
          {tocPopover}
        </div>
      )}

      {/* Desktop Sticky TOC in [grid-area:toc] */}
      {toc && (
        <aside
          id="nd-toc"
          data-theme-region="toc"
          {...props}
          style={{
            top: 'var(--fd-docs-row-2, var(--site-header-h, 3.5rem))',
            height: 'calc(var(--fd-docs-height, 100dvh) - var(--fd-docs-row-2, var(--site-header-h, 3.5rem)))',
            ...style,
          }}
          className={cn(
            'sticky flex flex-col [grid-area:toc] w-[var(--fd-toc-width,268px)] pt-6 xl:pt-10 pe-4 pb-6 max-xl:hidden self-start',
            className,
          )}
        >
          {toc}
        </aside>
      )}
    </>
  );
}
