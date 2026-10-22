import { Skeleton } from '@cms/design-system/components/ui/skeleton';
import { cn } from '@cms/design-system/lib/utils';

const INDENT = 16;

const DEFAULT_ROW_PATTERNS = [
  { depth: 0, width: 'w-2/5' },
  { depth: 1, width: 'w-3/5' },
  { depth: 1, width: 'w-1/2' },
  { depth: 2, width: 'w-3/4' },
  { depth: 0, width: 'w-1/3' },
  { depth: 1, width: 'w-3/5' },
  { depth: 1, width: 'w-2/5' },
  { depth: 0, width: 'w-1/2' },
];

export interface PageTreeSkeletonProps {
  count?: number;
  className?: string;
}

export function PageTreeSkeleton({ count = 8, className }: PageTreeSkeletonProps) {
  const items = Array.from({ length: count }, (_, i) => DEFAULT_ROW_PATTERNS[i % DEFAULT_ROW_PATTERNS.length]!);

  return (
    <div
      className={cn('flex flex-col gap-0.5 px-1 py-1 w-full overflow-hidden', className)}
      data-testid="page-tree-skeleton"
      role="status"
      aria-label="Loading pages..."
    >
      {items.map((item, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: Static skeleton placeholder sequence
          key={index}
          data-testid="page-tree-skeleton-row"
          className="flex h-8 items-center gap-1.5 rounded-md px-1.5"
          style={{ marginInlineStart: item.depth * INDENT }}
        >
          {/* Spacer / chevron placeholder */}
          <div className="size-4 shrink-0" />

          {/* Icon placeholder */}
          <Skeleton className="size-3.5 shrink-0 rounded-xs" />

          {/* Title label placeholder */}
          <Skeleton className={cn('h-3.5 rounded-xs', item.width)} />
        </div>
      ))}
    </div>
  );
}
