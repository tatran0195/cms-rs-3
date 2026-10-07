'use client';

import { EllipsisHorizontal } from '@cms/icons';
import type { CellContext } from '@tanstack/react-table';
import * as React from 'react';
import type { DataTableActionColumnDefMeta } from '@/blocks/data-table/types';
import { DropdownMenu } from '@/components/dropdown-menu';
import { IconButton } from '@/components/icon-button';

interface DataTableActionCellProps<TData> {
  ctx: CellContext<TData, unknown>;
}

const DataTableActionCell = <TData,>({ ctx }: DataTableActionCellProps<TData>) => {
  const meta = ctx.column.columnDef.meta as DataTableActionColumnDefMeta<TData> | undefined;
  const actions = meta?.___actions;

  if (!actions) {
    return null;
  }

  const resolvedActions = typeof actions === 'function' ? actions(ctx) : actions;

  if (!Array.isArray(resolvedActions)) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger asChild className="ml-1">
        <IconButton size="small" variant="transparent">
          <EllipsisHorizontal />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content side="bottom">
        {resolvedActions.map((actionOrGroup, idx) => {
          const isArray = Array.isArray(actionOrGroup);
          const isLast = idx === resolvedActions.length - 1;
          const groupKey = isArray ? actionOrGroup.map((a) => a.label).join('-') : actionOrGroup.label;

          return isArray ? (
            <React.Fragment key={groupKey}>
              {actionOrGroup.map((action) => (
                <DropdownMenu.Item
                  key={action.label}
                  onClick={(e) => {
                    e.stopPropagation();
                    action.onClick(ctx);
                  }}
                  className="[&>svg]:text-ui-fg-subtle flex items-center gap-2"
                >
                  {action.icon}
                  {action.label}
                </DropdownMenu.Item>
              ))}
              {!isLast && <DropdownMenu.Separator />}
            </React.Fragment>
          ) : (
            <DropdownMenu.Item
              key={actionOrGroup.label}
              onClick={(e) => {
                e.stopPropagation();
                actionOrGroup.onClick(ctx);
              }}
              className="[&>svg]:text-ui-fg-subtle flex items-center gap-2"
            >
              {actionOrGroup.icon}
              {actionOrGroup.label}
            </DropdownMenu.Item>
          );
        })}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
};
DataTableActionCell.displayName = 'DataTable.ActionCell';

export type { DataTableActionCellProps };
export { DataTableActionCell };
