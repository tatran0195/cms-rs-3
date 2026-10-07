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
   * Update integration provider configuration
   */
  async update(projectId: ProjectId, providerId: string, payload: UpdateProjectIntegrationRequest): Promise<ProjectIntegrationResponse> {
    return this.http.patch<ProjectIntegrationResponse>(`/api/app/projects/${projectId}/integrations/${providerId}`, payload);
  }

  /**
   * Request confirmation token for integration deletion
   */
  async requestDeleteConfirmation(projectId: ProjectId, providerId: string): Promise<ProjectIntegrationConfirmationResponse> {
    return this.http.post<ProjectIntegrationConfirmationResponse>(`/api/app/projects/${projectId}/integrations/${providerId}/confirm-delete`);
  }

  /**
   * Delete integration provider
   */
  async delete(projectId: ProjectId, providerId: string, params?: { confirmationToken?: string }): Promise<DeleteProjectIntegrationResponse> {
    return this.http.delete<DeleteProjectIntegrationResponse>(`/api/app/projects/${projectId}/integrations/${providerId}`, params);
  }
}
