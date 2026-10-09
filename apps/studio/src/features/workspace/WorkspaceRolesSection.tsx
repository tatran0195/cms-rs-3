import { Badge } from "@cms/design-system/components/ui/badge";
import { Button } from "@cms/design-system/components/ui/button";
import { useConfirm } from "@cms/design-system/components/ui/confirm";
import type {
  PermissionsMatrixState,
  ResourceCategory,
} from "@cms/design-system/components/ui/permission-matrix";
import { Skeleton } from "@cms/design-system/components/ui/skeleton";
import type { WorkspaceRole } from "@cms/sdk";
import { Edit2, Plus, Shield, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { RoleEditorPanel } from "@/features/project-settings/components/role-editor-panel";
import {
  useCreateWorkspaceRole,
  useDeleteWorkspaceRole,
  usePermissionCatalog,
  useUpdateWorkspaceRole,
  useWorkspaceRoles,
} from "@/hooks/api";

const WORKSPACE_CATEGORIES: ResourceCategory[] = [
  {
    id: "governance",
    label: "Governance & Access",
    resources: ["members", "roles", "api_keys", "audit_logs"],
  },
  {
    id: "content",
    label: "Content & Resources",
    resources: ["projects"],
  },
  {
    id: "system",
    label: "Workspace Configuration",
    resources: ["settings", "danger_zone"],
  },
];

const WORKSPACE_RESOURCE_LABELS: Record<string, string> = {
  projects: "Projects",
  members: "Members & Invitations",
  roles: "Custom Roles",
  api_keys: "API Keys",
  audit_logs: "Audit Logs",
  settings: "Workspace Settings",
  danger_zone: "Danger Zone & Deletion",
};

const WORKSPACE_RESOURCE_DESCRIPTIONS: Record<string, string> = {
  projects: "Create, view, modify, and delete workspace projects",
  members: "Invite and manage team members and permissions",
  roles: "Create, modify, and manage custom workspace roles",
  api_keys: "Generate, view, and revoke workspace API tokens",
  audit_logs: "Inspect workspace security audit and activity logs",
  settings: "Update workspace metadata and configuration",
  danger_zone: "Execute destructive operations including workspace removal",
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

export interface WorkspaceRolesSectionProps {
  workspaceId?: string;
}

export function WorkspaceRolesSection({ workspaceId = 'workspace' }: WorkspaceRolesSectionProps = {}) {
  const confirm = useConfirm();
  const { data: catalogData, isPending: isCatalogPending } =
    usePermissionCatalog();
  const { data: roles = [], isPending: isRolesPending } =
    useWorkspaceRoles(workspaceId);

  const createRole = useCreateWorkspaceRole(workspaceId);
  const updateRole = useUpdateWorkspaceRole(workspaceId);
  const deleteRole = useDeleteWorkspaceRole(workspaceId);

  const [panelOpen, setPanelOpen] = React.useState(false);
  const [editingRole, setEditingRole] = React.useState<WorkspaceRole | null>(
    null,
  );

  const [roleName, setRoleName] = React.useState("");
  const [roleDescription, setRoleDescription] = React.useState("");
  const [isDefault, setIsDefault] = React.useState(false);
  const [permissions, setPermissions] = React.useState<PermissionsMatrixState>(
    {},
  );

  const handleOpenCreate = () => {
    setEditingRole(null);
    setRoleName("");
    setRoleDescription("");
    setIsDefault(false);
    setPermissions({});
    setPanelOpen(true);
  };

  const handleOpenEdit = (role: WorkspaceRole) => {
    setEditingRole(role);
    setRoleName(role.name);
    setRoleDescription(role.description ?? "");
    setIsDefault(role.is_default);
    setPermissions(role.permissions ?? {});
    setPanelOpen(true);
  };

  const handleSave = async () => {
    if (!roleName.trim()) {
      toast.error("Role name is required");
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
        toast.success(`Role "${roleName}" updated successfully`);
      } else {
        await createRole.mutateAsync({
          name: roleName.trim(),
          description: roleDescription.trim() || undefined,
          is_default: isDefault,
          permissions,
        });
        toast.success(`Role "${roleName}" created successfully`);
      }
      setPanelOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save role");
    }
  };

  const handleDelete = async (role: WorkspaceRole) => {
    if (role.is_default) {
      toast.error("The default workspace role cannot be deleted");
      return;
    }

    const ok = await confirm({
      title: "Delete Custom Role",
      description: `Are you sure you want to delete the role "${role.name}"? Members assigned to this role will lose their custom grants.`,
      confirmLabel: "Delete Role",
      destructive: true,
    });

    if (!ok) return;

    try {
      await deleteRole.mutateAsync({ roleId: role.id });
      toast.success(`Role "${role.name}" deleted successfully`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete role");
    }
  };

  const workspaceCatalog = catalogData?.workspace ?? {
    resources: [],
    actions: [],
  };
  const isSaving = createRole.isPending || updateRole.isPending;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-lg tracking-tight">
            Workspace Custom Roles
          </h2>
          <p className="mt-0.5 text-muted-foreground text-sm">
            Configure custom roles with fine-grained 2D permission matrices
            across workspace resources.
          </p>
        </div>
        <Button
          onClick={handleOpenCreate}
          disabled={!workspaceId || isRolesPending}
          size="sm"
        >
          <Plus className="size-4" /> New Role
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {isRolesPending || isCatalogPending ? (
          <div className="p-4 space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : roles.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground mb-3">
              <Shield className="size-5" />
            </div>
            <h3 className="font-medium text-sm">No custom roles yet</h3>
            <p className="mt-1 text-muted-foreground text-xs max-w-sm">
              Custom roles let you grant specific privileges like managing API
              keys or audit logs without granting full admin rights.
            </p>
            <Button
              className="mt-4"
              onClick={handleOpenCreate}
              size="sm"
              variant="outline"
            >
              <Plus className="size-4" /> Create first custom role
            </Button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border border-b bg-muted/50 text-muted-foreground">
                <th className="px-4 py-2.5 text-start font-medium">Role</th>
                <th className="px-4 py-2.5 text-start font-medium">
                  Description
                </th>
                <th className="px-4 py-2.5 text-start font-medium">
                  Permissions
                </th>
                <th className="px-4 py-2.5 text-end font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => {
                const permissionCount = countPermissions(
                  role.permissions ?? {},
                );
                return (
                  <tr
                    key={role.id}
                    className="border-border border-b last:border-0 hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{role.name}</span>
                        {role.is_default && (
                          <Badge
                            variant="secondary"
                            className="text-[11px] font-normal"
                          >
                            Default
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs max-w-md truncate">
                      {role.description || "—"}
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
        title={
          editingRole
            ? `Edit Role: ${editingRole.name}`
            : "Create Custom Workspace Role"
        }
        description="Configure role metadata and fine-grained permissions across workspace resources."
        roleName={roleName}
        onRoleNameChange={setRoleName}
        roleDescription={roleDescription}
        onRoleDescriptionChange={setRoleDescription}
        isDefault={isDefault}
        onIsDefaultChange={setIsDefault}
        catalog={workspaceCatalog}
        permissions={permissions}
        onPermissionsChange={setPermissions}
        categories={WORKSPACE_CATEGORIES}
        resourceLabels={WORKSPACE_RESOURCE_LABELS}
        resourceDescriptions={WORKSPACE_RESOURCE_DESCRIPTIONS}
        onSave={handleSave}
        isSaving={isSaving}
      />
    </div>
  );
}
