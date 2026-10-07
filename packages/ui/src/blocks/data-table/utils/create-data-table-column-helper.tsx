'use client';

import { createColumnHelper as createColumnHelperTanstack } from '@tanstack/react-table';
import { DataTableActionCell } from '../components/data-table-action-cell';
import { DataTableSelectCell, DataTableSelectHeader } from '../components/data-table-select-cell';
import type {
  DataTableActionColumnDef,
  DataTableAlignableColumnDef,
  DataTableAlignableColumnDefMeta,
  DataTableColumnHelper,
  DataTableSelectColumnDef,
  DataTableSortableColumnDef,
  DataTableSortableColumnDefMeta,
  DataTableTruncatableColumnDef,
  DataTableTruncatableColumnDefMeta,
} from '../types';

const createDataTableColumnHelper = <TData,>(): DataTableColumnHelper<TData> => {
  const { accessor: accessorTanstack, display } = createColumnHelperTanstack<TData>();

  return {
    accessor: (accessor, column) => {
      const rawColumn = column as unknown as Record<string, unknown> &
        DataTableSortableColumnDef &
        DataTableAlignableColumnDef &
        DataTableTruncatableColumnDef;
      const { sortLabel, sortAscLabel, sortDescLabel, headerAlign, align, truncateTooltip, meta, enableSorting, ...rest } = rawColumn;

      const extendedMeta: DataTableSortableColumnDefMeta & DataTableAlignableColumnDefMeta & DataTableTruncatableColumnDefMeta = {
        ___sortMetaData: { sortLabel, sortAscLabel, sortDescLabel },
        ___alignMetaData: { headerAlign, align },
        ___truncateTooltip: truncateTooltip,
        ...((meta as Record<string, unknown> | undefined) || {}),
      };

      return (accessorTanstack as unknown as (acc: unknown, col: unknown) => unknown)(accessor, {
        ...rest,
        enableSorting: enableSorting ?? false,
        meta: extendedMeta,
      }) as never;
    },
    display,
    action: ({ actions, ...props }: DataTableActionColumnDef<TData>) =>
      display({
        id: 'action',
        cell: (ctx) => <DataTableActionCell ctx={ctx} />,
        meta: {
          ___actions: actions,
          ...(props.meta || {}),
        },
        ...props,
      }),
    select: (props?: DataTableSelectColumnDef<TData>) =>
      display({
        id: 'select',
        header: props?.header ? props.header : (ctx) => <DataTableSelectHeader ctx={ctx} />,
        cell: props?.cell ? props.cell : (ctx) => <DataTableSelectCell ctx={ctx} />,
      }),
  };
};

const helper = createColumnHelperTanstack();

helper.accessor('name', {
  meta: {},
});

export { createDataTableColumnHelper };
