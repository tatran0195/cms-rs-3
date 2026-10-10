import type { HttpClient } from '../http';
import type { WorkspaceMembersResponse, WorkspaceSettingsResponse } from '../types';

export interface WorkspaceAnalyticsData {
  availability: string;
  totalViews: number;
  uniqueVisitors: number;
  viewsPreviousPeriod: number;
  visitorsPreviousPeriod: number;
  viewsChangePct: number;
  visitorsChangePct: number;
  avgDurationSeconds: number;
  timeseries: Array<{ date: string; views: number; [key: string]: unknown }>;
  byProject?: Array<{ projectId: string; views: number; [key: string]: unknown }>;
  topPages?: unknown[];
  topReferrers?: unknown[];
  topCountries?: unknown[];
  topSearches?: unknown[];
  [key: string]: unknown;
}

export class WorkspaceResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Get workspace details
   */
  async get<T = WorkspaceSettingsResponse>(): Promise<T> {
    return this.http.get<T>('/api/app/workspace');
  }

  /**
   * Update workspace settings
   */
  async update<T = unknown>(payload: unknown): Promise<T> {
    return this.http.patch<T>('/api/app/workspace', payload);
  }

  /**
   * Get workspace team members
   */
  async getMembers<T = WorkspaceMembersResponse>(): Promise<T> {
    return this.http.get<T>('/api/app/members');
  }

  /**
   * Invite member to workspace
   */
  async inviteMember<T = unknown>(payload: unknown): Promise<T> {
    return this.http.post<T>('/api/app/members/invite', payload);
  }

  /**
   * Update workspace member role
   */
  async updateMemberRole<T = unknown>(id: string, payload: unknown): Promise<T> {
    return this.http.patch<T>(`/api/app/members/${id}/role`, payload);
  }

  /**
   * Remove member from workspace
   */
  async removeMember<T = unknown>(id: string): Promise<T> {
    return this.http.delete<T>(`/api/app/members/${id}`);
  }

  /**
   * Get cross-project workspace analytics overview
   */
  async getAnalytics<T = WorkspaceAnalyticsData>(params?: { period?: string; range?: string; timezone?: string }): Promise<T> {
    return this.http.get<T>('/api/app/workspace/analytics', params);
  }

  /**
   * Transfer workspace ownership to another member
   */
  async transferOwnership<T = { success: boolean; id: string }>(memberId: string): Promise<T> {
    return this.http.post<T>('/api/app/workspace/transfer-ownership', { memberId });
  }

  /**
   * Delete current workspace
   */
  async delete<T = { success: boolean; id: string }>(): Promise<T> {
    return this.http.delete<T>('/api/app/workspace');
  }
}
