import type { HttpClient } from '../http';
import type { ProjectGitWorkflowStatus, ProjectId, WebhookSecretRotateResponse } from '../types';

export interface GitIdentity {
  login: string;
  name: string | null;
  [key: string]: unknown;
}

export interface GitConnectionResult {
  id?: string;
  repo?: string;
  baseBranch?: string;
  headBranch?: string;
  contentPath?: string;
  webhookSecret?: string | null;
  [key: string]: unknown;
}

export class GitResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Get project Git workflow and synchronization status
   */
  async getStatus(projectId: ProjectId): Promise<ProjectGitWorkflowStatus> {
    return this.http.get<ProjectGitWorkflowStatus>(`/api/app/projects/${projectId}/git`);
  }

  /**
   * Authorize GitHub token for project
   */
  async authorize<T = GitIdentity>(projectId: ProjectId, payload: { token: string }): Promise<T> {
    return this.http.post<T>(`/api/app/projects/${projectId}/git/authorize`, payload);
  }

  /**
   * Connect project to Git repository
   */
  async connect<T = GitConnectionResult>(projectId: ProjectId, payload: unknown): Promise<T> {
    return this.http.put<T>(`/api/app/projects/${projectId}/git/connection`, payload);
  }

  /**
   * Disconnect project from Git
   */
  async disconnect(projectId: ProjectId): Promise<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`/api/app/projects/${projectId}/git/connection`);
  }

  /**
   * Queue Git synchronization operation
   */
  async queueOperation<T = unknown>(projectId: ProjectId, payload: unknown): Promise<T> {
    return this.http.post<T>(`/api/app/projects/${projectId}/git/operations`, payload);
  }

  /**
   * Resolve Git merge conflict
   */
  async resolveConflict<T = unknown>(projectId: ProjectId, conflictId: string, payload: unknown): Promise<T> {
    return this.http.post<T>(`/api/app/projects/${projectId}/git/conflicts/${conflictId}/resolve`, payload);
  }

  /**
   * Rotate inbound webhook secret for Git pushes
   */
  async rotateWebhookSecret(projectId: ProjectId): Promise<WebhookSecretRotateResponse> {
    return this.http.post<WebhookSecretRotateResponse>(`/api/app/projects/${projectId}/git/webhook-secret`);
  }
}
