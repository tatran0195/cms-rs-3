import type { HttpClient } from '../http';
import type {
  ProjectId,
  DomainId,
  SpaDomainResponse,
  AddProjectDomainRequest,
  DeleteDomainResponse,
} from '../types';

export class DomainsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List custom domains for a project
   */
  async list(projectId: ProjectId): Promise<SpaDomainResponse[]> {
    return this.http.get<SpaDomainResponse[]>(`/api/app/projects/${projectId}/domains`);
  }

  /**
   * Add a custom domain to a project
   */
  async add(projectId: ProjectId, payload: AddProjectDomainRequest): Promise<SpaDomainResponse> {
    return this.http.post<SpaDomainResponse>(`/api/app/projects/${projectId}/domains`, payload);
  }

  /**
   * Delete a custom domain from a project
   */
  async delete(projectId: ProjectId, domainId: DomainId): Promise<DeleteDomainResponse> {
    return this.http.delete<DeleteDomainResponse>(`/api/app/projects/${projectId}/domains/${domainId}`);
  }

  /**
   * Verify domain DNS records
   */
  async verify<T = SpaDomainResponse>(projectId: ProjectId, domainId: DomainId): Promise<T> {
    return this.http.post<T>(`/api/app/projects/${projectId}/domains/${domainId}/verify`);
  }

  /**
   * Set domain as primary for project
   */
  async setPrimary<T = unknown>(projectId: ProjectId, domainId: DomainId): Promise<T> {
    return this.http.post<T>(`/api/app/projects/${projectId}/domains/${domainId}/primary`);
  }
}

