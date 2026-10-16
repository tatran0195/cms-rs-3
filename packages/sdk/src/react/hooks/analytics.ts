import { useQuery } from '@tanstack/react-query';
import { useCmsClient } from '../context';

const browserTimezoneFn = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
};

export const analyticsQueryKeys = {
  project: (projectId: string, range: string, timezone: string) => ['analytics', 'project', projectId, range, timezone] as const,
  workspace: (range: string, timezone: string) => ['analytics', 'workspace', range, timezone] as const,
};

export const useProjectAnalytics = <T = any>(projectId: string | undefined, range: string, options?: { enabled?: boolean; timezone?: string }) => {
  const client = useCmsClient();
  const timezone = options?.timezone ?? browserTimezoneFn();
  return useQuery({
    queryKey: analyticsQueryKeys.project(projectId ?? '', range, timezone),
    enabled: Boolean(projectId) && (options?.enabled ?? true),
    queryFn: async () => {
      if (!projectId) throw new Error('projectId is required');
      return (await client.projects.getAnalytics(projectId, {
        range,
        timezone,
      })) as unknown as T;
    },
  });
};

export const useWorkspaceAnalytics = <T = any>(range: string, options?: { enabled?: boolean; timezone?: string }) => {
  const client = useCmsClient();
  const timezone = options?.timezone ?? browserTimezoneFn();
  return useQuery({
    queryKey: analyticsQueryKeys.workspace(range, timezone),
    enabled: options?.enabled ?? true,
    queryFn: async () => (await client.workspace.getAnalytics({ range, timezone })) as unknown as T,
  });
};
