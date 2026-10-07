import type { HttpClient } from '../http';
import type {
  NotificationResponse,
  NotificationCountResponse,
  MarkNotificationReadRequest,
  MarkAllNotificationsReadRequest,
} from '../types';

export type UnreadCountResult = {
  count: number;
  unread: bigint | number;
  total?: bigint | number;
} & Partial<NotificationCountResponse>;

export class NotificationsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List notifications for current user
   */
  async list<T = { items: NotificationItemLike[]; nextCursor: string | null }>(
    params?: { unreadOnly?: boolean; limit?: number; offset?: number }
  ): Promise<T> {
    const res = await this.http.get<Record<string, unknown>>('/api/app/notifications', params);
    if ('items' in res) {
      return res as T;
    }
    const items = (res.notifications || res.data || []) as NotificationItemLike[];
    return {
      items,
      nextCursor: (res.nextCursor || res.next_cursor || null) as string | null,
    } as T;
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount<T = UnreadCountResult>(): Promise<T> {
    const res = await this.http.get<Record<string, unknown>>('/api/app/notifications/unread-count');
    const count = Number(res.count ?? res.unread ?? 0);
    return {
      count,
      unread: typeof res.unread === 'bigint' ? res.unread : BigInt(count),
      total: typeof res.total === 'bigint' ? res.total : BigInt(count),
      ...res,
    } as unknown as T;
  }

  /**
   * Mark notifications as read
   */
  async markRead(
    payload: MarkNotificationReadRequest | MarkAllNotificationsReadRequest | { ids?: string[]; all?: boolean }
  ): Promise<{ success: boolean }> {
    return this.http.post<{ success: boolean }>('/api/app/notifications/read', payload);
  }
}

export interface NotificationItemLike {
  id: string;
  projectId: string | null;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}
