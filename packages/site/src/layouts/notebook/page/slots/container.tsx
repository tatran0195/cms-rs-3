'use client';

import { cn } from '@cms/design-system/lib/utils';
import type { ComponentProps } from 'react';

export function Container({ className, children, full, ...props }: ComponentProps<'article'> & { full?: boolean }) {
  return (
    <main className="grid [grid-area:main] p-4 sm:p-6 lg:p-8" data-layout-main="">
      <article
        id="nd-page"
        data-layout-content=""
        data-theme-region="article"
        data-full={full}
        {...props}
        className={cn(
          'flex flex-col min-w-0 px-6 py-6 gap-4 md:px-8 md:pt-8 xl:px-10 xl:pt-10 notebook-paper bg-background rounded-2xl border border-border/80 shadow-xs',
          full ? '*:max-w-none' : '*:max-w-[var(--fd-page-width,900px)]',
          className,
        )}
      >
        {children}
      </article>
    </main>
  );
}
