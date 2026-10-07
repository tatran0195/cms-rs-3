import { Funnel } from '@cms/icons';
import { useDataTableContext } from '@/blocks/data-table/context/use-data-table-context';
import { DropdownMenu } from '@/components/dropdown-menu';
import { IconButton } from '@/components/icon-button';
import { Skeleton } from '@/components/skeleton';
import { Tooltip } from '@/components/tooltip';

interface DataTableFilterMenuProps {
  /**
   * The tooltip to show when hovering over the filter menu.
   */
  tooltip?: string;
  /**
   * Callback when a filter is added
   */
  onAddFilter?: (id: string, value: unknown) => void;
}

/**
 * This component adds a filter menu to the data table, allowing users
 * to filter the table's data.
 */
const DataTableFilterMenu = ({ tooltip, onAddFilter }: DataTableFilterMenuProps) => {
  const { instance } = useDataTableContext();

  const enabledFilters = Object.keys(instance.getFiltering());

  const filterOptions = instance.getFilters().filter((filter) => !enabledFilters.includes(filter.id));

  if (!enabledFilters.length && !filterOptions.length) {
    throw new Error("DataTable.FilterMenu was rendered but there are no filters to apply. Make sure to pass filters to 'useDataTable'");
  }

  if (instance.showSkeleton) {
    return <DataTableFilterMenuSkeleton />;
  }

  const trigger = (
    <DropdownMenu.Trigger asChild disabled={filterOptions.length === 0}>
      <IconButton size="small">
        <Funnel />
      </IconButton>
    </DropdownMenu.Trigger>
  );

  return (
    <DropdownMenu>
      {tooltip ? (
        <Tooltip content={tooltip} hidden={filterOptions.length === 0}>
          {trigger}
        </Tooltip>
      ) : (
        trigger
      )}
      <DropdownMenu.Content side="bottom" align="start" className="overflow-y-auto">
        {filterOptions.map((filter) => {
          const getDefaultValue = () => {
            switch (filter.type) {
              case 'select':
              case 'multiselect':
                return [];
              case 'string':
                return '';
              case 'number':
                return null;
              case 'date':
                return null;
              case 'radio':
                return null;
              case 'custom':
                return null;
              default:
                return null;
            }
          };

          return (
            <DropdownMenu.Item
              key={filter.id}
              onClick={(e) => {
                // Prevent any bubbling that might interfere
                e.stopPropagation();
                if (onAddFilter) {
                  onAddFilter(filter.id, getDefaultValue());
                } else {
                  instance.addFilter({
                    id: filter.id,
                    value: getDefaultValue(),
                  });
                }
              }}
            >
              {filter.label}
            </DropdownMenu.Item>
          );
        })}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
};
DataTableFilterMenu.displayName = 'DataTable.FilterMenu';

const DataTableFilterMenuSkeleton = () => <Skeleton className="size-7" />;

export type { DataTableFilterMenuProps };
export { DataTableFilterMenu };
