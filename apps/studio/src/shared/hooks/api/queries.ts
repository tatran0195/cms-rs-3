import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import { getData } from './client-helpers';
import { queryKeys } from './query-keys';
import type { NotificationList } from './types';

// Re-export feature-owned queries for backward compatibility
export * from '../../../features/editor/services/editor-api';
export * from '../../../features/project-settings/services/settings-api';
export * from '../../../features/publishing/services/publishing-api';
export * from '../../../features/projects/services/projects-api';

export const useMembers = () =>
  useQuery({
    queryKey: queryKeys.members.all(),
    queryFn: async () => getData(await api.app.members.$get(), 'members'),
  });

export const useNotifications = (options?: { enabled?: boolean }) =>
  useQuery({
    queryKey: queryKeys.notifications.list(),
    enabled: options?.enabled ?? true,
    queryFn: async () => getData<NotificationList>(await api.app.notifications.$get({ query: {} }), 'notifications'),
  });

export const useUnreadNotificationCount = () =>
  useQuery({
    queryKey: queryKeys.notifications.unreadCount(),
    queryFn: async () => getData(await api.app.notifications['unread-count'].$get(), 'notifications'),
    refetchInterval: 30_000,
  });
