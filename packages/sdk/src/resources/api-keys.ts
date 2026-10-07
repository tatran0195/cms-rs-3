import type { HttpClient } from '../http';
import type { ProjectId, ApiKeyResponse, CreateApiKeyRequest } from '../types';

export class ApiKeysResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List API keys for a project
   */
  async list(projectId: ProjectId): Promise<ApiKeyResponse[]> {
    return this.http.get<ApiKeyResponse[]>(`/api/app/projects/${projectId}/api-keys`);
  }

  /**
   * Create a new API key for a project
   */
  async create<T = unknown>(projectId: ProjectId, payload: CreateApiKeyRequest): Promise<T> {
    return this.http.post<T>(`/api/app/projects/${projectId}/api-keys`, payload);
  }

  /**
   * Rotate an existing API key
   */
  async rotate<T = unknown>(projectId: ProjectId, keyId: string, payload?: unknown): Promise<T> {
    return this.http.post<T>(`/api/app/projects/${projectId}/api-keys/${keyId}/rotate`, payload);
  }

  /**
   * Revoke/delete an API key
   */
  async revoke<T = unknown>(projectId: ProjectId, keyId: string): Promise<T> {
    return this.http.delete<T>(`/api/app/projects/${projectId}/api-keys/${keyId}`);
  }
}
