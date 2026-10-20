'use client';

import { cn } from '@cms/design-system/lib/utils';
import type { ComponentProps } from 'react';

export function Container({ className, children, full, ...props }: ComponentProps<'article'> & { full?: boolean }) {
  return (
    <article
      id="nd-page"
      data-layout-content=""
      data-theme-region="article"
      data-full={full}
      {...props}
      className={cn('flex flex-col gap-4 w-full min-w-0 pb-12', full && 'max-w-none', className)}
    >
      {children}
    </article>
  );
}
