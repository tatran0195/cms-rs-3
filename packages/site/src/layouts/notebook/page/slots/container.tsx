'use client';

import { cn } from '@cms/design-system/lib/utils';
import type { ComponentProps } from 'react';

export function Container({ className, children, full, ...props }: ComponentProps<'article'> & { full?: boolean }) {
  return (
    <main className="grid [grid-area:main]" data-layout-main="">
      <article
        id="nd-page"
        data-layout-content=""
        data-theme-region="article"
        data-full={full}
        {...props}
        className={cn(
          'flex flex-col min-w-0 px-4 py-6 gap-4 md:px-6 md:pt-8 xl:px-8 xl:pt-14 *:max-w-[900px]',
          full && '*:max-w-[1285px]',
          className,
        )}
      >
        {children}
      </article>
    </main>
  );
}
