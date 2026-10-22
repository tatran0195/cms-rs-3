import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Deployment, DeploymentBaselineResponse, PendingChangesResponse } from '../../types';
import { useCmsClient } from '../context';
import { queryKeys } from '../query-keys';

const isInFlight = (status?: string): boolean => status === 'PENDING' || status === 'BUILDING';

export const useDeployments = <T = Deployment>(projectId: string | undefined, options?: { enabled?: boolean; pollIntervalMs?: number }) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: queryKeys.deployments.all(projectId ?? ''),
    enabled: Boolean(projectId) && (options?.enabled ?? true),
    queryFn: async () => {
      if (!projectId) throw new Error('projectId is required');
      return (await client.deployments.list(projectId)) as unknown as T[];
    },
    refetchInterval: (query) =>
      Array.isArray(query.state.data) && query.state.data.some((d: any) => isInFlight(d?.status)) ? (options?.pollIntervalMs ?? 2500) : false,
  });
};

export const useBaselineSnapshot = <T = DeploymentBaselineResponse>(projectId: string | undefined, options?: { enabled?: boolean }) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: queryKeys.deployments.baseline(projectId ?? ''),
    enabled: Boolean(projectId) && (options?.enabled ?? true),
    staleTime: 60_000,
    queryFn: async () => {
      if (!projectId) throw new Error('projectId is required');
      return (await client.deployments.getBaseline(projectId)) as unknown as T;
    },
  });
};

export const usePendingChanges = <T = PendingChangesResponse>(
  projectId: string | undefined,
  options?: { enabled?: boolean; staleTime?: number },
) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: queryKeys.deployments.changes(projectId ?? ''),
    enabled: Boolean(projectId) && (options?.enabled ?? true),
    staleTime: options?.staleTime ?? 60_000,
    queryFn: async () => {
      if (!projectId) throw new Error('projectId is required');
      return (await client.deployments.getChanges(projectId)) as unknown as T;
    },
  });
};

export const usePublish = <T = any>(projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars?: { message?: string }) =>
      (await client.deployments.trigger(projectId, { message: vars?.message || undefined })) as unknown as T,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.deployments.all(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
    },
  });
};

export const usePublishAnyway = <T = any>(projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars?: { message?: string }) =>
      (await client.deployments.forcePublish(projectId, { message: vars?.message || undefined })) as unknown as T,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.deployments.all(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
    },
  });
};

export const useRollback = <T = any>(projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (deploymentId: string) => (await client.deployments.rollback(projectId, deploymentId)) as unknown as T,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.deployments.all(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
    },
  });
};
