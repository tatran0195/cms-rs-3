import type { HttpClient } from '../http';
import type { ProjectId, ProjectOpenApiConfigurationResponse, ProjectOpenApiValidationResponse } from '../types';

export class OpenApiResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Get OpenAPI configuration for a project
   */
  async getConfig<T = ProjectOpenApiConfigurationResponse>(projectId: ProjectId): Promise<T> {
    return this.http.get<T>(`/api/app/projects/${projectId}/openapi`);
  }

  /**
   * Save / upsert OpenAPI specification for a project
   */
  async upsert<T = unknown>(projectId: ProjectId, payload: unknown): Promise<T> {
    return this.http.put<T>(`/api/app/projects/${projectId}/openapi`, payload);
  }

  async upsertConfig<T = unknown>(projectId: ProjectId, payload: unknown): Promise<T> {
    return this.upsert<T>(projectId, payload);
  }

  /**
   * Sync OpenAPI specification from remote URL
   */
  async sync<T = unknown>(projectId: ProjectId): Promise<T> {
    return this.http.post<T>(`/api/app/projects/${projectId}/openapi/sync`);
  }

  /**
   * Delete OpenAPI configuration for a project
   */
  async delete<T = unknown>(projectId: ProjectId): Promise<T> {
    return this.http.delete<T>(`/api/app/projects/${projectId}/openapi`);
  }

  async deleteConfig<T = unknown>(projectId: ProjectId): Promise<T> {
    return this.delete<T>(projectId);
  }

  /**
   * Validate raw OpenAPI specification content
   */
  async validate(projectId: ProjectId, payload: { spec: string }): Promise<ProjectOpenApiValidationResponse> {
    return this.http.post<ProjectOpenApiValidationResponse>(`/api/app/projects/${projectId}/openapi/validate`, payload);
  }
}
