import type { CreateProjectBody, InviteMemberBody, TransferOwnershipBody, UpdateMemberRoleBody, UpdateProjectBody } from '@cms/validators';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../shared/hooks/api/query-keys';
import type { Project } from '../../../shared/hooks/api/types';
import { cmsClient } from '../../../shared/services/cms-client';

export const useProjects = () =>
  useQuery({
    queryKey: queryKeys.projects.all(),
    queryFn: async () => (await cmsClient.projects.list()) as unknown as Project[],
  });

export const useProject = (projectId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.projects.detail(projectId ?? ''),
    enabled: Boolean(projectId),
    queryFn: async () => {
      if (!projectId) throw new Error('projectId is required');
      return (await cmsClient.projects.get(projectId)) as unknown as Project;
    },
  });

export const useProjectMembers = (projectId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.members.forProject(projectId ?? ''),
    enabled: Boolean(projectId),
    queryFn: async () => {
      if (!projectId) throw new Error('projectId is required');
      return cmsClient.projects.getMembers(projectId);
    },
  });

export const useCreateProject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateProjectBody) => (await cmsClient.projects.create(body)) as unknown as Project,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.projects.all() }),
  });
};

export const useUpdateProject = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateProjectBody) => (await cmsClient.projects.update(projectId, body)) as unknown as Project,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.all() });
      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
    },
  });
};

export const useDeleteProject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: string) => cmsClient.projects.delete(projectId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.projects.all() }),
  });
};

export const useInviteProjectMember = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: InviteMemberBody) => cmsClient.projects.inviteMember(projectId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members.forProject(projectId) }),
  });
};

export const useUpdateProjectMemberRole = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: UpdateMemberRoleBody }) => cmsClient.projects.updateMemberRole(projectId, id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members.forProject(projectId) }),
  });
};

export const useTransferProjectOwnership = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: TransferOwnershipBody) => cmsClient.projects.transferOwnership(projectId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members.forProject(projectId) }),
  });
};

export const useRemoveProjectMember = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => cmsClient.projects.removeMember(projectId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members.forProject(projectId) }),
  });
};

export const useCancelProjectInvitation = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => cmsClient.projects.cancelInvitation(projectId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members.forProject(projectId) }),
  });
};
