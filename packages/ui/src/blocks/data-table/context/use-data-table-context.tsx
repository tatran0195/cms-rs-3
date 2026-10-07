import * as React from 'react';
import type { DataTableRowData } from '../types';
import { DataTableContext, type DataTableContextValue } from './data-table-context';

const useDataTableContext = <TData extends DataTableRowData = DataTableRowData>(): DataTableContextValue<TData> => {
  const context = React.useContext(DataTableContext);

  if (!context) {
    throw new Error('useDataTableContext must be used within a DataTableContextProvider');
  }

  return context as unknown as DataTableContextValue<TData>;
};

export { useDataTableContext };
