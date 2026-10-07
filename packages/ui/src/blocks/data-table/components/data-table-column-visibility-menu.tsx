import { Adjustments } from '@cms/icons';
import type { Column } from '@tanstack/react-table';
import { Checkbox } from '@/components/checkbox';
import { DropdownMenu } from '@/components/dropdown-menu';
import { IconButton } from '@/components/icon-button';
import { Tooltip } from '@/components/tooltip';
import { useDataTableContext } from '../context/use-data-table-context';

interface DataTableColumnVisibilityMenuProps {
  className?: string;
  tooltip?: string;
}

const DataTableColumnVisibilityMenu = ({ className, tooltip }: DataTableColumnVisibilityMenuProps) => {
  const { instance, enableColumnVisibility } = useDataTableContext();

  if (!enableColumnVisibility) {
    return null;
  }

  const columns = instance.getAllColumns().filter((column) => column.getCanHide());

  const handleToggleColumn = (column: Column<unknown, unknown>) => {
    column.toggleVisibility();
  };

  const handleToggleAll = (value: boolean) => {
    instance.setColumnVisibility(Object.fromEntries(columns.map((column: Column<unknown, unknown>) => [column.id, value])));
  };

  const allColumnsVisible = columns.every((column: Column<unknown, unknown>) => column.getIsVisible());
  const someColumnsVisible = columns.some((column: Column<unknown, unknown>) => column.getIsVisible());

  const trigger = (
    <DropdownMenu.Trigger asChild>
      <IconButton size="small" className={className}>
        <Adjustments />
      </IconButton>
    </DropdownMenu.Trigger>
  );

  return (
    <DropdownMenu>
      {tooltip ? <Tooltip content={tooltip}>{trigger}</Tooltip> : trigger}
      <DropdownMenu.Content align="end" className="min-w-[200px] max-h-[400px] overflow-hidden">
        <DropdownMenu.Label>Toggle columns</DropdownMenu.Label>
        <DropdownMenu.Separator />
        <DropdownMenu.Item
          onSelect={(e: Event) => {
            e.preventDefault();
            handleToggleAll(!allColumnsVisible);
          }}
        >
          <div className="flex items-center gap-x-2">
            <Checkbox checked={allColumnsVisible ? true : someColumnsVisible && !allColumnsVisible ? 'indeterminate' : false} />
            <span>Toggle all</span>
          </div>
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        <div className="max-h-[250px] overflow-y-auto">
          {columns.map((column: Column<unknown, unknown>) => {
            const meta = column.columnDef.meta as { name?: string } | undefined;

            return (
              <DropdownMenu.Item
                key={column.id}
                onSelect={(e: Event) => {
                  e.preventDefault();
                  handleToggleColumn(column);
                }}
              >
                <div className="flex items-center gap-x-2">
                  <Checkbox checked={column.getIsVisible()} />
                  <span className="truncate">{meta?.name || column.id}</span>
                </div>
              </DropdownMenu.Item>
            );
          })}
        </div>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
};

export type { DataTableColumnVisibilityMenuProps };
export { DataTableColumnVisibilityMenu };
