import type { HttpClient } from '../http';
import type {
  ProjectId,
  BranchId,
  BranchResponse,
  CreateBranchRequest,
  UpdateBranchRequest,
} from '../types';

export class BranchesResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List branches for a project
   */
  async list(projectId: ProjectId): Promise<BranchResponse[]> {
    return this.http.get<BranchResponse[]>(`/api/projects/${projectId}/branches`);
  }

  /**
   * Get single branch by ID
   */
  async get(projectId: ProjectId, branchId: BranchId): Promise<BranchResponse> {
    return this.http.get<BranchResponse>(`/api/projects/${projectId}/branches/${branchId}`);
  }

  /**
   * Create a new branch
   */
  async create(projectId: ProjectId, payload: CreateBranchRequest): Promise<BranchResponse> {
    return this.http.post<BranchResponse>(`/api/projects/${projectId}/branches`, payload);
  }

  /**
   * Update a branch
   */
  async update(projectId: ProjectId, branchId: BranchId, payload: UpdateBranchRequest): Promise<BranchResponse> {
    return this.http.patch<BranchResponse>(`/api/projects/${projectId}/branches/${branchId}`, payload);
  }

  /**
   * Delete a branch
   */
  async delete(projectId: ProjectId, branchId: BranchId): Promise<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`/api/projects/${projectId}/branches/${branchId}`);
  }

  /**
   * Merge preview branch into primary
   */
  async merge<T = { success: boolean }>(projectId: ProjectId, branchId: BranchId): Promise<T> {
    return this.http.post<T>(`/api/app/projects/${projectId}/branches/${branchId}/merge`);
  }
}

