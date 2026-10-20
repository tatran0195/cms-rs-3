'use client';

import { cn } from '@cms/design-system/lib/utils';
import type { ComponentProps, ReactNode } from 'react';

export interface TOCProps extends ComponentProps<'aside'> {
  toc?: ReactNode;
  tocPopover?: ReactNode;
}

export function TOC({ toc, tocPopover, className, ...props }: TOCProps) {
  return (
    <>
      {/* Mobile & Tablet TOC Popover in [grid-area:toc-popover] */}
      {tocPopover && <div className="[grid-area:toc-popover] sticky top-[var(--fd-docs-row-2,0px)] z-10 xl:hidden w-full">{tocPopover}</div>}

      {/* Desktop Sticky TOC in [grid-area:toc] */}
      {toc && (
        <aside
          id="nd-toc"
          data-theme-region="toc"
          {...props}
          className={cn(
            'sticky top-[var(--fd-docs-row-1,0px)] h-[calc(var(--fd-docs-height,100dvh)-var(--fd-docs-row-1,0px))] flex flex-col [grid-area:toc] w-[var(--fd-toc-width,268px)] pt-12 pe-4 pb-2 max-xl:hidden self-start',
            className,
          )}
        >
          {toc}
        </aside>
      )}
    </>
  );
}
