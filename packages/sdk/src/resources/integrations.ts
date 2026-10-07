import type { HttpClient } from '../http';
import type {
  ProjectId,
  ProjectIntegrationCatalogItem,
  ProjectIntegrationResponse,
  UpdateProjectIntegrationRequest,
  DeleteProjectIntegrationResponse,
  ProjectIntegrationConfirmationResponse,
} from '../types';

export class IntegrationsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List integration catalog items for a project
   */
  async list(projectId: ProjectId): Promise<ProjectIntegrationCatalogItem[]> {
    return this.http.get<ProjectIntegrationCatalogItem[]>(`/api/app/projects/${projectId}/integrations`);
  }

  /**
   * Create integration provider configuration
   */
  async create<T = unknown>(projectId: ProjectId, payload: unknown): Promise<T> {
    return this.http.post<T>(`/api/app/projects/${projectId}/integrations`, payload);
  }

  /**
   * Update integration provider configuration
   */
  async update<T = unknown>(projectId: ProjectId, providerId: string, payload: unknown): Promise<T> {
    return this.http.patch<T>(`/api/app/projects/${projectId}/integrations/${providerId}`, payload);
  }

  /**
   * Activate integration provider
   */
  async activate<T = unknown>(projectId: ProjectId, providerId: string, payload: unknown): Promise<T> {
    return this.http.post<T>(`/api/app/projects/${projectId}/integrations/${providerId}/activate`, payload);
  }

  /**
   * Deactivate integration provider
   */
  async deactivate<T = unknown>(projectId: ProjectId, providerId: string, payload: unknown): Promise<T> {
    return this.http.post<T>(`/api/app/projects/${projectId}/integrations/${providerId}/deactivate`, payload);
  }

  /**
   * Verify integration provider
   */
  async verify<T = unknown>(projectId: ProjectId, providerId: string, payload: unknown): Promise<T> {
    return this.http.post<T>(`/api/app/projects/${projectId}/integrations/${providerId}/verify`, payload);
  }

  /**
   * Request confirmation token for integration deletion
   */
  async requestDeleteConfirmation(projectId: ProjectId, providerId: string, payload?: unknown): Promise<ProjectIntegrationConfirmationResponse> {
    return this.http.post<ProjectIntegrationConfirmationResponse>(
      `/api/app/projects/${projectId}/integrations/${providerId}/delete-confirmation`,
      payload
    );
  }

  /**
   * Delete integration provider
   */
  async delete(
    projectId: ProjectId,
    providerId: string,
    options?: { confirmationToken?: string } | { json?: unknown }
  ): Promise<DeleteProjectIntegrationResponse> {
    const json = (options && 'json' in options) ? options.json : (options && 'confirmationToken' in options) ? { confirmationToken: options.confirmationToken } : undefined;
    return this.http.request<DeleteProjectIntegrationResponse>(`/api/app/projects/${projectId}/integrations/${providerId}`, {
      method: 'DELETE',
      json,
    });
  }
}

