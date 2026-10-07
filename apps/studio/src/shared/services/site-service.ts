import type { ChangelogEntry, SearchAnswer, SitePage, SiteSearchHit, SiteShell } from '../hooks/api';
import { cmsClient } from './cms-client';

export const siteService = {
  getSite: async (projectId: string, options?: { language?: string; version?: string }): Promise<SiteShell> =>
    cmsClient.public.getSite<SiteShell>(projectId, {
      ...(options?.language ? { lang: options.language } : {}),
      ...(options?.version ? { version: options.version } : {}),
    }),

  getPage: async (projectId: string, path: string, options?: { language?: string; version?: string }): Promise<SitePage> =>
    cmsClient.public.getPage<SitePage>(projectId, {
      path,
      ...(options?.language ? { lang: options.language } : {}),
      ...(options?.version ? { version: options.version } : {}),
    }),

  listChangelog: async (projectId: string): Promise<ChangelogEntry[]> =>
    cmsClient.public.getChangelog<ChangelogEntry>(projectId),

  getGitPreview: async (token: string): Promise<string> => {
    const result = await cmsClient.public.getGitPreview(token);
    return JSON.stringify(result);
  },

  search: async (
    projectId: string,
    query: string,
    options?: { language?: string; version?: string; limit?: number },
  ): Promise<SiteSearchHit[]> => {
    const result = await cmsClient.public.search<SiteSearchHit>(projectId, {
      q: query,
      ...(options?.limit ? { limit: String(options.limit) } : {}),
      ...(options?.language ? { lang: options.language } : {}),
      ...(options?.version ? { version: options.version } : {}),
    });
    return result.hits;
  },

  answer: async (
    projectId: string,
    query: string,
    options?: { language?: string; version?: string },
  ): Promise<SearchAnswer> =>
    cmsClient.public.answer<SearchAnswer>(projectId, {
      question: query,
      q: query,
      query,
      ...(options?.language ? { lang: options.language } : {}),
      ...(options?.version ? { version: options.version } : {}),
    }),
};
