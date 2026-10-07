import type { HttpClient } from '../http';
import type { ProjectId } from '../types';

export class AddonsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List add-ons configured for a project
   */
  async list<T = unknown>(projectId: ProjectId): Promise<T[]> {
    return this.http.get<T[]>(`/api/app/projects/${projectId}/addons`);
  }

  /**
   * Update project add-on configuration
   */
  async update<T = unknown>(projectId: ProjectId, addonId: string, payload: unknown): Promise<T> {
    return this.http.patch<T>(`/api/app/projects/${projectId}/addons/${addonId}`, payload);
  }

  /**
   * Activate project add-on
   */
  async activate<T = unknown>(projectId: ProjectId, addonId: string, payload?: { expectedRevision?: number }): Promise<T> {
    return this.http.post<T>(`/api/app/projects/${projectId}/addons/${addonId}/activate`, payload);
  }

  /**
   * Deactivate project add-on
   */
  async deactivate<T = unknown>(projectId: ProjectId, addonId: string, payload?: { expectedRevision?: number }): Promise<T> {
    return this.http.post<T>(`/api/app/projects/${projectId}/addons/${addonId}/deactivate`, payload);
  }
}
