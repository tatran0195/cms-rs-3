'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { Checkbox, type CheckboxCheckedState } from './checkbox';
import { cn } from '../../lib/utils';

export type PermissionAction = 'create' | 'read' | 'edit' | 'delete' | 'publish';

export interface PermissionCatalogResource {
  key: string;
  actions: PermissionAction[];
}

export interface PermissionCatalog {
  resources: PermissionCatalogResource[];
  actions: PermissionAction[];
}

export type PermissionsMatrixState = Record<string, Partial<Record<PermissionAction, boolean>>>;

export interface ResourceCategory {
  id: string;
  label: string;
  description?: string;
  resources: string[];
}

export interface PermissionMatrixProps {
  catalog: PermissionCatalog;
  value: PermissionsMatrixState;
  onChange?: (value: PermissionsMatrixState) => void;
  readonly?: boolean;
  categories?: ResourceCategory[];
  resourceLabels?: Record<string, string>;
  resourceDescriptions?: Record<string, string>;
  className?: string;
}

const ACTION_LABELS: Record<PermissionAction, string> = {
  create: 'Create',
  read: 'Read',
  edit: 'Edit',
  delete: 'Delete',
  publish: 'Publish',
};

// ---------------------------------------------------------------------------
// Memoized Subcomponents for Zero-Lag, O(1) Targeted Re-rendering
// ---------------------------------------------------------------------------

interface MatrixCellProps {
  resKey: string;
  action: PermissionAction;
  label: string;
  isSupported: boolean;
  isGranted: boolean;
  readonly: boolean;
  onToggle: (resKey: string, action: PermissionAction, checked: boolean) => void;
}

const MatrixCell = React.memo(function MatrixCell({
  resKey,
  action,
  label,
  isSupported,
  isGranted,
  readonly,
  onToggle,
}: MatrixCellProps) {
  if (!isSupported) {
    return (
      <td className="py-1 px-1 text-center align-middle border-l border-border/30 h-9">
        <span className="text-muted-foreground/30 font-medium select-none text-xs">—</span>
      </td>
    );
  }

  if (readonly) {
    return (
      <td className="py-1 px-1 text-center align-middle border-l border-border/30 h-9">
        {isGranted ? (
          <span
            className="inline-flex items-center justify-center size-4 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold"
            data-testid={`check-${resKey}-${action}`}
          >
            <Check className="size-2.5 stroke-[2.5]" />
          </span>
        ) : (
          <span
            className="text-muted-foreground/40 select-none text-xs font-medium"
            data-testid={`dash-${resKey}-${action}`}
          >
            —
          </span>
        )}
      </td>
    );
  }

  return (
    <td className="py-1 px-1 text-center align-middle border-l border-border/30 h-9">
      <div className="flex items-center justify-center">
        <Checkbox
          size="sm"
          checked={isGranted}
          onCheckedChange={(c) => onToggle(resKey, action, !!c)}
          aria-label={`${action} on ${label}`}
          data-testid={`cell-checkbox-${resKey}-${action}`}
        />
      </div>
    </td>
  );
});

interface MatrixRowProps {
  resKey: string;
  label: string;
  desc?: string;
  actions: PermissionAction[];
  supportedActions: PermissionAction[];
  rowPermissions?: Partial<Record<PermissionAction, boolean>>;
  readonly: boolean;
  onToggle: (resKey: string, action: PermissionAction, checked: boolean) => void;
}

const MatrixRow = React.memo(
  function MatrixRow({
    resKey,
    label,
    desc,
    actions,
    supportedActions,
    rowPermissions,
    readonly,
    onToggle,
  }: MatrixRowProps) {
    return (
      <tr
        className="hover:bg-muted/25 transition-colors h-9"
        data-testid={`resource-row-${resKey}`}
      >
        <td className="py-1 px-3">
          <div className="flex flex-col justify-center">
            <span className="font-medium text-foreground text-xs leading-tight">
              {label}
            </span>
            {desc && (
              <span className="text-[10.5px] text-muted-foreground leading-tight mt-0.5 truncate max-w-[280px] sm:max-w-none">
                {desc}
              </span>
            )}
          </div>
        </td>
        {actions.map((act) => {
          const isSupported = supportedActions.includes(act);
          const isGranted = !!rowPermissions?.[act];

          return (
            <MatrixCell
              key={act}
              resKey={resKey}
              action={act}
              label={label}
              isSupported={isSupported}
              isGranted={isGranted}
              readonly={readonly}
              onToggle={onToggle}
            />
          );
        })}
      </tr>
    );
  },
  (prev, next) => {
    if (
      prev.resKey !== next.resKey ||
      prev.label !== next.label ||
      prev.desc !== next.desc ||
      prev.readonly !== next.readonly ||
      prev.onToggle !== next.onToggle
    ) {
      return false;
    }
    const p1 = prev.rowPermissions;
    const p2 = next.rowPermissions;
    if (p1 === p2) return true;
    if (!p1 && !p2) return true;
    if (!p1 || !p2) return false;

    for (const act of prev.actions) {
      if (!!p1[act] !== !!p2[act]) return false;
    }
    return true;
  }
);

interface ColumnHeaderCellProps {
  action: PermissionAction;
  label: string;
  checkedState: CheckboxCheckedState;
  readonly: boolean;
  onToggle: (action: PermissionAction) => void;
}

const ColumnHeaderCell = React.memo(function ColumnHeaderCell({
  action,
  label,
  checkedState,
  readonly,
  onToggle,
}: ColumnHeaderCellProps) {
  return (
    <th className="py-1 px-1 text-center border-l border-border/40 select-none">
      <div className="flex flex-col items-center justify-center gap-0.5">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-foreground/80 leading-none">
          {label}
        </span>
        {!readonly && (
          <Checkbox
            size="sm"
            checked={checkedState}
            onCheckedChange={() => onToggle(action)}
            aria-label={`Toggle all ${action} permissions`}
            data-testid={`column-toggle-${action}`}
          />
        )}
      </div>
    </th>
  );
});

interface CategoryRowProps {
  id: string;
  label: string;
  description?: string;
  colSpan: number;
  checkedState: CheckboxCheckedState;
  readonly: boolean;
  onToggle: (id: string) => void;
}

const CategoryRow = React.memo(function CategoryRow({
  id,
  label,
  description,
  colSpan,
  checkedState,
  readonly,
  onToggle,
}: CategoryRowProps) {
  return (
    <tr className="bg-muted/35 border-t border-b border-border h-7">
      <td colSpan={colSpan} className="py-1 px-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {!readonly && (
              <Checkbox
                size="sm"
                checked={checkedState}
                onCheckedChange={() => onToggle(id)}
                aria-label={`Toggle all ${label} permissions`}
                data-testid={`category-toggle-${id}`}
              />
            )}
            <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground select-none">
              {label}
            </span>
          </div>
          {description && (
            <span className="text-[10.5px] text-muted-foreground font-normal select-none hidden sm:inline">
              {description}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
});

// ---------------------------------------------------------------------------
// Main PermissionMatrix Component
// ---------------------------------------------------------------------------

export const PermissionMatrix: React.FC<PermissionMatrixProps> = ({
  catalog,
  value,
  onChange,
  readonly = false,
  categories,
  resourceLabels = {},
  resourceDescriptions = {},
  className,
}) => {
  const valueRef = React.useRef(value);
  valueRef.current = value;

  const resourceMap = React.useMemo(() => {
    const map = new Map<string, PermissionAction[]>();
    for (const item of catalog.resources) {
      map.set(item.key, item.actions);
    }
    return map;
  }, [catalog.resources]);

  const allResourceKeys = React.useMemo(() => {
    return catalog.resources.map((r) => r.key);
  }, [catalog.resources]);

  const groupedSections = React.useMemo(() => {
    if (categories && categories.length > 0) {
      const assigned = new Set<string>();
      const sections = categories.map((cat) => {
        const resList = cat.resources.filter((r) => resourceMap.has(r));
        for (const r of resList) assigned.add(r);
        return {
          id: cat.id,
          label: cat.label,
          description: cat.description,
          resources: resList,
        };
      });

      const remaining = allResourceKeys.filter((r) => !assigned.has(r));
      if (remaining.length > 0) {
        sections.push({
          id: 'other',
          label: 'Other Resources',
          description: undefined,
          resources: remaining,
        });
      }
      return sections;
    }

    return [
      {
        id: 'all',
        label: '',
        description: undefined,
        resources: allResourceKeys,
      },
    ];
  }, [categories, resourceMap, allResourceKeys]);

  // Pre-compute column and category checked states in a single fast pass
  const { columnCheckedStates, categoryCheckedStates } = React.useMemo(() => {
    const colCounts: Record<PermissionAction, { supported: number; checked: number }> = {
      create: { supported: 0, checked: 0 },
      read: { supported: 0, checked: 0 },
      edit: { supported: 0, checked: 0 },
      delete: { supported: 0, checked: 0 },
      publish: { supported: 0, checked: 0 },
    };

    const catCounts = new Map<string, { supported: number; checked: number }>();
    for (const section of groupedSections) {
      catCounts.set(section.id, { supported: 0, checked: 0 });
    }

    for (const [resKey, supportedActions] of resourceMap.entries()) {
      const resPerms = value[resKey];
      for (const act of supportedActions) {
        colCounts[act].supported++;
        if (resPerms?.[act]) {
          colCounts[act].checked++;
        }
      }
    }

    for (const section of groupedSections) {
      const counts = catCounts.get(section.id)!;
      for (const resKey of section.resources) {
        const supportedActions = resourceMap.get(resKey) || [];
        const resPerms = value[resKey];
        for (const act of supportedActions) {
          counts.supported++;
          if (resPerms?.[act]) {
            counts.checked++;
          }
        }
      }
    }

    const colStates: Record<PermissionAction, CheckboxCheckedState> = {
      create: false,
      read: false,
      edit: false,
      delete: false,
      publish: false,
    };

    for (const act of catalog.actions) {
      const { supported, checked } = colCounts[act];
      if (supported === 0 || checked === 0) colStates[act] = false;
      else if (checked === supported) colStates[act] = true;
      else colStates[act] = 'indeterminate';
    }

    const catStates = new Map<string, CheckboxCheckedState>();
    for (const section of groupedSections) {
      const { supported, checked } = catCounts.get(section.id)!;
      if (supported === 0 || checked === 0) catStates.set(section.id, false);
      else if (checked === supported) catStates.set(section.id, true);
      else catStates.set(section.id, 'indeterminate');
    }

    return { columnCheckedStates: colStates, categoryCheckedStates: catStates };
  }, [value, catalog.actions, resourceMap, groupedSections]);

  // Stable toggle callbacks: do not re-create on each tick
  const handleCellToggle = React.useCallback(
    (resource: string, action: PermissionAction, checked: boolean) => {
      if (readonly || !onChange) return;
      const current = valueRef.current;
      const nextState: PermissionsMatrixState = {
        ...current,
        [resource]: {
          ...(current[resource] || {}),
          [action]: checked,
        },
      };
      onChange(nextState);
    },
    [readonly, onChange]
  );

  const handleColumnToggle = React.useCallback(
    (action: PermissionAction) => {
      if (readonly || !onChange) return;
      const currentState = columnCheckedStates[action];
      const targetState = currentState !== true;

      const nextState: PermissionsMatrixState = { ...valueRef.current };
      for (const res of allResourceKeys) {
        const actions = resourceMap.get(res) || [];
        if (actions.includes(action)) {
          nextState[res] = {
            ...(nextState[res] || {}),
            [action]: targetState,
          };
        }
      }
      onChange(nextState);
    },
    [readonly, onChange, columnCheckedStates, allResourceKeys, resourceMap]
  );

  const handleCategoryToggle = React.useCallback(
    (categoryId: string) => {
      if (readonly || !onChange) return;
      const section = groupedSections.find((s) => s.id === categoryId);
      if (!section) return;

      const currentState = categoryCheckedStates.get(categoryId);
      const targetState = currentState !== true;

      const nextState: PermissionsMatrixState = { ...valueRef.current };
      for (const res of section.resources) {
        const actions = resourceMap.get(res) || [];
        const updatedRes = { ...(nextState[res] || {}) };
        for (const act of actions) {
          updatedRes[act] = targetState;
        }
        nextState[res] = updatedRes;
      }
      onChange(nextState);
    },
    [readonly, onChange, categoryCheckedStates, groupedSections, resourceMap]
  );

  return (
    <div
      className={cn(
        'w-full border border-border rounded-md overflow-hidden bg-card text-foreground shadow-xs',
        className
      )}
      data-testid="permission-matrix"
    >
      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-left border-collapse">
          <colgroup>
            <col className="w-auto" />
            {catalog.actions.map((act) => (
              <col key={act} className="w-[66px]" />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-muted/60 text-foreground h-9">
              <th className="py-1 px-3">
                <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground select-none">
                  Resource
                </span>
              </th>
              {catalog.actions.map((act) => (
                <ColumnHeaderCell
                  key={act}
                  action={act}
                  label={ACTION_LABELS[act] || act}
                  checkedState={columnCheckedStates[act]}
                  readonly={readonly}
                  onToggle={handleColumnToggle}
                />
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {groupedSections.map((section) => (
              <React.Fragment key={section.id}>
                {section.label && (
                  <CategoryRow
                    id={section.id}
                    label={section.label}
                    description={section.description}
                    colSpan={catalog.actions.length + 1}
                    checkedState={categoryCheckedStates.get(section.id) ?? false}
                    readonly={readonly}
                    onToggle={handleCategoryToggle}
                  />
                )}
                {section.resources.map((resKey) => {
                  const supportedActions = resourceMap.get(resKey) || [];
                  const label = resourceLabels[resKey] || resKey.replace(/_/g, ' ');
                  const desc = resourceDescriptions[resKey];

                  return (
                    <MatrixRow
                      key={resKey}
                      resKey={resKey}
                      label={label}
                      desc={desc}
                      actions={catalog.actions}
                      supportedActions={supportedActions}
                      rowPermissions={value[resKey]}
                      readonly={readonly}
                      onToggle={handleCellToggle}
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
