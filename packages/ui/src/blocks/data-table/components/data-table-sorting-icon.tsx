'use client';

import { ArrowDownMini, ArrowUpMini } from '@cms/icons';
import type { DataTableSortDirection } from '@/blocks/data-table/types';
import { clx } from '@/utils/clx';

interface SortingIconProps {
  direction: DataTableSortDirection | false;
  /**
   * The direction the first click will apply (from `column.getFirstSortDir()`).
   * Used to show the correct arrow on hover before any sort is active, so the
   * hint matches what clicking will actually do. Defaults to "asc".
   */
  firstDirection?: DataTableSortDirection;
}

const DataTableSortingIcon = (props: SortingIconProps) => {
  const isSorted = props.direction === 'asc' || props.direction === 'desc';

  // When unsorted, preview the direction the first click would apply.
  const effectiveDirection = isSorted ? props.direction : (props.firstDirection ?? 'asc');

  const Icon = effectiveDirection === 'desc' ? ArrowDownMini : ArrowUpMini;

  return (
    <Icon
      className={clx('text-ui-fg-muted opacity-0 transition-opacity group-hover:opacity-100', {
        'text-ui-fg-subtle opacity-100': isSorted,
      })}
    />
  );
};
DataTableSortingIcon.displayName = 'DataTable.SortingIcon';

export type { SortingIconProps };
export { DataTableSortingIcon };
