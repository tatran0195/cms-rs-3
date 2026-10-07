import type { AnalyticsRange } from '@cms/validators';
import { useQuery } from '@tanstack/react-query';
import { cmsClient } from '../../../services/cms-client';
import { analyticsQueryKeys } from './query-keys';

const browserTimezoneFn = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export const useProjectAnalytics = (projectId: string | undefined, range: AnalyticsRange, options?: { enabled?: boolean; timezone?: string }) => {
  const timezone = options?.timezone ?? browserTimezoneFn();
  return useQuery({
    queryKey: analyticsQueryKeys.project(projectId ?? '', range, timezone),
    enabled: Boolean(projectId) && (options?.enabled ?? true),
    queryFn: async () =>
      cmsClient.projects.getAnalytics(projectId as string, {
        range,
        timezone,
      }),
  });
};

export const useWorkspaceAnalytics = (range: AnalyticsRange, options?: { enabled?: boolean; timezone?: string }) => {
  const timezone = options?.timezone ?? browserTimezoneFn();
  return useQuery({
    queryKey: analyticsQueryKeys.workspace(range, timezone),
    enabled: options?.enabled ?? true,
    queryFn: async () => cmsClient.workspace.getAnalytics({ range, timezone }),
  });
};
