import type { HttpClient } from '../http';

export interface ExportArtifact {
  id: string;
  format?: string;
  fileName?: string;
  size?: number;
  downloadUrl?: string;
  [key: string]: unknown;
}

export interface ExportMetrics {
  fetchMs?: number;
  renderMs?: number;
  storageMs?: number;
  totalMs?: number;
  pagesCount?: number;
  wordsCount?: number;
  throughputPagesPerSec?: number;
  fetch_ms?: number;
  render_ms?: number;
  storage_ms?: number;
  total_ms?: number;
  pages_count?: number;
  words_count?: number;
  throughput_pages_per_sec?: number;
}

export interface ExportJob {
  id: string;
  projectId?: string;
  snapshotId?: string;
  snapshot_id?: string;
  format?: string;
  formats?: string[];
  status: string;
  outputPath?: string;
  downloadUrl?: string;
  download_url?: string;
  errorMessage?: string;
  error_message?: string;
  error?: string | null;
  attempts?: number;
  trigger?: 'MANUAL' | 'SCHEDULED' | string;
  createdAt: string;
  created_at?: string;
  snapshot?: { deploymentVersion?: number; pagesCount?: number; createdAt?: string };
  artifacts?: ExportArtifact[];
  schedule?: { id: string; name: string } | null;
  metrics?: ExportMetrics;
  [key: string]: unknown;
}

export interface ExportSchedule {
  id: string;
  projectId: string;
  project_id?: string;
  name?: string;
  format?: string;
  formats?: string[];
  cadence?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | string;
  frequency?: string;
  timezone?: string;
  hour?: number;
  minute?: number;
  timeOfDay?: string;
  time_of_day?: string;
  dayOfWeek?: number | null;
  day_of_week?: number | null;
  dayOfMonth?: number | null;
  day_of_month?: number | null;
  cronExpression?: string;
  cron_expression?: string;
  enabled?: boolean;
  isActive?: boolean;
  is_active?: boolean;
  nextRunAt?: string | null;
  next_run_at?: string | null;
  lastError?: string | null;
  last_error?: string | null;
  retentionCount?: number;
  retention_count?: number;
  retentionDays?: number;
  retention_days?: number;
  _count?: { jobs: number };
  [key: string]: unknown;
}

export class ExportsResource {
  constructor(private readonly http: HttpClient) {}

  async listJobs(params?: { limit?: number; offset?: number; snapshot_id?: string; project_id?: string }): Promise<ExportJob[]> {
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

  async getJobDownload(id: string): Promise<{ download_url: string }> {
    return this.http.get<{ download_url: string }>(`/api/app/export/jobs/${id}/download`);
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
    return this.http.post<ExportJob>(`/api/app/export/schedules/${scheduleId}/run`);
  }
}
