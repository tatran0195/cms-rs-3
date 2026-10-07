import type { HttpClient } from '../http';
import type {
  DeleteAudienceResponse,
  ProjectId,
  ProjectJwtTestResponse,
  ProjectReaderAccessResponse,
  ProjectReaderEmergencyRevokeResponse,
} from '../types';

export interface ProjectReaderInvitationResult {
  id?: string;
  email?: string;
  token?: string;
  activationUrl: string;
  activation_url?: string;
  audience_id?: string;
  [key: string]: unknown;
}

export class ReaderAccessResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Get reader access configuration and reader lists for a project
   */
  async get(projectId: ProjectId): Promise<ProjectReaderAccessResponse> {
    return this.http.get<ProjectReaderAccessResponse>(`/api/app/projects/${projectId}/reader-access`);
  }

  /**
   * Update project reader access mode (PUBLIC, WORKSPACE, READERS)
   */
  async updateMode(
    projectId: ProjectId,
    payload: { accessMode?: 'PUBLIC' | 'WORKSPACE' | 'READERS'; mode?: 'PUBLIC' | 'WORKSPACE' | 'READERS' } | unknown,
  ): Promise<ProjectReaderAccessResponse> {
    const raw = payload as Record<string, unknown>;
    const body = {
      mode: raw?.mode ?? raw?.accessMode,
      accessMode: raw?.accessMode ?? raw?.mode,
      ...raw,
    };
    return this.http.put<ProjectReaderAccessResponse>(`/api/app/projects/${projectId}/reader-access/mode`, body);
  }

  /**
   * Create a new reader audience
   */
  async createAudience(
    projectId: ProjectId,
    payload: { name: string; description?: string; pageIds?: Array<string | null> } | Record<string, unknown>,
  ): Promise<unknown> {
    return this.http.post(`/api/app/projects/${projectId}/reader-access/audiences`, payload);
  }

  /**
   * Delete reader audience
   */
  async deleteAudience(projectId: ProjectId, audienceId: string): Promise<DeleteAudienceResponse> {
    return this.http.delete<DeleteAudienceResponse>(`/api/app/projects/${projectId}/reader-access/audiences/${audienceId}`);
  }

  /**
   * Invite reader to project
   */
  async inviteReader<T = ProjectReaderInvitationResult>(
    projectId: ProjectId,
    payload: { email: string; name?: string | null; audienceIds?: string[] },
  ): Promise<T> {
    return this.http.post<T>(`/api/app/projects/${projectId}/reader-access/readers/invite`, payload);
  }

  /**
   * Revoke reader invitation or access
   */
  async revokeReader(projectId: ProjectId, readerId: string): Promise<unknown> {
    return this.http.post(`/api/app/projects/${projectId}/reader-access/readers/${readerId}/revoke`);
  }

  /**
   * Configure reader JWT authentication
   */
  async updateJwt(projectId: ProjectId, payload: Record<string, unknown>): Promise<unknown> {
    return this.http.put(`/api/app/projects/${projectId}/reader-access/jwt`, payload);
  }

  /**
   * Validate and test reader JWT token
   */
  async testJwt(projectId: ProjectId, payload: { token: string }): Promise<ProjectJwtTestResponse> {
    return this.http.post<ProjectJwtTestResponse>(`/api/app/projects/${projectId}/reader-access/jwt/test`, payload);
  }

  /**
   * Emergency revoke all readers and reader sessions
   */
  async emergencyRevoke(projectId: ProjectId): Promise<ProjectReaderEmergencyRevokeResponse> {
    return this.http.post<ProjectReaderEmergencyRevokeResponse>(`/api/app/projects/${projectId}/reader-access/emergency-revoke`);
  }
}
