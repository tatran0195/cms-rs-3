import type { HttpClient } from '../http';
import type {
  OrgId,
  OrganizationResponse,
  WorkspaceMembersResponse,
  WorkspaceAnalyticsResponse,
} from '../types';

export class WorkspaceResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Get workspace / organization details
   */
  async get(orgId: OrgId): Promise<OrganizationResponse> {
    return this.http.get<OrganizationResponse>(`/api/organizations/${orgId}`);
  }

  /**
   * Get workspace team members
   */
  async getMembers(orgId: OrgId): Promise<WorkspaceMembersResponse> {
    return this.http.get<WorkspaceMembersResponse>(`/api/organizations/${orgId}/members`);
  }

  /**
   * Get cross-project workspace analytics overview
   */
  async getAnalytics(orgId: OrgId, params?: { period?: string }): Promise<WorkspaceAnalyticsResponse> {
    return this.http.get<WorkspaceAnalyticsResponse>(`/api/app/analytics/overview`, {
      organizationId: orgId,
      ...params,
    });
  }
}
