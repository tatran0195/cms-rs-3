import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cmsClient } from '@/shared/services/cms-client';
import type {
  CreateRolePayload,
  FullPermissionCatalog,
  OrganizationRole,
  ProjectRole,
  UpdateRolePayload,
} from '@cms/sdk';

export const rolesQueryKeys = {
  catalog: () => ['permissions', 'catalog'] as const,
  workspaceRoles: (orgId?: string) => ['workspace', orgId, 'roles'] as const,
  projectRoles: (projectId: string) => ['project', projectId, 'roles'] as const,
};

export function usePermissionCatalog() {
  return useQuery<FullPermissionCatalog>({
    queryKey: rolesQueryKeys.catalog(),
    queryFn: () => cmsClient.roles.getCatalog(),
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
}

export function useWorkspaceRoles(orgId?: string) {
  return useQuery<OrganizationRole[]>({
    queryKey: rolesQueryKeys.workspaceRoles(orgId),
    queryFn: () => {
      if (!orgId) return Promise.resolve([]);
      return cmsClient.roles.listWorkspaceRoles(orgId);
    },
    enabled: !!orgId,
  });
}

export function useCreateWorkspaceRole(orgId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateRolePayload) => {
      if (!orgId) throw new Error('Organization ID is required');
      return cmsClient.roles.createWorkspaceRole(orgId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rolesQueryKeys.workspaceRoles(orgId) });
    },
  });
}

export function useUpdateWorkspaceRole(orgId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, payload }: { roleId: string; payload: UpdateRolePayload }) => {
      if (!orgId) throw new Error('Organization ID is required');
      return cmsClient.roles.updateWorkspaceRole(orgId, roleId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rolesQueryKeys.workspaceRoles(orgId) });
    },
  });
}

export function useDeleteWorkspaceRole(orgId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, targetRoleId }: { roleId: string; targetRoleId?: string }) => {
      if (!orgId) throw new Error('Organization ID is required');
      return cmsClient.roles.deleteWorkspaceRole(orgId, roleId, targetRoleId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rolesQueryKeys.workspaceRoles(orgId) });
    },
  });
}

export function useProjectRoles(projectId: string) {
  return useQuery<ProjectRole[]>({
    queryKey: rolesQueryKeys.projectRoles(projectId),
    queryFn: () => cmsClient.roles.listProjectRoles(projectId),
    enabled: !!projectId,
  });
}

export function useCreateProjectRole(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateRolePayload) => {
      return cmsClient.roles.createProjectRole(projectId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rolesQueryKeys.projectRoles(projectId) });
    },
  });
}

export function useUpdateProjectRole(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, payload }: { roleId: string; payload: UpdateRolePayload }) => {
      return cmsClient.roles.updateProjectRole(projectId, roleId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rolesQueryKeys.projectRoles(projectId) });
    },
  });
}

export function useDeleteProjectRole(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, targetRoleId }: { roleId: string; targetRoleId?: string }) => {
      return cmsClient.roles.deleteProjectRole(projectId, roleId, targetRoleId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rolesQueryKeys.projectRoles(projectId) });
    },
  });
}
