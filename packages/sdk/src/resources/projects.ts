import type { HttpClient } from '../http';
import type {
  CreateProjectRequest,
  ProjectId,
  ProjectResponse,
  ProjectThemeStyles,
  ProjectThemeTemplateResponse,
  ProjectUsageTelemetryResponse,
  UpdateProjectRequest,
  UpdateThemeRequest,
} from '../types';

export interface ProjectMemberUser {
  id?: string;
  name: string;
  email: string;
  [key: string]: unknown;
}

export interface ProjectMemberItem {
  id: string;
  role: string;
  user: ProjectMemberUser;
  [key: string]: unknown;
}

export interface ProjectInvitationItem {
  id: string;
  email: string;
  role: string;
  [key: string]: unknown;
}

export interface ProjectMembersResponse {
  members: ProjectMemberItem[];
  invitations: ProjectInvitationItem[];
  [key: string]: unknown;
}

export interface ProjectInvitationResponse {
  id: string;
  email: string;
  role?: string;
  [key: string]: unknown;
}

export interface ProjectAnalyticsTimeseriesItem {
  date: string;
  views: number;
  visitors?: number;
  [key: string]: unknown;
}

export interface ProjectAnalyticsData {
  availability: string;
  totalViews: number;
  uniqueVisitors?: number | null;
  viewsPreviousPeriod?: number | null;
  visitorsPreviousPeriod?: number | null;
  viewsChangePct?: number | null;
  visitorsChangePct?: number | null;
  avgDurationSeconds?: number | null;
  timeseries: ProjectAnalyticsTimeseriesItem[];
  topPages?: unknown[];
  topReferrers?: unknown[];
  topCountries?: unknown[];
  topSearches?: unknown[];
  [key: string]: unknown;
}

export class ProjectsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List projects
   */
  async list(params?: { limit?: number; offset?: number }): Promise<ProjectResponse[]> {
    return this.http.get<ProjectResponse[]>('/api/projects', params);
  }

  /**
   * Get project by ID or slug
   */
  async get(id: ProjectId): Promise<ProjectResponse> {
    return this.http.get<ProjectResponse>(`/api/projects/${id}`);
  }

  /**
   * Create a new project
   */
  async create(payload: CreateProjectRequest | Record<string, unknown>): Promise<ProjectResponse> {
    return this.http.post<ProjectResponse>('/api/projects', payload);
  }

  /**
   * Update project details
   */
  async update(id: ProjectId, payload: UpdateProjectRequest | Record<string, unknown>): Promise<ProjectResponse> {
    return this.http.patch<ProjectResponse>(`/api/projects/${id}`, payload);
  }

  /**
   * Delete project
   */
  async delete(id: ProjectId): Promise<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`/api/projects/${id}`);
  }

  /**
   * Fetch project analytics
   */
  async getAnalytics<T = ProjectAnalyticsData>(id: ProjectId, params?: { period?: string; range?: string; timezone?: string }): Promise<T> {
    return this.http.get<T>(`/api/app/projects/${id}/analytics`, params);
  }

  /**
   * Fetch internal operational telemetry metrics (ADR 001 compliant)
   */
  async getTelemetry(id: ProjectId): Promise<ProjectUsageTelemetryResponse> {
    return this.http.get<ProjectUsageTelemetryResponse>(`/api/app/projects/${id}/usage`);
  }

  /**
   * Get project theme template details
   */
  async getTheme(id: ProjectId): Promise<ProjectThemeTemplateResponse> {
    return this.http.get<ProjectThemeTemplateResponse>(`/api/app/projects/${id}/theme`);
  }

  /**
   * Update project theme configuration
   */
  async updateTheme(id: ProjectId, payload: UpdateThemeRequest): Promise<ProjectThemeStyles> {
    return this.http.patch<ProjectThemeStyles>(`/api/app/projects/${id}/theme`, payload);
  }

  /**
   * Get project theme template
   */
  async getThemeTemplate<T = { json: string }>(id: ProjectId): Promise<T> {
    return this.http.get<T>(`/api/app/projects/${id}/theme-template`);
  }

  /**
   * Import project theme template
   */
  async importThemeTemplate<T = unknown>(id: ProjectId, payload: unknown): Promise<T> {
    return this.http.post<T>(`/api/app/projects/${id}/theme-template`, payload);
  }

  /**
   * List members for a project
   */
  async getMembers<T = ProjectMembersResponse>(id: ProjectId): Promise<T> {
    return this.http.get<T>(`/api/app/projects/${id}/members`);
  }

  /**
   * Invite a member to a project
   */
  async inviteMember<T = ProjectInvitationResponse>(id: ProjectId, payload: unknown): Promise<T> {
    return this.http.post<T>(`/api/app/projects/${id}/members/invite`, payload);
  }

  /**
   * Update project member role
   */
  async updateMemberRole<T = unknown>(id: ProjectId, memberId: string, payload: unknown): Promise<T> {
    return this.http.patch<T>(`/api/app/projects/${id}/members/${memberId}/role`, payload);
  }

  /**
   * Transfer project ownership
   */
  async transferOwnership<T = unknown>(id: ProjectId, payload: unknown): Promise<T> {
    return this.http.post<T>(`/api/app/projects/${id}/members/transfer`, payload);
  }

  /**
   * Remove member from project
   */
  async removeMember<T = unknown>(id: ProjectId, memberId: string): Promise<T> {
    return this.http.delete<T>(`/api/app/projects/${id}/members/${memberId}`);
  }

  /**
   * Cancel project invitation
   */
  async cancelInvitation<T = unknown>(id: ProjectId, invitationId: string): Promise<T> {
    return this.http.delete<T>(`/api/app/projects/${id}/members/invitations/${invitationId}`);
  }

  /**
   * Get project settings
   */
  async getSettings<T = unknown>(id: ProjectId): Promise<T> {
    return this.http.get<T>(`/api/app/projects/${id}/settings`);
  }

  /**
   * Update project settings / config
   */
  async updateSettings<T = unknown>(id: ProjectId, payload: unknown): Promise<T> {
    return this.http.patch<T>(`/api/app/projects/${id}/settings`, payload);
  }

  /**
   * Get project usage diagnostics
   */
  async getUsage<T = unknown>(id: ProjectId): Promise<T> {
    return this.http.get<T>(`/api/app/projects/${id}/settings/usage`);
  }

  /**
   * Import project content from Git repository
   */
  async importFromGit<T = unknown>(id: ProjectId): Promise<T> {
    return this.http.post<T>(`/api/app/projects/${id}/settings/git/import`);
  }

  /**
   * Rotate webhook secret for project Git connection
   */
  async rotateGitWebhookSecret<T = unknown>(id: ProjectId): Promise<T> {
    return this.http.post<T>(`/api/app/projects/${id}/settings/git/webhook-secret`);
  }

  /**
   * Import project content from Mintlify
   */
  async importFromMintlify<T = unknown>(id: ProjectId, payload: unknown): Promise<T> {
    return this.http.post<T>(`/api/app/projects/${id}/settings/import/mintlify`, payload);
  }

  /**
   * Import project content from Ghost
   */
  async importFromGhost<T = unknown>(id: ProjectId, payload: unknown): Promise<T> {
    return this.http.post<T>(`/api/app/projects/${id}/settings/import/ghost`, payload);
  }
}
