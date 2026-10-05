import type {
  CreateProjectBody,
  InviteMemberBody,
  TransferOwnershipBody,
  UpdateMemberRoleBody,
  UpdateProjectBody,
} from '@cms/validators';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../shared/services/api';
import { getData, mutateData } from '../../../shared/hooks/api/client-helpers';
import { queryKeys } from '../../../shared/hooks/api/query-keys';
import type { Project } from '../../../shared/hooks/api/types';

export const useProjects = () =>
  useQuery({
    queryKey: queryKeys.projects.all(),
    queryFn: async () => getData<Project[]>(await api.app.projects.$get(), 'documentation sites'),
  });

export const useProject = (projectId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.projects.detail(projectId ?? ''),
    enabled: Boolean(projectId),
    queryFn: async () =>
      getData<Project>(
        await api.app.projects[':id'].$get({
          param: { id: projectId! },
        }),
        'project',
      ),
  });

export const useProjectMembers = (projectId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.members.forProject(projectId ?? ''),
    enabled: Boolean(projectId),
    queryFn: async () =>
      getData(await api.app.projects[':projectId'].members.$get({ param: { projectId: projectId! } }), 'members'),
  });

export const useCreateProject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateProjectBody) => mutateData<Project>(await api.app.projects.$post({ json: body }), 'Could not create the site.'),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.projects.all() }),
  });
};

export const useUpdateProject = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateProjectBody) =>
      mutateData<Project>(await api.app.projects[':id'].$patch({ param: { id: projectId }, json: body }), 'Could not update the site.'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.all() });
      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
    },
  });
};

export const useDeleteProject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: string) =>
      mutateData(await api.app.projects[':id'].$delete({ param: { id: projectId } }), 'Could not delete the site.'),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.projects.all() }),
  });
};

export const useInviteProjectMember = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: InviteMemberBody) =>
      mutateData(await api.app.projects[':projectId'].members.invite.$post({ param: { projectId }, json: body }), 'Could not send the invite.'),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members.forProject(projectId) }),
  });
};

export const useUpdateProjectMemberRole = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: UpdateMemberRoleBody }) =>
      mutateData(
        await api.app.projects[':projectId'].members[':id'].role.$patch({ param: { projectId, id }, json: body }),
        'Could not update the role.',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members.forProject(projectId) }),
  });
};

export const useTransferProjectOwnership = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: TransferOwnershipBody) =>
      mutateData(
        await api.app.projects[':projectId'].members.transfer.$post({
          param: { projectId },
          json: body,
        }),
        'Could not transfer ownership.',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members.forProject(projectId) }),
  });
};

export const useRemoveProjectMember = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      mutateData(await api.app.projects[':projectId'].members[':id'].$delete({ param: { projectId, id } }), 'Could not remove the member.'),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members.forProject(projectId) }),
  });
};

export const useCancelProjectInvitation = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      mutateData(
        await api.app.projects[':projectId'].members.invitations[':id'].$delete({ param: { projectId, id } }),
        'Could not revoke the invitation.',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members.forProject(projectId) }),
  });
};
