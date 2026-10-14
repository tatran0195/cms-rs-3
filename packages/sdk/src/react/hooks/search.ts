import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCmsClient } from '../context';
import { queryKeys } from '../query-keys';

export const useProjectSearchConfiguration = <T = any>(projectId: string) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: queryKeys.projectSearch.configuration(projectId),
    queryFn: async () => (await client.search.getSettings(projectId)) as unknown as T,
  });
};

export const useUpdateProjectSearchConfiguration = <T = any>(projectId: string) => {
  const client = useCmsClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: any) => (await client.search.updateSettings(projectId, body)) as unknown as T,
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.projectSearch.configuration(projectId), data);
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.site.shell(projectId) });
      queryClient.invalidateQueries({ queryKey: ['site', projectId, 'search'] });
    },
  });
};

export const useProjectSearchIndexDiagnostics = <T = any>(projectId: string, cursor?: string, limit = 10) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: queryKeys.projectSearch.index(projectId, cursor, limit),
    queryFn: async () => {
      const data = await client.search.getDiagnostics(projectId, {
        limit: String(limit),
        ...(cursor ? { cursor } : {}),
      });
      return data as unknown as T;
    },
    refetchInterval: (query: any) => (query.state.data?.health === 'indexing' ? 2000 : false),
  });
};

export const useCreateProjectSearchReindex = (projectId: string) => {
  const client = useCmsClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => client.search.reindex(projectId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.projectSearch.allIndex(projectId) }),
  });
};
