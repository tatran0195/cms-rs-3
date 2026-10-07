import type { HttpClient } from '../http';

export type PermissionAction = 'create' | 'read' | 'edit' | 'delete' | 'publish';

export interface PermissionCatalogResource<R extends string = string> {
  key: R;
  actions: PermissionAction[];
}

export interface PermissionCatalog<R extends string = string> {
  resources: PermissionCatalogResource<R>[];
  actions: PermissionAction[];
}

export interface FullPermissionCatalog {
  workspace: PermissionCatalog;
  project: PermissionCatalog;
}

export type PermissionsMatrixState = Record<string, Partial<Record<PermissionAction, boolean>>>;

export interface OrganizationRole {
  id: string;
  organization_id: string;
  name: string;
  description?: string | null;
  is_default: boolean;
  permissions: PermissionsMatrixState;
  created_at: string;
  updated_at: string;
}

export interface ProjectRole {
  id: string;
  project_id: string;
  name: string;
  description?: string | null;
  is_default: boolean;
  permissions: PermissionsMatrixState;
  created_at: string;
  updated_at: string;
}

export interface CreateRolePayload {
  name: string;
  description?: string;
  is_default?: boolean;
  permissions: PermissionsMatrixState;
}

export interface UpdateRolePayload {
  name?: string;
  description?: string;
  is_default?: boolean;
  permissions?: PermissionsMatrixState;
}

export interface RoleUsageResponse {
  usage_count: number;
}

export class RolesResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Get dynamic dual-domain permissions catalog
   */
  async getCatalog(): Promise<FullPermissionCatalog> {
    return this.http.get<FullPermissionCatalog>('/api/v1/permissions/catalog');
  }

  /**
   * List custom roles for a workspace
   */
  async listWorkspaceRoles(orgId: string): Promise<OrganizationRole[]> {
    return this.http.get<OrganizationRole[]>(`/api/v1/workspaces/${orgId}/roles`);
  }

  /**
   * Create custom role for a workspace
   */
  async createWorkspaceRole(orgId: string, payload: CreateRolePayload): Promise<OrganizationRole> {
    return this.http.post<OrganizationRole>(`/api/v1/workspaces/${orgId}/roles`, payload);
  }

  /**
   * Update custom role for a workspace
   */
  async updateWorkspaceRole(orgId: string, roleId: string, payload: UpdateRolePayload): Promise<OrganizationRole> {
    return this.http.patch<OrganizationRole>(`/api/v1/workspaces/${orgId}/roles/${roleId}`, payload);
  }

  /**
   * Get usage count for a workspace role
   */
  async getWorkspaceRoleUsage(orgId: string, roleId: string): Promise<RoleUsageResponse> {
    return this.http.get<RoleUsageResponse>(`/api/v1/workspaces/${orgId}/roles/${roleId}/usage`);
  }

  /**
   * Delete a workspace role with optional reassignment target
   */
  async deleteWorkspaceRole(orgId: string, roleId: string, targetRoleId?: string): Promise<{ success: boolean }> {
    const url = targetRoleId
      ? `/api/v1/workspaces/${orgId}/roles/${roleId}?target_role_id=${encodeURIComponent(targetRoleId)}`
      : `/api/v1/workspaces/${orgId}/roles/${roleId}`;
    return this.http.delete<{ success: boolean }>(url);
  }

  /**
   * List custom roles for a project
   */
  async listProjectRoles(projectId: string): Promise<ProjectRole[]> {
    return this.http.get<ProjectRole[]>(`/api/v1/projects/${projectId}/roles`);
  }

  /**
   * Create custom role for a project
   */
  async createProjectRole(projectId: string, payload: CreateRolePayload): Promise<ProjectRole> {
    return this.http.post<ProjectRole>(`/api/v1/projects/${projectId}/roles`, payload);
  }

  /**
   * Update custom role for a project
   */
  async updateProjectRole(projectId: string, roleId: string, payload: UpdateRolePayload): Promise<ProjectRole> {
    return this.http.patch<ProjectRole>(`/api/v1/projects/${projectId}/roles/${roleId}`, payload);
  }

  /**
   * Get usage count for a project role
   */
  async getProjectRoleUsage(projectId: string, roleId: string): Promise<RoleUsageResponse> {
    return this.http.get<RoleUsageResponse>(`/api/v1/projects/${projectId}/roles/${roleId}/usage`);
  }

  /**
   * Delete a project role with optional reassignment target
   */
  async deleteProjectRole(projectId: string, roleId: string, targetRoleId?: string): Promise<{ success: boolean }> {
    const url = targetRoleId
      ? `/api/v1/projects/${projectId}/roles/${roleId}?target_role_id=${encodeURIComponent(targetRoleId)}`
      : `/api/v1/projects/${projectId}/roles/${roleId}`;
    return this.http.delete<{ success: boolean }>(url);
  }
}
