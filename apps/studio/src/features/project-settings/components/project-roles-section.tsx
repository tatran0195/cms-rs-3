import * as React from 'react';
import { Badge } from '@cms/design-system/components/ui/badge';
import { Button } from '@cms/design-system/components/ui/button';
import { useConfirm } from '@cms/design-system/components/ui/confirm';
import { Skeleton } from '@cms/design-system/components/ui/skeleton';
import type { PermissionsMatrixState, ResourceCategory } from '@cms/design-system/components/ui/permission-matrix';
import { RoleEditorPanel } from './role-editor-panel';
import type { ProjectRole } from '@cms/sdk';
import { Edit2, Plus, Shield, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useCreateProjectRole,
  useDeleteProjectRole,
  usePermissionCatalog,
  useProjectRoles,
  useUpdateProjectRole,
} from '@/hooks/api';

const PROJECT_CATEGORIES: ResourceCategory[] = [
  {
    id: 'content',
    label: 'Content & Publishing',
    resources: ['pages', 'branches', 'comments', 'assets'],
  },
  {
    id: 'delivery',
    label: 'Deployment & Domains',
    resources: ['deployments', 'domains', 'openapi'],
  },
  {
    id: 'collaboration',
    label: 'Access & Extensibility',
    resources: ['members', 'roles', 'addons', 'git'],
  },
  {
    id: 'insights',
    label: 'Analytics & Maintenance',
    resources: ['analytics', 'danger_zone'],
  },
];

const PROJECT_RESOURCE_LABELS: Record<string, string> = {
  pages: 'Pages & Documentation',
  branches: 'Git Branches',
  comments: 'Inline Comments & Discussions',
  assets: 'Uploaded Assets & Media',
  deployments: 'Deployments & Builds',
  domains: 'Custom Domains & SSL',
  openapi: 'OpenAPI / Swagger Specs',
  members: 'Project Members',
  roles: 'Custom Project Roles',
  addons: 'Integrations & Addons',
  git: 'Git Sync & Repository Settings',
  analytics: 'Traffic & Reader Analytics',
  danger_zone: 'Danger Zone & Project Deletion',
};

const PROJECT_RESOURCE_DESCRIPTIONS: Record<string, string> = {
  pages: 'Create, edit, delete, and publish project documentation pages',
  branches: 'Create and manage version branches',
  comments: 'Read, post, and resolve feedback comments',
  assets: 'Upload and manage project media assets',
  deployments: 'Trigger and review project documentation deployments',
  domains: 'Configure custom domains and DNS routing',
  openapi: 'Manage API reference documentation and schemas',
  members: 'Assign project membership and member roles',
  roles: 'Manage custom project roles and permission matrices',
  addons: 'Install and configure project extensions',
  git: 'Configure upstream repository connection and synchronization',
  analytics: 'View traffic, page views, and visitor analytics',
  danger_zone: 'Execute destructive actions like deleting the project',
};

function countPermissions(permissions: PermissionsMatrixState): number {
  let count = 0;
  for (const resource of Object.keys(permissions)) {
    const actions = permissions[resource];
    if (actions) {
      for (const action of Object.keys(actions)) {
        if (actions[action as keyof typeof actions] === true) {
          count++;
        }
      }
    }
  }
  return count;
}

export interface ProjectRolesSectionProps {
  projectId: string;
}

export function ProjectRolesSection({ projectId }: ProjectRolesSectionProps) {
  const confirm = useConfirm();
  const { data: catalogData, isPending: isCatalogPending } = usePermissionCatalog();
  const { data: roles = [], isPending: isRolesPending } = useProjectRoles(projectId);

  const createRole = useCreateProjectRole(projectId);
  const updateRole = useUpdateProjectRole(projectId);
  const deleteRole = useDeleteProjectRole(projectId);

  const [panelOpen, setPanelOpen] = React.useState(false);
  const [editingRole, setEditingRole] = React.useState<ProjectRole | null>(null);

  const [roleName, setRoleName] = React.useState('');
  const [roleDescription, setRoleDescription] = React.useState('');
  const [isDefault, setIsDefault] = React.useState(false);
  const [permissions, setPermissions] = React.useState<PermissionsMatrixState>({});

  const handleOpenCreate = () => {
    setEditingRole(null);
    setRoleName('');
    setRoleDescription('');
    setIsDefault(false);
    setPermissions({});
    setPanelOpen(true);
  };

  const handleOpenEdit = (role: ProjectRole) => {
    setEditingRole(role);
    setRoleName(role.name);
    setRoleDescription(role.description ?? '');
    setIsDefault(role.is_default);
    setPermissions(role.permissions ?? {});
    setPanelOpen(true);
  };

  const handleSave = async () => {
    if (!roleName.trim()) {
      toast.error('Role name is required');
      return;
    }

    try {
      if (editingRole) {
        await updateRole.mutateAsync({
          roleId: editingRole.id,
          payload: {
            name: roleName.trim(),
            description: roleDescription.trim() || undefined,
            is_default: isDefault,
            permissions,
          },
        });
        toast.success(`Project role "${roleName}" updated successfully`);
      } else {
        await createRole.mutateAsync({
          name: roleName.trim(),
          description: roleDescription.trim() || undefined,
          is_default: isDefault,
          permissions,
        });
        toast.success(`Project role "${roleName}" created successfully`);
      }
      setPanelOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save role');
    }
  };

  const handleDelete = async (role: ProjectRole) => {
    if (role.is_default) {
      toast.error('The default project role cannot be deleted');
      return;
    }

    const ok = await confirm({
      title: 'Delete Project Role',
      description: `Are you sure you want to delete the role "${role.name}"? Project members with this role will revert to baseline project permissions.`,
      confirmLabel: 'Delete Role',
      destructive: true,
    });

    if (!ok) return;

    try {
      await deleteRole.mutateAsync({ roleId: role.id });
      toast.success(`Role "${role.name}" deleted successfully`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete role');
    }
  };

  const projectCatalog = catalogData?.project ?? { resources: [], actions: [] };
  const isSaving = createRole.isPending || updateRole.isPending;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold text-base tracking-tight">Project Custom Roles</h3>
          <p className="mt-0.5 text-muted-foreground text-xs">
            Manage custom roles and 2D permission matrices specific to this project.
          </p>
        </div>
        <Button onClick={handleOpenCreate} disabled={!projectId || isRolesPending} size="sm">
          <Plus className="size-4" /> New Role
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {isRolesPending || isCatalogPending ? (
          <div className="p-4 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : roles.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground mb-3">
              <Shield className="size-5" />
            </div>
            <h4 className="font-medium text-sm">No custom project roles yet</h4>
            <p className="mt-1 text-muted-foreground text-xs max-w-sm">
              Custom project roles allow you to grant permissions (e.g. publish pages, manage branches, or view analytics) without granting admin privileges.
            </p>
            <Button className="mt-4" onClick={handleOpenCreate} size="sm" variant="outline">
              <Plus className="size-4" /> Create first project role
            </Button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border border-b bg-muted/50 text-muted-foreground">
                <th className="px-4 py-2.5 text-start font-medium">Role</th>
                <th className="px-4 py-2.5 text-start font-medium">Description</th>
                <th className="px-4 py-2.5 text-start font-medium">Permissions</th>
                <th className="px-4 py-2.5 text-end font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => {
                const permissionCount = countPermissions(role.permissions ?? {});
                return (
                  <tr key={role.id} className="border-border border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{role.name}</span>
                        {role.is_default && (
                          <Badge variant="secondary" className="text-[11px] font-normal">
                            Default
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs max-w-md truncate">
                      {role.description || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">
                        {permissionCount} granted
                      </span>
                    </td>
                    <td className="px-4 py-3 text-end">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          title="Configure Permissions"
                          aria-label="Configure Permissions"
                          onClick={() => handleOpenEdit(role)}
                        >
                          <Edit2 className="size-4" />
                        </Button>
                        {!role.is_default && (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            title="Delete Role"
                            aria-label="Delete Role"
                            disabled={deleteRole.isPending}
                            onClick={() => handleDelete(role)}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <RoleEditorPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        title={editingRole ? `Edit Role: ${editingRole.name}` : 'Create Custom Project Role'}
        description="Configure role metadata and fine-grained permissions across project resources."
        roleName={roleName}
        onRoleNameChange={setRoleName}
        roleDescription={roleDescription}
        onRoleDescriptionChange={setRoleDescription}
        isDefault={isDefault}
        onIsDefaultChange={setIsDefault}
        catalog={projectCatalog}
        permissions={permissions}
        onPermissionsChange={setPermissions}
        categories={PROJECT_CATEGORIES}
        resourceLabels={PROJECT_RESOURCE_LABELS}
        resourceDescriptions={PROJECT_RESOURCE_DESCRIPTIONS}
        onSave={handleSave}
        isSaving={isSaving}
      />
    </div>
  );
}
