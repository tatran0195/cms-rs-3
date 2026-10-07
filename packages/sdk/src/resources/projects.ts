import type { HttpClient } from '../http';
import type {
  ProjectId,
  ProjectResponse,
  CreateProjectRequest,
  UpdateProjectRequest,
  ProjectAnalyticsResponse,
  ProjectUsageTelemetryResponse,
  ProjectThemeTemplateResponse,
  ProjectThemeStyles,
  UpdateThemeRequest,
} from '../types';

export class ProjectsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List projects
   */
  async list(params?: { organizationId?: string; limit?: number; offset?: number }): Promise<ProjectResponse[]> {
    return this.http.get<ProjectResponse[]>('/api/projects', params);
  }

  /**
   * Get project by ID or slug
   */
  async get(id: ProjectId): Promise<ProjectResponse> {
    return this.http.get<ProjectResponse>(`/api/projects/${id}`);
  }

  /**
   * Create a new project
   */
  async create(payload: CreateProjectRequest): Promise<ProjectResponse> {
    return this.http.post<ProjectResponse>('/api/projects', payload);
  }

  /**
   * Update project details
   */
  async update(id: ProjectId, payload: UpdateProjectRequest): Promise<ProjectResponse> {
    return this.http.patch<ProjectResponse>(`/api/projects/${id}`, payload);
  }

  /**
   * Delete project
   */
  async delete(id: ProjectId): Promise<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`/api/projects/${id}`);
  }

  /**
   * Fetch project analytics
   */
  async getAnalytics(id: ProjectId, params?: { period?: string }): Promise<ProjectAnalyticsResponse> {
    return this.http.get<ProjectAnalyticsResponse>(`/api/app/projects/${id}/analytics`, params);
  }

  /**
   * Fetch internal operational telemetry metrics (ADR 001 compliant)
   */
  async getTelemetry(id: ProjectId): Promise<ProjectUsageTelemetryResponse> {
    return this.http.get<ProjectUsageTelemetryResponse>(`/api/app/projects/${id}/usage`);
  }

  /**
   * Get project theme template details
   */
  async getTheme(id: ProjectId): Promise<ProjectThemeTemplateResponse> {
    return this.http.get<ProjectThemeTemplateResponse>(`/api/app/projects/${id}/theme`);
  }

  /**
   * Update project theme configuration
   */
  async updateTheme(id: ProjectId, payload: UpdateThemeRequest): Promise<ProjectThemeStyles> {
    return this.http.patch<ProjectThemeStyles>(`/api/app/projects/${id}/theme`, payload);
  }
}
