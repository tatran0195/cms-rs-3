import { useQuery } from '@tanstack/react-query';
import { cmsClient } from '../../services/cms-client';
import { queryKeys } from './query-keys';
import type { NotificationList } from './types';

// Re-export feature-owned queries for backward compatibility
export * from '../../../features/editor/services/editor-api';
export * from '../../../features/project-settings/services/settings-api';
export * from '../../../features/projects/services/projects-api';
export * from '../../../features/publishing/services/publishing-api';

export const useMembers = () =>
  useQuery({
    queryKey: queryKeys.members.all(),
    queryFn: async () => cmsClient.workspace.getMembers(),
  });

export const useNotifications = (options?: { enabled?: boolean }) =>
  useQuery({
    queryKey: queryKeys.notifications.list(),
    enabled: options?.enabled ?? true,
    queryFn: async () => cmsClient.notifications.list<NotificationList>(),
  });

export const useUnreadNotificationCount = () =>
  useQuery({
    queryKey: queryKeys.notifications.unreadCount(),
    queryFn: async () => cmsClient.notifications.getUnreadCount(),
    refetchInterval: 30_000,
  });
