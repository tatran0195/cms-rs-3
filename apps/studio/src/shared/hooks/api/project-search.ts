import {
  searchConfigurationResultSchema,
  searchIndexDiagnosticsResultSchema,
  type UpdateProjectSearchConfigurationBody,
  updateProjectSearchConfigurationBody,
} from '@cms/validators';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cmsClient } from '../../services/cms-client';
import { queryKeys } from './query-keys';

export const useProjectSearchConfiguration = (projectId: string) =>
  useQuery({
    queryKey: queryKeys.projectSearch.configuration(projectId),
    queryFn: async () => {
      const data = await cmsClient.search.getSettings(projectId);
      return searchConfigurationResultSchema.parse(data);
    },
  });

export const useUpdateProjectSearchConfiguration = (projectId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateProjectSearchConfigurationBody) =>
      cmsClient.search.updateSettings(projectId, updateProjectSearchConfigurationBody.parse(body) as any),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.projectSearch.configuration(projectId), data);
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.site.shell(projectId) });
      queryClient.invalidateQueries({ queryKey: ['site', projectId, 'search'] });
    },
  });
};

export const useProjectSearchIndexDiagnostics = (projectId: string, cursor?: string, limit = 10) =>
  useQuery({
    queryKey: queryKeys.projectSearch.index(projectId, cursor, limit),
    queryFn: async () => {
      const data = await cmsClient.search.getDiagnostics(projectId, {
        limit: String(limit),
        ...(cursor ? { cursor } : {}),
      });
      return searchIndexDiagnosticsResultSchema.parse(data);
    },
    refetchInterval: (query) => (query.state.data?.health === 'indexing' ? 2000 : false),
  });

export const useCreateProjectSearchReindex = (projectId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => cmsClient.search.reindex(projectId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.projectSearch.allIndex(projectId) }),
  });
};
