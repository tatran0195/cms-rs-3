import type { HttpClient } from '../http';

export class AiResource {
  constructor(private readonly http: HttpClient) {}

  async prompt(projectId: string, payload: { prompt: string; context?: unknown }): Promise<{ result: string }> {
    return this.http.post<{ result: string }>(`/api/app/projects/${projectId}/ai`, payload);
  }
}
