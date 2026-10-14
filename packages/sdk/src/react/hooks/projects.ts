import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCmsClient } from '../context';
import { queryKeys } from '../query-keys';

export const useProjects = (options?: { enabled?: boolean }) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: queryKeys.projects.all(),
    enabled: options?.enabled ?? true,
    queryFn: async () => client.projects.list(),
  });
};

export const useProject = (projectId: string | undefined, options?: { enabled?: boolean }) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: queryKeys.projects.detail(projectId ?? ''),
    enabled: Boolean(projectId) && (options?.enabled ?? true),
    queryFn: async () => {
      if (!projectId) throw new Error('projectId is required');
      return client.projects.get(projectId);
    },
  });
};

export const useProjectMembers = (projectId: string | undefined, options?: { enabled?: boolean }) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: queryKeys.members.forProject(projectId ?? ''),
    enabled: Boolean(projectId) && (options?.enabled ?? true),
    queryFn: async () => {
      if (!projectId) throw new Error('projectId is required');
      return client.projects.getMembers(projectId);
    },
  });
};

export const useCreateProject = () => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => client.projects.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.projects.all() }),
  });
};

export const useUpdateProject = (projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => client.projects.update(projectId, payload),
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
