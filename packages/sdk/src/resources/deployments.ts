import type { HttpClient } from '../http';
import type {
  ProjectId,
  DeploymentId,
  DeploymentResponse,
  DeploymentListItem,
  DeploymentChangesResponse,
  CreateDeploymentRequest,
} from '../types';

export class DeploymentsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List deployments for a project
   */
  async list(projectId: ProjectId, params?: { limit?: number; offset?: number }): Promise<DeploymentListItem[]> {
    return this.http.get<DeploymentListItem[]>(`/api/app/projects/${projectId}/deployments`, params);
  }

  /**
   * Get single deployment status
   */
  async get(projectId: ProjectId, deploymentId: DeploymentId): Promise<DeploymentResponse> {
    return this.http.get<DeploymentResponse>(`/api/projects/${projectId}/deployments/${deploymentId}`);
  }

  /**
   * Preview pending changes before deploying
   */
  async getChanges(projectId: ProjectId): Promise<DeploymentChangesResponse> {
    return this.http.get<DeploymentChangesResponse>(`/api/app/projects/${projectId}/deployments/changes`);
  }

  /**
   * Trigger a new deployment release
   */
  async trigger(projectId: ProjectId, payload?: Partial<CreateDeploymentRequest> | { message?: string }): Promise<DeploymentResponse> {
    const body: Record<string, unknown> = {
      project_id: projectId,
      branch_id: (payload as Partial<CreateDeploymentRequest>)?.branch_id ?? null,
      ...payload,
    };
    return this.http.post<DeploymentResponse>(`/api/app/projects/${projectId}/deployments`, body);
  }

  /**
   * Force publish a new deployment bypassing warnings
   */
  async forcePublish(projectId: ProjectId, payload?: { message?: string }): Promise<DeploymentResponse> {
    return this.http.post<DeploymentResponse>(`/api/app/projects/${projectId}/deployments/force-publish`, payload);
  }

  /**
   * Rollback to a previous deployment
   */
  async rollback(projectId: ProjectId, deploymentId: DeploymentId): Promise<DeploymentResponse> {
    return this.http.post<DeploymentResponse>(`/api/app/projects/${projectId}/deployments/${deploymentId}/rollback`);
  }
}

