import { useMutation, useQuery } from '@tanstack/react-query';
import { siteService } from '@/shared';
import { queryKeys } from './query-keys';

const requireSiteId = (siteId: string | undefined) => {
  if (!siteId) throw new Error('Site ID is required');
  return siteId;
};

export const useSiteSearch = (siteId: string | undefined, query: string, language?: string, version?: string, limit?: number, enabled = true) =>
  useQuery({
    queryKey: queryKeys.site.search(siteId ?? '', query, language, version, limit),
    enabled: Boolean(enabled && siteId && query.trim()),
    queryFn: () => siteService.search(requireSiteId(siteId), query, { language, version, limit }),
  });

export const useAnswerSite = () =>
  useMutation({
    mutationFn: (input: { projectId: string; query: string; language?: string; version?: string }) =>
      siteService.answer(input.projectId, input.query, { language: input.language, version: input.version }),
  });
