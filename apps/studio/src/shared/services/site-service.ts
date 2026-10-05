import { getData, type ChangelogEntry, type SearchAnswer, type SitePage, type SiteSearchHit, type SiteShell } from '../hooks/api';
import { api } from './api';

export const siteService = {
  getSite: async (projectId: string, options?: { language?: string; version?: string }): Promise<SiteShell> =>
    getData<SiteShell>(
      await api.public.sites[':id'].$get({
        param: { id: projectId },
        query: { ...(options?.language ? { lang: options.language } : {}), ...(options?.version ? { version: options.version } : {}) },
      }),
      'site',
    ),

  getPage: async (projectId: string, path: string, options?: { language?: string; version?: string }): Promise<SitePage> =>
    getData<SitePage>(
      await api.public.sites[':id'].page.$get({
        param: { id: projectId },
        query: {
          path,
          ...(options?.language ? { lang: options.language } : {}),
          ...(options?.version ? { version: options.version } : {}),
        },
      }),
      'page',
    ),

  listChangelog: async (projectId: string): Promise<ChangelogEntry[]> =>
    getData<ChangelogEntry[]>(await api.public.sites[':id'].changelog.$get({ param: { id: projectId } }), 'changelog'),

  getGitPreview: async (token: string): Promise<string> => {
    const response = await api.public.git.previews[':token'].$get({ param: { token } });
    return JSON.stringify(await getData(response, 'pull-request preview'));
  },

  search: async (
    projectId: string,
    query: string,
    options?: { language?: string; version?: string; limit?: number },
  ): Promise<SiteSearchHit[]> => {
    const result = await getData<{ hits: SiteSearchHit[] }>(
      await api.public.sites[':id'].search.$get({
        param: { id: projectId },
        query: {
          q: query,
          ...(options?.limit ? { limit: String(options.limit) } : {}),
          ...(options?.language ? { lang: options.language } : {}),
          ...(options?.version ? { version: options.version } : {}),
        },
      }),
      'search',
    );
    return result.hits;
  },

  answer: async (
    projectId: string,
    query: string,
    options?: { language?: string; version?: string },
  ): Promise<SearchAnswer> =>
    getData<SearchAnswer>(
      await api.public.sites[':id'].answer.$post({
        param: { id: projectId },
        json: {
          question: query,
          q: query,
          query,
          ...(options?.language ? { lang: options.language } : {}),
          ...(options?.version ? { version: options.version } : {}),
        },
      }),
      'answer',
    ),
};
