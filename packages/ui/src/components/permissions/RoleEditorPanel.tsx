'use client';

import * as React from 'react';
import { Button } from '@/components/button';
import { Drawer } from '@/components/drawer';
import { Input } from '@/components/input';
import { Label } from '@/components/label';
import { Switch } from '@/components/switch';
import { Text } from '@/components/text';
import { Textarea } from '@/components/textarea';
import { PermissionMatrix } from './PermissionMatrix';
import type {
  PermissionCatalog,
  PermissionsMatrixState,
  ResourceCategory,
} from './types';

export interface RoleEditorPanelProps {
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

export const RoleEditorPanel: React.FC<RoleEditorPanelProps> = ({
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
}) => {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <Drawer.Content className="max-w-3xl w-full">
        <Drawer.Header>
          <Drawer.Title>{title}</Drawer.Title>
          <Drawer.Description>{description}</Drawer.Description>
        </Drawer.Header>
        <Drawer.Body className="space-y-6 py-4 overflow-y-auto max-h-[calc(100vh-200px)]">
          <div className="space-y-4">
            <div>
              <Label htmlFor="role-name" className="text-sm font-medium">
                Role Name <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="role-name"
                value={roleName}
                onChange={(e) => onRoleNameChange(e.target.value)}
                placeholder="e.g. Content Reviewer"
                className="mt-1.5"
                data-testid="role-name-input"
              />
            </div>

            <div>
              <Label htmlFor="role-description" className="text-sm font-medium">
                Description
              </Label>
              <Textarea
                id="role-description"
                value={roleDescription}
                onChange={(e) => onRoleDescriptionChange?.(e.target.value)}
                placeholder="Briefly describe the responsibilities of this role"
                rows={2}
                className="mt-1.5 resize-none"
                data-testid="role-description-input"
              />
            </div>

            {onIsDefaultChange && (
              <div className="flex items-center justify-between p-3.5 border border-ui-border-base rounded-md bg-ui-bg-subtle/40">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-ui-fg-base">
                    Default Role for New Members
                  </span>
                  <Text size="small" className="text-ui-fg-muted">
                    Automatically assign this role to new members joining the workspace or project.
                  </Text>
                </div>
                <Switch
                  checked={isDefault}
                  onCheckedChange={onIsDefaultChange}
                  data-testid="role-default-switch"
                />
              </div>
            )}
          </div>

          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">
                  Permissions Matrix
                </Label>
                <Text size="small" className="text-ui-fg-muted">
                  Toggle fine-grained actions per resource.
                </Text>
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
        </Drawer.Body>
        <Drawer.Footer className="flex items-center justify-end gap-3 pt-3 border-t border-ui-border-base">
          <Drawer.Close asChild>
            <Button variant="secondary" disabled={isSaving}>
              Cancel
            </Button>
          </Drawer.Close>
          <Button
            variant="primary"
            onClick={onSave}
            isLoading={isSaving}
            disabled={isSaving || !roleName.trim()}
            data-testid="role-save-button"
          >
            Save Role
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  );
};
