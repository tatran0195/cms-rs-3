'use client';

import * as React from 'react';
import { CheckMini } from '@cms/icons';
import { Checkbox, type CheckboxCheckedState } from '@/components/checkbox';
import { Text } from '@/components/text';
import { clx } from '@/utils/clx';
import type {
  PermissionAction,
  PermissionCatalog,
  PermissionsMatrixState,
  ResourceCategory,
} from './types';

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

  // Compute category grouping
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

  const handleCellToggle = (resource: string, action: PermissionAction, checked: boolean) => {
    if (readonly || !onChange) return;
    const nextState: PermissionsMatrixState = { ...value };
    const currentRes = { ...(nextState[resource] || {}) };
    currentRes[action] = checked;
    nextState[resource] = currentRes;
    onChange(nextState);
  };

  const getColumnCheckedState = (action: PermissionAction): CheckboxCheckedState => {
    let supportedCount = 0;
    let checkedCount = 0;

    for (const res of allResourceKeys) {
      const actions = resourceMap.get(res) || [];
      if (actions.includes(action)) {
        supportedCount++;
        if (value[res]?.[action]) {
          checkedCount++;
        }
      }
    }

    if (supportedCount === 0 || checkedCount === 0) return false;
    if (checkedCount === supportedCount) return true;
    return 'indeterminate';
  };

  const handleColumnToggle = (action: PermissionAction) => {
    if (readonly || !onChange) return;
    const currentState = getColumnCheckedState(action);
    const targetState = currentState !== true; // Toggle to true if false or indeterminate

    const nextState: PermissionsMatrixState = { ...value };
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
  };

  const getCategoryCheckedState = (resources: string[]): CheckboxCheckedState => {
    let totalSupported = 0;
    let totalChecked = 0;

    for (const res of resources) {
      const actions = resourceMap.get(res) || [];
      for (const act of actions) {
        totalSupported++;
        if (value[res]?.[act]) {
          totalChecked++;
        }
      }
    }

    if (totalSupported === 0 || totalChecked === 0) return false;
    if (totalChecked === totalSupported) return true;
    return 'indeterminate';
  };

  const handleCategoryToggle = (resources: string[]) => {
    if (readonly || !onChange) return;
    const currentState = getCategoryCheckedState(resources);
    const targetState = currentState !== true;

    const nextState: PermissionsMatrixState = { ...value };
    for (const res of resources) {
      const actions = resourceMap.get(res) || [];
      const updatedRes = { ...(nextState[res] || {}) };
      for (const act of actions) {
        updatedRes[act] = targetState;
      }
      nextState[res] = updatedRes;
    }
    onChange(nextState);
  };

  return (
    <div
      className={clx(
        'w-full border border-ui-border-base rounded-lg overflow-hidden bg-ui-bg-base text-ui-fg-base',
        className
      )}
      data-testid="permission-matrix"
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b border-ui-border-base bg-ui-bg-subtle text-ui-fg-muted font-medium">
              <th className="py-3 px-4 min-w-[200px]">Resource</th>
              {catalog.actions.map((act) => {
                const checkedState = getColumnCheckedState(act);
                return (
                  <th key={act} className="py-3 px-3 text-center min-w-[80px]">
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <span className="text-xs uppercase tracking-wider font-semibold">
                        {ACTION_LABELS[act] || act}
                      </span>
                      {!readonly && (
                        <Checkbox
                          checked={checkedState}
                          onCheckedChange={() => handleColumnToggle(act)}
                          aria-label={`Toggle all ${act} permissions`}
                          data-testid={`column-toggle-${act}`}
                        />
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-ui-border-base">
            {groupedSections.map((section) => (
              <React.Fragment key={section.id}>
                {section.label && (
                  <tr className="bg-ui-bg-subtle/50 font-semibold text-ui-fg-subtle">
                    <td
                      colSpan={catalog.actions.length + 1}
                      className="py-2.5 px-4"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {!readonly && (
                            <Checkbox
                              checked={getCategoryCheckedState(section.resources)}
                              onCheckedChange={() => handleCategoryToggle(section.resources)}
                              aria-label={`Toggle all ${section.label} permissions`}
                              data-testid={`category-toggle-${section.id}`}
                            />
                          )}
                          <Text size="base" weight="plus">
                            {section.label}
                          </Text>
                        </div>
                        {section.description && (
                          <Text size="small" className="text-ui-fg-muted font-normal">
                            {section.description}
                          </Text>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                {section.resources.map((resKey) => {
                  const supportedActions = resourceMap.get(resKey) || [];
                  const label = resourceLabels[resKey] || resKey.replace(/_/g, ' ');
                  const desc = resourceDescriptions[resKey];

                  return (
                    <tr
                      key={resKey}
                      className="hover:bg-ui-bg-subtle/30 transition-colors"
                      data-testid={`resource-row-${resKey}`}
                    >
                      <td className="py-2.5 px-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-ui-fg-base capitalize">
                            {label}
                          </span>
                          {desc && (
                            <span className="text-xs text-ui-fg-muted">{desc}</span>
                          )}
                        </div>
                      </td>
                      {catalog.actions.map((act) => {
                        const isSupported = supportedActions.includes(act);
                        const isGranted = !!value[resKey]?.[act];

                        return (
                          <td
                            key={act}
                            className="py-2.5 px-3 text-center align-middle"
                          >
                            {!isSupported ? (
                              <span className="text-ui-fg-muted opacity-40 select-none">
                                —
                              </span>
                            ) : readonly ? (
                              isGranted ? (
                                <span
                                  className="inline-flex items-center justify-center text-emerald-500 font-bold"
                                  data-testid={`check-${resKey}-${act}`}
                                >
                                  <CheckMini className="w-4 h-4" />
                                </span>
                              ) : (
                                <span
                                  className="text-ui-fg-muted select-none"
                                  data-testid={`dash-${resKey}-${act}`}
                                >
                                  —
                                </span>
                              )
                            ) : (
                              <Checkbox
                                checked={isGranted}
                                onCheckedChange={(c) =>
                                  handleCellToggle(resKey, act, !!c)
                                }
                                aria-label={`${act} on ${label}`}
                                data-testid={`cell-checkbox-${resKey}-${act}`}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
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
