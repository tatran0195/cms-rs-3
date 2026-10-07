import type { HttpClient } from '../http';
import type {
  ProjectId,
  PageId,
  PageResponse,
  PageListItem,
  PageTreeNode,
  CreatePageRequest,
  UpdatePageRequest,
} from '../types';

export class PagesResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List pages for a project (optionally filtered by branch or language)
   */
  async list(projectId: ProjectId, params?: { branchId?: string; languageId?: string; limit?: number; offset?: number }): Promise<PageListItem[]> {
    return this.http.get<PageListItem[]>(`/api/projects/${projectId}/pages`, params);
  }

  /**
   * Get hierarchical page tree for editor sidebar
   */
  async getTree(projectId: ProjectId, params?: { branchId?: string; languageId?: string }): Promise<PageTreeNode[]> {
    return this.http.get<PageTreeNode[]>(`/api/projects/${projectId}/pages/tree`, params);
  }

  /**
   * Get single page by ID
   */
  async get(projectId: ProjectId, id: PageId): Promise<PageResponse> {
    return this.http.get<PageResponse>(`/api/projects/${projectId}/pages/${id}`);
  }

  /**
   * Create a new page
   */
  async create(projectId: ProjectId, payload: CreatePageRequest): Promise<PageResponse> {
    return this.http.post<PageResponse>(`/api/projects/${projectId}/pages`, payload);
  }

  /**
   * Update page content or metadata
   */
  async update(projectId: ProjectId, id: PageId, payload: UpdatePageRequest): Promise<PageResponse> {
    return this.http.patch<PageResponse>(`/api/projects/${projectId}/pages/${id}`, payload);
  }

  /**
   * Delete a page
   */
  async delete(projectId: ProjectId, id: PageId): Promise<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`/api/projects/${projectId}/pages/${id}`);
  }

  /**
   * Reorder page tree hierarchy
   */
  async reorder<T = { success: boolean }>(
    projectId: ProjectId,
    payload: { items: Array<{ id: string; parentId: string | null; position: number }> }
  ): Promise<T> {
    return this.http.post<T>(`/api/app/projects/${projectId}/pages/reorder`, payload);
  }
}

