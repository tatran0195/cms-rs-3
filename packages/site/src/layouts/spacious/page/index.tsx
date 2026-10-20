import { cn } from '@cms/design-system/lib/utils';
import { PencilLine } from 'lucide-react';
import { type ComponentProps, type ReactNode, useEffect, useState } from 'react';
import { Breadcrumb } from './slots/breadcrumb';
import { Container } from './slots/container';
import { Footer } from './slots/footer';
import { TOC } from './slots/toc';

export interface SpaciousPageProps extends ComponentProps<'article'> {
  article?: ReactNode;
  children?: ReactNode;
  tableOfContents?: ReactNode;
  breadcrumb?: ReactNode;
  footer?: ReactNode;
  tocPopover?: ReactNode;
  full?: boolean;
}

export function SpaciousPage({ article, children, tableOfContents, breadcrumb, footer, tocPopover, full, className, ...props }: SpaciousPageProps) {
  return (
    <div
      className="flex flex-1 items-start gap-8 w-full min-w-0 justify-center"
      data-documentation-layout="spacious-page"
      data-theme-region="page-shell"
    >
      <div className={cn('flex flex-col flex-1 min-w-0', full ? 'w-full max-w-none' : 'max-w-[var(--fd-page-width,1200px)]')}>
        <TOC tocPopover={tocPopover} />
        <Container full={full} className={className} {...props}>
          {breadcrumb && <Breadcrumb>{breadcrumb}</Breadcrumb>}
          {article ?? children}
          {footer && <Footer>{footer}</Footer>}
        </Container>
      </div>
      <TOC toc={tableOfContents} />
    </div>
  );
}

export const DocsPage = SpaciousPage;

/**
 * Add typography styles
 */
export function DocsBody({ children, className, ...props }: ComponentProps<'div'>) {
  return (
    <div {...props} className={cn('prose flex-1 min-w-0 w-full', className)}>
      {children}
    </div>
  );
}

export function DocsDescription({ children, className, ...props }: ComponentProps<'p'>) {
  if (children === undefined || children === null) return null;

  return (
    <p {...props} className={cn('mb-8 text-lg text-muted-foreground text-fd-muted-foreground', className)}>
      {children}
    </p>
  );
}

export function DocsTitle({ children, className, ...props }: ComponentProps<'h1'>) {
  return (
    <h1 {...props} className={cn('text-[1.75em] font-semibold tracking-tight md:text-4xl', className)}>
      {children}
    </h1>
  );
}

export function PageLastUpdate({ date: value, ...props }: Omit<ComponentProps<'p'>, 'children'> & { date: Date | string | number }) {
  const [date, setDate] = useState('');

  useEffect(() => {
    setDate(new Date(value).toLocaleDateString());
  }, [value]);

  return (
    <p {...props} className={cn('text-sm text-muted-foreground text-fd-muted-foreground', props.className)}>
      Last updated on {date}
    </p>
  );
}

export function EditOnGitHub(props: ComponentProps<'a'>) {
  return (
    <a
      target="_blank"
      rel="noreferrer noopener"
      {...props}
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground not-prose',
        props.className,
      )}
    >
      {props.children ?? (
        <>
          <PencilLine className="size-3.5" />
          Edit on GitHub
        </>
      )}
    </a>
  );
}

export * from './slots/breadcrumb';
export { Breadcrumb as PageBreadcrumb } from './slots/breadcrumb';
export * from './slots/container';
export * from './slots/footer';
export { Footer as PageFooter } from './slots/footer';
export * from './slots/toc';
