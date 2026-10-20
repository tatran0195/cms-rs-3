import { cn } from '@cms/design-system/lib/utils';
import { PencilLine } from 'lucide-react';
import { type ComponentProps, type ReactNode, useEffect, useState } from 'react';
import type { TOCItemType } from '../../../components/toc';
import { Breadcrumb } from '../../docs/page/slots/breadcrumb';
import { Footer } from '../../docs/page/slots/footer';
import { Container } from './slots/container';
import type { TOCProps } from './slots/toc';

export interface FluxPageProps extends ComponentProps<'article'> {
  article?: ReactNode;
  children?: ReactNode;
  toc?: TOCItemType[];
  tocProps?: TOCProps;
  tableOfContents?: ReactNode;
  breadcrumb?: ReactNode;
  footer?: ReactNode;
  tocPopover?: ReactNode;
  full?: boolean;
}

export function FluxPage({
  article,
  children,
  toc = [],
  tocProps,
  tableOfContents,
  breadcrumb,
  footer,
  tocPopover,
  full,
  className,
  ...props
}: FluxPageProps) {
  return (
    <div data-documentation-layout="flux-page" className="flex flex-col items-center w-full min-h-screen relative">
      {tocPopover}
      {tableOfContents}
      <Container full={full} className={className} {...props}>
        {breadcrumb && <Breadcrumb>{breadcrumb}</Breadcrumb>}
        {article ?? children}
        {footer && <Footer>{footer}</Footer>}
      </Container>
    </div>
  );
}

export const DocsPage = FluxPage;

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

export { Breadcrumb as PageBreadcrumb } from '../../docs/page/slots/breadcrumb';
export { Footer as PageFooter } from '../../docs/page/slots/footer';
export * from './slots/container';
export * from './slots/toc';
