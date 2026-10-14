import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCmsClient } from '../context';
import { queryKeys } from '../query-keys';

export const useSite = <T = any>(
  siteId: string | undefined,
  options?: { language?: string; version?: string; enabled?: boolean }
) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: queryKeys.site.shell(siteId ?? '', options?.language, options?.version),
    enabled: Boolean(siteId) && (options?.enabled ?? true),
    queryFn: async () => {
      if (!siteId) throw new Error('Site ID is required');
      return client.sites.getSite<T>(siteId, {
        language: options?.language,
        version: options?.version,
      });
    },
  });
};

export const useSitePage = <T = any>(
  siteId: string | undefined,
  path: string,
  options?: { language?: string; version?: string; enabled?: boolean }
) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: queryKeys.site.page(siteId ?? '', path, options?.language, options?.version),
    enabled: Boolean(siteId && path) && (options?.enabled ?? true),
    queryFn: async () => {
      if (!siteId) throw new Error('Site ID is required');
      return client.sites.getPage<T>(siteId, path, {
        language: options?.language,
        version: options?.version,
      });
    },
  });
};

export const useSiteChangelog = <T = any>(siteId: string | undefined, options?: { enabled?: boolean }) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: queryKeys.site.changelog(siteId ?? ''),
    enabled: Boolean(siteId) && (options?.enabled ?? true),
    queryFn: async () => {
      if (!siteId) throw new Error('Site ID is required');
      return client.sites.listChangelog<T>(siteId);
    },
  });
};

export const useSiteSearch = <T = any>(
  siteId: string | undefined,
  query: string,
  options?: { language?: string; version?: string; limit?: number },
  enabled = true
) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: queryKeys.site.search(siteId ?? '', query, options?.language, options?.version, options?.limit),
    enabled: Boolean(enabled && siteId && query.trim()),
    queryFn: async () => {
      if (!siteId) throw new Error('Site ID is required');
      return client.sites.search<T>(siteId, query, options);
    },
  });
};

export const useAnswerSite = <T = any>() => {
  const client = useCmsClient();
  return useMutation({
    mutationFn: async (input: { projectId: string; query: string; language?: string; version?: string }) =>
      client.sites.answer<T>(input.projectId, input.query, {
        language: input.language,
        version: input.version,
      }),
  });
};

export const useRecordSiteEvent = (projectId: string) => {
  const client = useCmsClient();
  return useMutation({
    mutationFn: async (event: Record<string, unknown>) => {
      await client.sites.recordEvent(projectId, event);
    },
  });
};

export const useCreateSiteAnalyticsEvent = useRecordSiteEvent;

export const useReaderAccess = <T = any>(projectId: string | undefined) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: queryKeys.readerAccess.detail(projectId ?? ''),
    enabled: Boolean(projectId),
    queryFn: async () => {
      if (!projectId) throw new Error('projectId is required');
      return (await client.readerAccess.get(projectId)) as unknown as T;
    },
  });
};

const useReaderAccessMutation = <TVariables, TResult>(
  projectId: string,
  mutationFn: (client: ReturnType<typeof useCmsClient>, variables: TVariables) => Promise<TResult>
) => {
  const client = useCmsClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: TVariables) => mutationFn(client, vars),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.readerAccess.detail(projectId) }),
  });
};

export const useUpdateReaderAccessMode = (projectId: string) =>
  useReaderAccessMutation(projectId, (client, json: any) => client.readerAccess.updateMode(projectId, json));

export const useCreateReaderAudience = (projectId: string) =>
  useReaderAccessMutation(projectId, (client, json: any) => client.readerAccess.createAudience(projectId, json));

export const useDeleteReaderAudience = (projectId: string) =>
  useReaderAccessMutation(projectId, (client, audienceId: string) => client.readerAccess.deleteAudience(projectId, audienceId));

export const useInviteReader = (projectId: string) =>
  useReaderAccessMutation(projectId, (client, json: any) => client.readerAccess.inviteReader(projectId, json));

export const useRevokeReader = (projectId: string) =>
  useReaderAccessMutation(projectId, (client, readerId: string) => client.readerAccess.revokeReader(projectId, readerId));

export const useUpdateReaderJwt = (projectId: string) =>
  useReaderAccessMutation(projectId, (client, json: any) => client.readerAccess.updateJwt(projectId, json));

export const useTestReaderJwt = (projectId: string) => {
  const client = useCmsClient();
  return useMutation({
    mutationFn: async (token: string) => client.readerAccess.testJwt(projectId, { token }),
  });
};

export const useEmergencyRevokeReaderAccess = (projectId: string) =>
  useReaderAccessMutation(projectId, (client, _: undefined) => client.readerAccess.emergencyRevoke(projectId));
