import { createContext } from 'react';
import type { DataTableRowData } from '../types';
import type { UseDataTableReturn } from '../use-data-table';

export interface DataTableContextValue<TData extends DataTableRowData = DataTableRowData> {
  instance: UseDataTableReturn<TData>;
  enableColumnVisibility: boolean;
  enableColumnOrder: boolean;
}

export const DataTableContext = createContext<DataTableContextValue<DataTableRowData> | null>(null);
