'use client';

import * as React from 'react';
import { Button } from './button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';
import { Input } from './input';
import { Label } from './label';
import { Switch } from './switch';
import { Textarea } from './textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from './tooltip';
import {
  PermissionMatrix,
  type PermissionCatalog,
  type PermissionsMatrixState,
  type ResourceCategory,
} from './permission-matrix';

export interface RoleEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  roleName: string;
  onRoleNameChange: (name: string) => void;
  roleDescription?: string;
  onRoleDescriptionChange?: (description: string) => void;
  isDefault?: boolean;
  onIsDefaultChange?: (isDefault: boolean) => void;
  catalog: PermissionCatalog;
  permissions: PermissionsMatrixState;
  onPermissionsChange: (permissions: PermissionsMatrixState) => void;
  categories?: ResourceCategory[];
  resourceLabels?: Record<string, string>;
  resourceDescriptions?: Record<string, string>;
  onSave: () => void | Promise<void>;
  isSaving?: boolean;
}

export type RoleEditorPanelProps = RoleEditorModalProps;

export function RoleEditorModal({
  open,
  onOpenChange,
  title = 'Configure Role',
  description = 'Define role metadata and resource access permissions.',
  roleName,
  onRoleNameChange,
  roleDescription = '',
  onRoleDescriptionChange,
  isDefault = false,
  onIsDefaultChange,
  catalog,
  permissions,
  onPermissionsChange,
  categories,
  resourceLabels,
  resourceDescriptions,
  onSave,
  isSaving = false,
}: RoleEditorModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[86vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 py-3 border-b border-border">
          <DialogTitle className="text-sm font-semibold tracking-tight">{title}</DialogTitle>
          <DialogDescription className="text-[11px] text-muted-foreground">{description}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-3.5 space-y-3.5">
          <div className="space-y-2.5">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end justify-between">
              <div className="flex-1 w-full space-y-1">
                <Label htmlFor="role-name" className="text-xs font-medium">
                  Role Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="role-name"
                  value={roleName}
                  onChange={(e) => onRoleNameChange(e.target.value)}
                  placeholder="e.g. Content Reviewer"
                  className="h-8 text-xs"
                  data-testid="role-name-input"
                />
              </div>

              {onIsDefaultChange && (
                <div className="flex h-8 items-center gap-2.5 px-3 border border-border rounded-md bg-muted/30 shrink-0 self-end">
                  <Tooltip>
                    <TooltipTrigger
                      delay={200}
                      closeDelay={100}
                      render={
                        <label
                          htmlFor="role-default-switch"
                          className="text-xs font-medium leading-none cursor-pointer select-none text-foreground hover:text-foreground/80 transition-colors"
                        >
                          Default Role
                        </label>
                      }
                    />
                    <TooltipContent
                      side="top"
                      align="center"
                      sideOffset={6}
                      className="z-[60] max-w-xs text-xs font-normal"
                    >
                      Automatically assigned to new members joining the workspace or project.
                    </TooltipContent>
                  </Tooltip>
                  <Switch
                    id="role-default-switch"
                    checked={isDefault}
                    onCheckedChange={onIsDefaultChange}
                    size="sm"
                    data-testid="role-default-switch"
                  />
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="role-description" className="text-xs font-medium">
                Description
              </Label>
              <Textarea
                id="role-description"
                value={roleDescription}
                onChange={(e) => onRoleDescriptionChange?.(e.target.value)}
                placeholder="Briefly describe the responsibilities of this role"
                rows={2}
                className="field-sizing-fixed resize-y min-h-[52px] py-1.5 text-xs leading-normal"
                data-testid="role-description-input"
              />
            </div>
          </div>

          <div className="space-y-1.5 pt-0.5">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-semibold">
                  Permissions Matrix
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Toggle fine-grained actions per resource.
                </p>
              </div>
            </div>

            <PermissionMatrix
              catalog={catalog}
              value={permissions}
              onChange={onPermissionsChange}
              categories={categories}
              resourceLabels={resourceLabels}
              resourceDescriptions={resourceDescriptions}
            />
          </div>
        </div>

        <DialogFooter className="px-5 py-2.5 border-t border-border bg-muted/15 flex flex-row items-center justify-end gap-2.5">
          <Button
            variant="outline"
            size="sm"
            disabled={isSaving}
            onClick={() => onOpenChange(false)}
            data-testid="role-cancel-button"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={isSaving || !roleName.trim()}
            onClick={onSave}
            data-testid="role-save-button"
          >
            {isSaving ? 'Saving...' : 'Save Role'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const RoleEditorPanel = RoleEditorModal;
