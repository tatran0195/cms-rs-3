import type {
  CreateRolePayload,
  FullPermissionCatalog,
  ProjectRole,
  UpdateRolePayload,
  WorkspaceRole,
} from '@cms/sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cmsClient } from '@/shared/services/cms-client';

export const rolesQueryKeys = {
  catalog: () => ['permissions', 'catalog'] as const,
  workspaceRoles: (workspaceId: string = 'workspace') => ['workspace', workspaceId, 'roles'] as const,
  projectRoles: (projectId: string) => ['project', projectId, 'roles'] as const,
};

export function usePermissionCatalog() {
  return useQuery<FullPermissionCatalog>({
    queryKey: rolesQueryKeys.catalog(),
    queryFn: () => cmsClient.roles.getCatalog(),
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
}

export function useWorkspaceRoles(workspaceId: string = 'workspace') {
  return useQuery<WorkspaceRole[]>({
    queryKey: rolesQueryKeys.workspaceRoles(workspaceId),
    queryFn: () => cmsClient.roles.listWorkspaceRoles(workspaceId),
    enabled: !!workspaceId,
  });
}

export function useCreateWorkspaceRole(workspaceId: string = 'workspace') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateRolePayload) => {
      return cmsClient.roles.createWorkspaceRole(workspaceId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rolesQueryKeys.workspaceRoles(workspaceId) });
    },
  });
}

export function useUpdateWorkspaceRole(workspaceId: string = 'workspace') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, payload }: { roleId: string; payload: UpdateRolePayload }) => {
      return cmsClient.roles.updateWorkspaceRole(workspaceId, roleId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rolesQueryKeys.workspaceRoles(workspaceId) });
    },
  });
}

export function useDeleteWorkspaceRole(workspaceId: string = 'workspace') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, targetRoleId }: { roleId: string; targetRoleId?: string }) => {
      return cmsClient.roles.deleteWorkspaceRole(workspaceId, roleId, targetRoleId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rolesQueryKeys.workspaceRoles(workspaceId) });
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
