import { cn } from '@cms/design-system/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ComponentProps } from 'react';

export interface PageFooterItem {
  title: string;
  href: string;
  description?: string;
}

export interface SitePageFooterProps extends ComponentProps<'div'> {
  previous?: PageFooterItem | null;
  next?: PageFooterItem | null;
}

/**
 * Authentic Fumadocs 2-column card pagination footer
 * Modeled directly after Fumadocs `Footer` (`packages/radix-ui/src/layouts/docs/page/slots/footer.tsx`):
 * - Grid container spanning 2 columns on `@container` / `sm`
 * - Left card: Previous page link with ChevronLeft, page title, and secondary hint
 * - Right card: Next page link with ChevronRight, page title, and secondary hint aligned to end
 * - Subtle hover accent transitions matching active theme tokens
 */
export function SitePageFooter({ previous, next, className, ...props }: SitePageFooterProps) {
  if (!previous && !next) return null;

  return (
    <div
      data-site-page-footer=""
      className={cn('grid gap-4 mt-12 pt-6 border-t border-border/70', previous && next ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1', className)}
      {...props}
    >
      {previous ? (
        <a
          href={previous.href}
          data-page-footer="previous"
          className="flex flex-col gap-1.5 rounded-xl border border-border/70 p-4 text-sm transition-colors hover:bg-muted/50 hover:border-primary/40 group text-start"
        >
          <div className="inline-flex items-center gap-1.5 font-medium text-foreground group-hover:text-primary transition-colors">
            <ChevronLeft className="-ms-1 size-4 shrink-0 transition-transform group-hover:-translate-x-0.5 rtl:rotate-180" />
            <p className="truncate">{previous.title}</p>
          </div>
          <p className="text-xs text-muted-foreground truncate">{previous.description || 'Previous Page'}</p>
        </a>
      ) : (
        <div className="hidden sm:block" />
      )}

      {next ? (
        <a
          href={next.href}
          data-page-footer="next"
          className={cn(
            'flex flex-col gap-1.5 rounded-xl border border-border/70 p-4 text-sm transition-colors hover:bg-muted/50 hover:border-primary/40 group',
            previous ? 'text-end items-end' : 'text-end items-end sm:col-start-2',
          )}
        >
          <div className="inline-flex items-center gap-1.5 font-medium text-foreground group-hover:text-primary transition-colors flex-row-reverse">
            <ChevronRight className="-me-1 size-4 shrink-0 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
            <p className="truncate">{next.title}</p>
          </div>
          <p className="text-xs text-muted-foreground truncate">{next.description || 'Next Page'}</p>
        </a>
      ) : null}
    </div>
  );
}
