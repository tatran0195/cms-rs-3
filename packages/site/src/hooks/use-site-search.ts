import { useMutation, useQuery } from '@tanstack/react-query';
import { useSiteApi } from '../context/site-api-context';

export const useSiteSearch = (
  siteId: string | undefined,
  query: string,
  language?: string,
  version?: string,
  limit?: number,
  enabled = true,
) => {
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

export const useAnswerSite = () => {
  const api = useSiteApi();
  return useMutation({
    mutationFn: async (input: { projectId: string; query: string; language?: string; version?: string }) => {
      if (api.answer) {
        return api.answer(input);
      }
      return {
        status: 'no_answer' as const,
        answer: '',
        confidence: 0,
        citations: [],
        cacheHit: false,
        quotaRemaining: 0,
      };
    },
  });
};
