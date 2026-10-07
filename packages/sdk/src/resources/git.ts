import type { HttpClient } from '../http';
import type {
  ProjectId,
  ProjectGitWorkflowStatus,
  GitConnectionResponse,
  CreateGitConnectionRequest,
  WebhookSecretRotateResponse,
} from '../types';

export class GitResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Get project Git workflow and synchronization status
   */
  async getStatus(projectId: ProjectId): Promise<ProjectGitWorkflowStatus> {
    return this.http.get<ProjectGitWorkflowStatus>(`/api/app/projects/${projectId}/git/workflow`);
  }

  /**
   * Connect project to Git repository
   */
  async connect(projectId: ProjectId, payload: CreateGitConnectionRequest): Promise<GitConnectionResponse> {
    return this.http.post<GitConnectionResponse>(`/api/app/projects/${projectId}/git/connect`, payload);
  }

  /**
   * Disconnect project from Git
   */
  async disconnect(projectId: ProjectId): Promise<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`/api/app/projects/${projectId}/git/disconnect`);
  }

  /**
   * Rotate inbound webhook secret for Git pushes
   */
  async rotateWebhookSecret(projectId: ProjectId): Promise<WebhookSecretRotateResponse> {
    return this.http.post<WebhookSecretRotateResponse>(`/api/app/projects/${projectId}/git/rotate-secret`);
  }
}
