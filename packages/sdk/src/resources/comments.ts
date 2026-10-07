import type { HttpClient } from '../http';
import type { CreateCommentRequest, ProjectCommentResponse, ProjectId, UpdateCommentRequest } from '../types';

export class CommentsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List comments for a page or project
   */
  async list(projectId: ProjectId, params?: { pageId?: string; resolved?: boolean }): Promise<ProjectCommentResponse[]> {
    return this.http.get<ProjectCommentResponse[]>(`/api/app/projects/${projectId}/comments`, params);
  }

  /**
   * Create a new comment
   */
  async create(projectId: ProjectId, payload: CreateCommentRequest | Record<string, unknown>): Promise<ProjectCommentResponse> {
    return this.http.post<ProjectCommentResponse>(`/api/app/projects/${projectId}/comments`, payload);
  }

  /**
   * Update or resolve comment
   */
  async update(projectId: ProjectId, commentId: string, payload: UpdateCommentRequest | Record<string, unknown>): Promise<ProjectCommentResponse> {
    return this.http.patch<ProjectCommentResponse>(`/api/app/projects/${projectId}/comments/${commentId}`, payload);
  }

  /**
   * Resolve comment
   */
  async resolve(
    projectId: ProjectId,
    commentId: string,
    payload: UpdateCommentRequest = { resolved: true, content: null },
  ): Promise<ProjectCommentResponse> {
    return this.update(projectId, commentId, payload);
  }

  /**
   * Delete comment
   */
  async delete(projectId: ProjectId, commentId: string): Promise<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`/api/app/projects/${projectId}/comments/${commentId}`);
  }
}
