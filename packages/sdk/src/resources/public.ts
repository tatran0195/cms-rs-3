import type { HttpClient } from '../http';
import type { ProjectId } from '../types';

export interface PublicInstanceMeta {
  providers: {
    google?: boolean;
    github?: boolean;
    [key: string]: boolean | undefined;
  };
  signupDisabled?: boolean;
  version?: string;
  [key: string]: unknown;
}

export interface PublicInvitationInfo {
  id: string;
  email: string;
  organizationName?: string;
  expired?: boolean;
  role?: string;
  [key: string]: unknown;
}

export class PublicResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Get public instance metadata
   */
  async getMeta<T = PublicInstanceMeta>(): Promise<T> {
    return this.http.get<T>('/api/public/meta');
  }

  /**
   * Get public invitation details
   */
  async getInvitation<T = PublicInvitationInfo>(invitationId: string): Promise<T> {
    return this.http.get<T>(`/api/public/invitations/${invitationId}`);
  }

  /**
   * Get reader documentation site shell
   */
  async getSite<T = unknown>(projectId: ProjectId, params?: { lang?: string; version?: string }): Promise<T> {
    return this.http.get<T>(`/api/public/sites/${projectId}`, params);
  }

  /**
   * Get reader documentation page content
   */
  async getPage<T = unknown>(projectId: ProjectId, params: { path: string; lang?: string; version?: string }): Promise<T> {
    return this.http.get<T>(`/api/public/sites/${projectId}/page`, params);
  }

  /**
   * Get reader changelog entries
   */
  async getChangelog<T = unknown>(projectId: ProjectId): Promise<T[]> {
    return this.http.get<T[]>(`/api/public/sites/${projectId}/changelog`);
  }

  /**
   * Get Git PR preview
   */
  async getGitPreview<T = unknown>(token: string): Promise<T> {
    return this.http.get<T>(`/api/public/git/previews/${token}`);
  }

  /**
   * Search site content
   */
  async search<T = unknown>(projectId: ProjectId, params: { q: string; lang?: string; version?: string; limit?: string }): Promise<{ hits: T[] }> {
    return this.http.get<{ hits: T[] }>(`/api/public/sites/${projectId}/search`, params);
  }

  /**
   * Ask Q&A question on site documentation
   */
  async answer<T = unknown>(
    projectId: ProjectId,
    payload: { question?: string; q?: string; query?: string; lang?: string; version?: string },
  ): Promise<T> {
    return this.http.post<T>(`/api/public/sites/${projectId}/answer`, payload);
  }

  /**
   * Record reader site telemetry/analytics event
   */
  async recordEvent(projectId: ProjectId, payload: unknown): Promise<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`/api/public/sites/${projectId}/events`, payload);
  }
}
