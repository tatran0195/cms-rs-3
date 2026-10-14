import type { HttpClient } from '../http';

export interface SiteShell {
  id: string;
  name?: string;
  [key: string]: unknown;
}

export interface SitePage {
  id: string;
  path: string;
  content: string;
  [key: string]: unknown;
}

export interface ChangelogEntry {
  id: string;
  title: string;
  publishedAt: string;
  [key: string]: unknown;
}

export interface SiteSearchHit {
  id: string;
  title: string;
  path: string;
  snippet?: string;
  [key: string]: unknown;
}

export interface SearchAnswer {
  answer: string;
  references?: Array<{ id: string; title: string; path: string }>;
  [key: string]: unknown;
}

export class SitesResource {
  constructor(private readonly http: HttpClient) {}

  async getSite<T = SiteShell>(projectId: string, options?: { language?: string; version?: string }): Promise<T> {
    const params: Record<string, string> = {};
    if (options?.language) params.lang = options.language;
    if (options?.version) params.version = options.version;
    return this.http.get<T>(`/api/public/sites/${projectId}`, Object.keys(params).length ? params : undefined);
  }

  async getPage<T = SitePage>(projectId: string, path: string, options?: { language?: string; version?: string }): Promise<T> {
    const params: Record<string, string> = { path };
    if (options?.language) params.lang = options.language;
    if (options?.version) params.version = options.version;
    return this.http.get<T>(`/api/public/sites/${projectId}/page`, params);
  }

  async listChangelog<T = ChangelogEntry>(projectId: string): Promise<T[]> {
    return this.http.get<T[]>(`/api/public/sites/${projectId}/changelog`);
  }

  async getGitPreview(token: string): Promise<string> {
    const res = await this.http.get<unknown>(`/api/public/git/previews/${token}`);
    return JSON.stringify(res);
  }

  async search<T = SiteSearchHit>(
    projectId: string,
    query: string,
    options?: { language?: string; version?: string; limit?: number }
  ): Promise<T[]> {
    const params: Record<string, string> = { q: query };
    if (options?.limit) params.limit = String(options.limit);
    if (options?.language) params.lang = options.language;
    if (options?.version) params.version = options.version;

    const res = await this.http.get<{ hits: T[] }>(`/api/public/sites/${projectId}/search`, params);
    return res.hits || [];
  }

  async answer<T = SearchAnswer>(
    projectId: string,
    query: string,
    options?: { language?: string; version?: string }
  ): Promise<T> {
    const body: Record<string, unknown> = {
      question: query,
      q: query,
      query,
    };
    if (options?.language) body.lang = options.language;
    if (options?.version) body.version = options.version;
    return this.http.post<T>(`/api/public/sites/${projectId}/answer`, body);
  }

  async recordEvent(projectId: string, event: Record<string, unknown>): Promise<void> {
    await this.http.post<void>(`/api/public/sites/${projectId}/events`, event);
  }
}
