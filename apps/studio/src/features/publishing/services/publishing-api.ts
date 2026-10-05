import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../shared/services/api';
import { getData, mutateData } from '../../../shared/hooks/api/client-helpers';
import { queryKeys } from '../../../shared/hooks/api/query-keys';
import type { Deployment } from '../../../shared/hooks/api/types';

const isInFlight = (status?: string): boolean => status === 'PENDING' || status === 'BUILDING';

export const useDeployments = (projectId: string | undefined, options?: { enabled?: boolean; pollIntervalMs?: number }) =>
  useQuery({
    queryKey: queryKeys.deployments.all(projectId ?? ''),
    enabled: Boolean(projectId) && (options?.enabled ?? true),
    queryFn: async () =>
      getData<Deployment[]>(
        await api.app.projects[':projectId'].deployments.$get({ param: { projectId: projectId! } }),
        'deployments',
      ),
    refetchInterval: (query) => (query.state.data?.some((d) => isInFlight(d.status)) ? (options?.pollIntervalMs ?? 2500) : false),
  });

export const usePendingChanges = (projectId: string | undefined, options?: { enabled?: boolean }) =>
  useQuery({
    queryKey: queryKeys.deployments.changes(projectId ?? ''),
    enabled: Boolean(projectId) && (options?.enabled ?? true),
    staleTime: 0,
    queryFn: async () =>
      getData(
        await api.app.projects[':projectId'].deployments.changes.$get({ param: { projectId: projectId! } }),
        'changes',
      ),
  });

export const usePublish = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars?: { message?: string }) =>
      mutateData<Deployment>(
        await api.app.projects[':projectId'].deployments.$post({
          param: { projectId },
          json: { message: vars?.message || undefined },
        }),
        'Could not start deployment.',
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.deployments.all(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
    },
  });
};

export const usePublishAnyway = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars?: { message?: string }) =>
      mutateData<Deployment>(
        await api.app.projects[':projectId'].deployments['force-publish'].$post({
          param: { projectId },
          json: { message: vars?.message || undefined },
        }),
        'Could not force publish.',
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.deployments.all(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
    },
  });
};

export const useRollback = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (deploymentId: string) =>
      mutateData<Deployment>(
        await api.app.projects[':projectId'].deployments[':id'].rollback.$post({
          param: { projectId, id: deploymentId },
        }),
        'Could not rollback.',
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.deployments.all(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
    },
  });
};
