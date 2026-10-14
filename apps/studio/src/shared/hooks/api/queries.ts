// Re-export feature-owned queries for backward compatibility
export * from '../../../features/editor/services/editor-api';
export * from '../../../features/project-settings/services/settings-api';
export * from '../../../features/projects/services/projects-api';
export * from '../../../features/publishing/services/publishing-api';

import {
  useMembers as useSdkMembers,
  useNotifications as useSdkNotifications,
  useUnreadNotificationCount,
} from '@cms/sdk/react';
import type { NotificationList } from './types';

export const useMembers = <T = any>() => useSdkMembers<T>();
export const useNotifications = (options?: { enabled?: boolean }) =>
  useSdkNotifications<NotificationList>(options);
export { useUnreadNotificationCount };

