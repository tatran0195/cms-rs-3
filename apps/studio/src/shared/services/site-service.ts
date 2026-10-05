import { getData } from '@/hooks/api/client-helpers';
import type { ChangelogEntry, SearchAnswer, SitePage, SiteSearchHit, SiteShell } from '@/hooks/api/types';
import { api } from './api';

export const getSiteFn = async ({ data }: { data: { projectId: string; language?: string; version?: string } }): Promise<SiteShell> =>
  getData<SiteShell>(
    await api.public.sites[':id'].$get({
      param: { id: data.projectId },
      query: { ...(data.language ? { lang: data.language } : {}), ...(data.version ? { version: data.version } : {}) },
    }),
    'site',
  );

export const getSitePageFn = async ({
  data,
}: {
  data: { projectId: string; path: string; language?: string; version?: string };
}): Promise<SitePage> =>
  getData<SitePage>(
    await api.public.sites[':id'].page.$get({
      param: { id: data.projectId },
      query: {
        path: data.path,
        ...(data.language ? { lang: data.language } : {}),
        ...(data.version ? { version: data.version } : {}),
      },
    }),
    'page',
  );

export const listSiteChangelogFn = async ({ data }: { data: { projectId: string } }): Promise<ChangelogEntry[]> =>
  getData<ChangelogEntry[]>(await api.public.sites[':id'].changelog.$get({ param: { id: data.projectId } }), 'changelog');

export const getGitPreviewFn = async ({ data }: { data: { token: string } }): Promise<string> => {
  const response = await api.public.git.previews[':token'].$get({ param: { token: data.token } });
  return JSON.stringify(await getData(response, 'pull-request preview'));
};

export const searchSiteFn = async ({
  data,
}: {
  data: {
    projectId: string;
    query: string;
    language?: string;
    version?: string;
    limit?: number;
  };
}): Promise<SiteSearchHit[]> => {
  const result = await getData<{ hits: SiteSearchHit[] }>(
    await api.public.sites[':id'].search.$get({
      param: { id: data.projectId },
      query: {
        q: data.query,
        ...(data.limit ? { limit: String(data.limit) } : {}),
        ...(data.language ? { lang: data.language } : {}),
        ...(data.version ? { version: data.version } : {}),
      },
    }),
    'search',
  );
  return result.hits;
};

export const answerSiteFn = async ({
  data,
}: {
  data: {
    projectId: string;
    query: string;
    language?: string;
    version?: string;
  };
}): Promise<SearchAnswer> =>
  getData<SearchAnswer>(
    await api.public.sites[':id'].answer.$post({
      param: { id: data.projectId },
      json: {
        question: data.query,
        q: data.query,
        query: data.query,
        ...(data.language ? { lang: data.language } : {}),
        ...(data.version ? { version: data.version } : {}),
      },
    }),
    'answer',
  );
