import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCmsClient } from '../context';
import { queryKeys } from '../query-keys';

export const useProjects = <T = any>(options?: { enabled?: boolean }) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: queryKeys.projects.all(),
    enabled: options?.enabled ?? true,
    queryFn: async () => (await client.projects.list()) as unknown as T[],
  });
};

export const useProject = <T = any>(projectId: string | undefined, options?: { enabled?: boolean }) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: queryKeys.projects.detail(projectId ?? ''),
    enabled: Boolean(projectId) && (options?.enabled ?? true),
    queryFn: async () => {
      if (!projectId) throw new Error('projectId is required');
      return (await client.projects.get(projectId)) as unknown as T;
    },
  });
};

export const useProjectMembers = <T = any>(projectId: string | undefined, options?: { enabled?: boolean }) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: queryKeys.members.forProject(projectId ?? ''),
    enabled: Boolean(projectId) && (options?.enabled ?? true),
    queryFn: async () => {
      if (!projectId) throw new Error('projectId is required');
      return (await client.projects.getMembers(projectId)) as unknown as T;
    },
  });
};

export const useCreateProject = <T = any, TBody = any>() => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TBody) => (await client.projects.create(payload as any)) as unknown as T,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.projects.all() }),
  });
};

export const useUpdateProject = <T = any, TBody = any>(projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TBody) => (await client.projects.update(projectId, payload as any)) as unknown as T,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.all() });
      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
    },
  });
};

export const useDeleteProject = () => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: string) => client.projects.delete(projectId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.projects.all() }),
  });
};

export const useInviteProjectMember = (projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: any) => client.projects.inviteMember(projectId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members.forProject(projectId) }),
  });
};

export const useUpdateProjectMemberRole = (projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: any }) => client.projects.updateMemberRole(projectId, id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members.forProject(projectId) }),
  });
};

export const useTransferProjectOwnership = (projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: any) => client.projects.transferOwnership(projectId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members.forProject(projectId) }),
  });
};

export const useRemoveProjectMember = (projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => client.projects.removeMember(projectId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members.forProject(projectId) }),
  });
};

export const useCancelProjectInvitation = (projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => client.projects.cancelInvitation(projectId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members.forProject(projectId) }),
  });
};
