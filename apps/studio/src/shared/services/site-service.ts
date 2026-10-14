import type { ChangelogEntry, SearchAnswer, SitePage, SiteSearchHit, SiteShell } from '../hooks/api';
import { cmsClient } from './cms-client';

/**
 * Site reader service typed for studio routes and backed directly by cmsClient.sites
 */
export const siteService = {
  getSite: (projectId: string, options?: { language?: string; version?: string }): Promise<SiteShell> =>
    cmsClient.sites.getSite<SiteShell>(projectId, options),

  getPage: (projectId: string, path: string, options?: { language?: string; version?: string }): Promise<SitePage> =>
    cmsClient.sites.getPage<SitePage>(projectId, path, options),

  listChangelog: (projectId: string): Promise<ChangelogEntry[]> =>
    cmsClient.sites.listChangelog<ChangelogEntry>(projectId),

  getGitPreview: (token: string): Promise<string> =>
    cmsClient.sites.getGitPreview(token),

  search: (projectId: string, query: string, options?: { language?: string; version?: string; limit?: number }): Promise<SiteSearchHit[]> =>
    cmsClient.sites.search<SiteSearchHit>(projectId, query, options),

  answer: (projectId: string, query: string, options?: { language?: string; version?: string }): Promise<SearchAnswer> =>
    cmsClient.sites.answer<SearchAnswer>(projectId, query, options),
};
