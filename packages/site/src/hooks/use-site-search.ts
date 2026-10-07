import { useQuery } from '@tanstack/react-query';
import { useSiteApi } from '../context/site-api-context';

export const useSiteSearch = (siteId: string | undefined, query: string, language?: string, version?: string, limit?: number, enabled = true) => {
  const api = useSiteApi();
  return useQuery({
    queryKey: ['site', siteId ?? '', 'search', query, language, version, limit],
    enabled: Boolean(enabled && siteId && query.trim()),
    queryFn: () => {
      if (api.search) {
        return api.search({
          projectId: siteId ?? '',
          query,
          language,
          version,
          limit,
        });
      }
      return [];
    },
  });
};
