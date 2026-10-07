import type { HttpClient } from '../http';
import type { CreateLanguageRequest, LanguageId, LanguageResponse, ProjectId, UpdateLanguageRequest } from '../types';

export class LanguagesResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List languages configured for a project
   */
  async list(projectId: ProjectId): Promise<LanguageResponse[]> {
    return this.http.get<LanguageResponse[]>(`/api/projects/${projectId}/languages`);
  }

  /**
   * Get single language by ID
   */
  async get(projectId: ProjectId, languageId: LanguageId): Promise<LanguageResponse> {
    return this.http.get<LanguageResponse>(`/api/projects/${projectId}/languages/${languageId}`);
  }

  /**
   * Add a language to a project
   */
  async create(projectId: ProjectId, payload: CreateLanguageRequest): Promise<LanguageResponse> {
    return this.http.post<LanguageResponse>(`/api/projects/${projectId}/languages`, payload);
  }

  /**
   * Update a project language configuration
   */
  async update(projectId: ProjectId, languageId: LanguageId, payload: UpdateLanguageRequest): Promise<LanguageResponse> {
    return this.http.patch<LanguageResponse>(`/api/projects/${projectId}/languages/${languageId}`, payload);
  }

  /**
   * Remove a language from a project
   */
  async delete(projectId: ProjectId, languageId: LanguageId): Promise<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`/api/projects/${projectId}/languages/${languageId}`);
  }
}
