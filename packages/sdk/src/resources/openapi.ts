import type { HttpClient } from '../http';
import type {
  ProjectId,
  ProjectOpenApiConfigurationResponse,
  ProjectOpenApiValidationResponse,
} from '../types';

export class OpenApiResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Get OpenAPI configuration for a project
   */
  async getConfig(projectId: ProjectId): Promise<ProjectOpenApiConfigurationResponse> {
    return this.http.get<ProjectOpenApiConfigurationResponse>(`/api/app/projects/${projectId}/openapi/config`);
  }

  /**
   * Validate raw OpenAPI specification content
   */
  async validate(projectId: ProjectId, payload: { spec: string }): Promise<ProjectOpenApiValidationResponse> {
    return this.http.post<ProjectOpenApiValidationResponse>(`/api/app/projects/${projectId}/openapi/validate`, payload);
  }
}
