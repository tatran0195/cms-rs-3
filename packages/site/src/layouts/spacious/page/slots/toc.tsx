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
      {/* Mobile TOC Popover when below desktop */}
      {tocPopover && <div className="md:hidden mb-4 w-full">{tocPopover}</div>}

      {/* Desktop Sticky TOC */}
      {toc && (
        <aside
          id="nd-toc"
          data-theme-region="toc"
          {...props}
          style={{
            width: 'var(--fd-toc-width, 268px)',
            ...props.style,
          }}
          className={cn('sticky top-4 hidden xl:block w-[var(--fd-toc-width,268px)] shrink-0 self-start pt-4', className)}
        >
          {toc}
        </aside>
      )}
    </>
  );
}
