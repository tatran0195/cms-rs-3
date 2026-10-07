'use client';

import type * as React from 'react';
import type { DataTableRowData } from '../types';
import type { UseDataTableReturn } from '../use-data-table';
import { DataTableContext, type DataTableContextValue } from './data-table-context';

type DataTableContextProviderProps<TData extends DataTableRowData> = {
  instance: UseDataTableReturn<TData>;
  children: React.ReactNode;
};

const DataTableContextProvider = <TData extends DataTableRowData>({ instance, children }: DataTableContextProviderProps<TData>) => (
  <DataTableContext.Provider
    value={
      {
        instance,
        enableColumnVisibility: instance.enableColumnVisibility,
        enableColumnOrder: instance.enableColumnOrder,
      } as unknown as DataTableContextValue<DataTableRowData>
    }
  >
    {children}
  </DataTableContext.Provider>
);

export { DataTableContextProvider };
