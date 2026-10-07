import type { DeepKeys } from '@tanstack/react-table';
import type { DataTableFilter, DataTableFilterProps } from '../types';

const createDataTableFilterHelper = <TData>() => ({
  accessor: (accessor: DeepKeys<TData>, props: DataTableFilterProps) => ({
    id: accessor,
    ...props,
  }),
  custom: <T extends DataTableFilterProps>(props: DataTableFilter<T>) => props,
});

export { createDataTableFilterHelper };
