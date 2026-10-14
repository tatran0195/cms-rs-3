import type { HttpClient } from '../http';

export interface ExportJob {
  id: string;
  projectId?: string;
  status: string;
  createdAt: string;
  [key: string]: unknown;
}

export interface ExportSchedule {
  id: string;
  projectId: string;
  cronExpression: string;
  enabled: boolean;
  [key: string]: unknown;
}

export class ExportsResource {
  constructor(private readonly http: HttpClient) {}

  async listJobs(params?: { limit?: number; offset?: number }): Promise<ExportJob[]> {
    return this.http.get<ExportJob[]>('/api/app/export/jobs', params);
  }

  async createJob(payload: Record<string, unknown>): Promise<ExportJob> {
    return this.http.post<ExportJob>('/api/app/export/jobs', payload);
  }

  async getJob(id: string): Promise<ExportJob> {
    return this.http.get<ExportJob>(`/api/app/export/jobs/${id}`);
  }

  getDownloadUrl(jobId: string, artifactId?: string, baseUrl?: string): string {
    const base = baseUrl || this.http.options.baseUrl || '';
    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
    return artifactId
      ? `${cleanBase}/api/app/projects/export/artifacts/${artifactId}/download`
      : `${cleanBase}/api/app/export/jobs/${jobId}/download`;
  }

  async listSchedules(projectId: string): Promise<ExportSchedule[]> {
    return this.http.get<ExportSchedule[]>(`/api/app/export/projects/${projectId}/schedules`);
  }

  async createSchedule(projectId: string, payload: Record<string, unknown>): Promise<ExportSchedule> {
    return this.http.post<ExportSchedule>(`/api/app/export/projects/${projectId}/schedules`, payload);
  }

  async updateSchedule(scheduleId: string, payload: Record<string, unknown>): Promise<ExportSchedule> {
    return this.http.put<ExportSchedule>(`/api/app/export/schedules/${scheduleId}`, payload);
  }

  async deleteSchedule(scheduleId: string): Promise<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`/api/app/export/schedules/${scheduleId}`);
  }

  async runSchedule(projectId: string, scheduleId: string): Promise<ExportJob> {
    return this.http.post<ExportJob>(`/api/app/projects/${projectId}/exports/schedules/${scheduleId}/run`);
  }
}
