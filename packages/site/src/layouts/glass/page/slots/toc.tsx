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
      {tocPopover && <div className="md:hidden mb-4 w-full">{tocPopover}</div>}
      {toc && (
        <aside
          data-theme-region="toc"
          {...props}
          className={cn('sticky top-20 hidden xl:block w-[var(--fd-toc-width,268px)] shrink-0 self-start', className)}
        >
          {toc}
        </aside>
      )}
    </>
  );
}
