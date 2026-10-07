import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../shared/hooks/api/query-keys';
import type { Deployment, PendingChange } from '../../../shared/hooks/api/types';
import { cmsClient } from '../../../shared/services/cms-client';

export interface RedirectIssue {
  code: string;
  rowIndexes: number[];
  sequence: string[];
  message: string;
}

export interface PendingChangesResponse {
  changes: PendingChange[];
  hasBaseline?: boolean;
  lastVersion?: number;
  redirectIssues?: RedirectIssue[];
}

const isInFlight = (status?: string): boolean => status === 'PENDING' || status === 'BUILDING';

export const useDeployments = (projectId: string | undefined, options?: { enabled?: boolean; pollIntervalMs?: number }) =>
  useQuery({
    queryKey: queryKeys.deployments.all(projectId ?? ''),
    enabled: Boolean(projectId) && (options?.enabled ?? true),
    queryFn: async () => (await cmsClient.deployments.list(projectId!)) as unknown as Deployment[],
    refetchInterval: (query) => (query.state.data?.some((d) => isInFlight(d.status)) ? (options?.pollIntervalMs ?? 2500) : false),
  });

export const usePendingChanges = (projectId: string | undefined, options?: { enabled?: boolean }) =>
  useQuery({
    queryKey: queryKeys.deployments.changes(projectId ?? ''),
    enabled: Boolean(projectId) && (options?.enabled ?? true),
    staleTime: 0,
    queryFn: async () => (await cmsClient.deployments.getChanges(projectId!)) as unknown as PendingChangesResponse,
  });

export const usePublish = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars?: { message?: string }) =>
      (await cmsClient.deployments.trigger(projectId, { message: vars?.message || undefined })) as unknown as Deployment,
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
      (await cmsClient.deployments.forcePublish(projectId, { message: vars?.message || undefined })) as unknown as Deployment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.deployments.all(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
    },
  });
};

export const useRollback = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (deploymentId: string) => (await cmsClient.deployments.rollback(projectId, deploymentId)) as unknown as Deployment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.deployments.all(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
    },
  });
};
