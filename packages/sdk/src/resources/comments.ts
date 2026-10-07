import type { HttpClient } from '../http';
import type {
  ProjectId,
  CreateCommentRequest,
  UpdateCommentRequest,
  ProjectCommentResponse,
} from '../types';

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
  async create(projectId: ProjectId, payload: CreateCommentRequest): Promise<ProjectCommentResponse> {
    return this.http.post<ProjectCommentResponse>(`/api/app/projects/${projectId}/comments`, payload);
  }

  /**
   * Update or resolve comment
   */
  async update(projectId: ProjectId, commentId: string, payload: UpdateCommentRequest): Promise<ProjectCommentResponse> {
    return this.http.patch<ProjectCommentResponse>(`/api/app/projects/${projectId}/comments/${commentId}`, payload);
  }

  /**
   * Delete comment
   */
  async delete(projectId: ProjectId, commentId: string): Promise<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`/api/app/projects/${projectId}/comments/${commentId}`);
  }
}
