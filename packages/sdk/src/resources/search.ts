import type { HttpClient } from '../http';
import type {
  ProjectId,
  SearchDiagnosticsResponse,
  SearchReindexResponse,
  SearchRequest,
  SearchResponse,
  SearchSettingsResponse,
  UpdateSearchSettingsRequest,
} from '../types';

export class SearchResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Search documents across full-text and semantic indices
   */
  async query(payload: SearchRequest): Promise<SearchResponse> {
    return this.http.post<SearchResponse>('/api/search', payload);
  }

  /**
   * Get search configuration and constraints for a project
   */
  async getSettings(projectId: ProjectId): Promise<SearchSettingsResponse> {
    return this.http.get<SearchSettingsResponse>(`/api/app/projects/${projectId}/settings/search`);
  }

  /**
   * Update search settings for a project
   */
  async updateSettings(projectId: ProjectId, payload: UpdateSearchSettingsRequest): Promise<SearchSettingsResponse> {
    return this.http.patch<SearchSettingsResponse>(`/api/app/projects/${projectId}/settings/search`, payload);
  }

  /**
   * Trigger full reindex of a project
   */
  async reindex(projectId: ProjectId): Promise<SearchReindexResponse> {
    return this.http.post<SearchReindexResponse>(`/api/app/projects/${projectId}/settings/search/reindex`);
  }

  /**
   * Get search diagnostics for a project
   */
  async getDiagnostics(projectId: ProjectId, params?: { limit?: string | number; cursor?: string }): Promise<SearchDiagnosticsResponse> {
    return this.http.get<SearchDiagnosticsResponse>(`/api/app/projects/${projectId}/settings/search/diagnostics`, params);
  }
}
