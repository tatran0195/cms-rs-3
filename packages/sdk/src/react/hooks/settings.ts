import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CmsApiError } from '../../errors';
import type {
  ApiKey,
  Domain,
  NotificationList,
  OpenApiConfiguration,
  ProjectAddon,
  ProjectUsageTelemetryResponse,
  WorkspaceMembersResponse,
  WorkspaceSettings,
} from '../../types';
import { useCmsClient } from '../context';
import { queryKeys } from '../query-keys';

export const useDomains = <T = Domain>(projectId: string | undefined) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: queryKeys.domains.all(projectId ?? ''),
    enabled: Boolean(projectId),
    queryFn: async () => {
      if (!projectId) throw new Error('projectId is required');
      return (await client.domains.list(projectId)) as unknown as T[];
    },
  });
};

export const useApiKeys = <T = ApiKey>(projectId: string | undefined) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: queryKeys.apiKeys.all(projectId ?? ''),
    enabled: Boolean(projectId),
    queryFn: async () => {
      if (!projectId) throw new Error('projectId is required');
      return (await client.apiKeys.list(projectId)) as unknown as T[];
    },
  });
};

export const useOpenApiConfiguration = <T = OpenApiConfiguration>(projectId: string | undefined) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: queryKeys.openapi.detail(projectId ?? ''),
    enabled: Boolean(projectId),
    queryFn: async () => {
      if (!projectId) throw new Error('projectId is required');
      return (await client.openapi.getConfig(projectId)) as unknown as T;
    },
  });
};

export const useProjectUsage = <T = ProjectUsageTelemetryResponse>(projectId: string | undefined) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: queryKeys.usage.forProject(projectId ?? ''),
    enabled: Boolean(projectId),
    queryFn: async () => {
      if (!projectId) throw new Error('projectId is required');
      return (await client.projects.getUsage(projectId)) as unknown as T;
    },
  });
};

export const useProjectAddons = <T = ProjectAddon>(projectId: string) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: queryKeys.addons.all(projectId),
    queryFn: async () => (await client.addons.list(projectId)) as unknown as T[],
  });
};

export const useWorkspaceSettings = <T = WorkspaceSettings>(projectId?: string) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: projectId ? queryKeys.workspace.projectSettings(projectId) : queryKeys.workspace.settings(),
    queryFn: async () => (projectId ? await client.projects.getSettings(projectId) : await client.workspace.get()) as unknown as T,
  });
};

export const useExportProjectTheme = (projectId: string) => {
  const client = useCmsClient();
  return useMutation({
    mutationFn: async () => client.projects.getThemeTemplate<{ json: string }>(projectId),
  });
};

export const useImportProjectTheme = <T = any>(projectId: string) => {
  const client = useCmsClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ template, mode, apply }: { template: unknown; mode: 'merge' | 'replace'; apply: boolean }) =>
      (await client.projects.importThemeTemplate(projectId, {
        template,
        mode,
        apply,
      })) as unknown as T,
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
      if (result?.applied) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.all() });
      }
    },
  });
};

export const useCreateApiKey = <T = any>(projectId: string) => {
  const client = useCmsClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: any) => (await client.apiKeys.create(projectId, body)) as unknown as T,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.all(projectId) }),
  });
};

export const useRotateApiKey = <T = any>(projectId: string) => {
  const client = useCmsClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: any }) => (await client.apiKeys.rotate(projectId, id, body)) as unknown as T,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.all(projectId) }),
  });
};

export const useRevokeApiKey = <T = any>(projectId: string) => {
  const client = useCmsClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await client.apiKeys.revoke(projectId, id)) as unknown as T,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.all(projectId) }),
  });
};

export const useUpdateProjectConfig = <T = any>(projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ config, icon }: { config: any; icon?: string | null }) =>
      (await client.projects.update(projectId, icon === undefined ? { config } : { config, icon })) as unknown as T,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.all() });
      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
    },
  });
};

export const useUpsertOpenApi = (projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: any) => client.openapi.upsert(projectId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.openapi.detail(projectId) }),
  });
};

export const useSyncOpenApi = (projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => client.openapi.sync(projectId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.openapi.detail(projectId) }),
  });
};

export const useDeleteOpenApi = (projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => client.openapi.delete(projectId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.openapi.detail(projectId) }),
  });
};

export const useAddDomain = (projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: any) => client.domains.add(projectId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.domains.all(projectId) }),
  });
};

export const useVerifyDomain = (projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => client.domains.verify(projectId, id),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.domains.all(projectId) }),
  });
};

export const useSetPrimaryDomain = (projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => client.domains.setPrimary(projectId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.domains.all(projectId) }),
  });
};

export const useDeleteDomain = (projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => client.domains.delete(projectId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.domains.all(projectId) }),
  });
};

export const useUpdateProjectAddon = <T = any>(projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ addonId, body }: { addonId: string; body: any }) => (await client.addons.update(projectId, addonId, body)) as unknown as T,
    onSuccess: (addon: any) => {
      if (addon?.id) {
        qc.setQueryData(queryKeys.addons.detail(projectId, addon.id), addon);
      }
      qc.invalidateQueries({ queryKey: queryKeys.addons.all(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
    },
    onError: async (error, variables) => {
      if (error instanceof CmsApiError && error.code === 'addon:revision_conflict') {
        await Promise.all([
          qc.invalidateQueries({ queryKey: queryKeys.addons.detail(projectId, variables.addonId), exact: true, refetchType: 'all' }),
          qc.invalidateQueries({ queryKey: queryKeys.addons.all(projectId), exact: true, refetchType: 'all' }),
        ]);
      }
    },
  });
};

const useSetProjectAddonEnabled = <T = any>(projectId: string, action: 'activate' | 'deactivate') => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ addonId, expectedRevision }: { addonId: string; expectedRevision: number }) =>
      (action === 'activate'
        ? await client.addons.activate(projectId, addonId, { expectedRevision })
        : await client.addons.deactivate(projectId, addonId, { expectedRevision })) as unknown as T,
    onSuccess: (addon: any) => {
      if (addon?.id) {
        qc.setQueryData(queryKeys.addons.detail(projectId, addon.id), addon);
      }
      qc.invalidateQueries({ queryKey: queryKeys.addons.all(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
    },
    onError: async (error, variables) => {
      if (error instanceof CmsApiError && error.code === 'addon:revision_conflict') {
        await Promise.all([
          qc.invalidateQueries({ queryKey: queryKeys.addons.detail(projectId, variables.addonId), exact: true, refetchType: 'all' }),
          qc.invalidateQueries({ queryKey: queryKeys.addons.all(projectId), exact: true, refetchType: 'all' }),
        ]);
      }
    },
  });
};

export const useActivateProjectAddon = <T = any>(projectId: string) => useSetProjectAddonEnabled<T>(projectId, 'activate');
export const useDeactivateProjectAddon = <T = any>(projectId: string) => useSetProjectAddonEnabled<T>(projectId, 'deactivate');

export const useUpdateWorkspaceSettings = <T = any>(projectId?: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: any) =>
      (projectId ? await client.projects.updateSettings(projectId, body) : await client.workspace.update(body)) as unknown as T,
    onSuccess: () => qc.invalidateQueries({ queryKey: projectId ? queryKeys.workspace.projectSettings(projectId) : queryKeys.workspace.settings() }),
  });
};

export const useImportFromGit = <T = any>(projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<T> => client.projects.importFromGit<T>(projectId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.workspace.projectSettings(projectId) });
      qc.invalidateQueries({ queryKey: ['pages', projectId] });
    },
  });
};

export const useRotateGitWebhookSecret = (projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => client.projects.rotateGitWebhookSecret(projectId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workspace.projectSettings(projectId) }),
  });
};

export const useImportFromMintlify = <T = any>(projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: any): Promise<T> => client.projects.importFromMintlify<T>(projectId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.pages.allForProject(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.all() });
    },
  });
};

export const useImportFromGhost = <T = any>(projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: any): Promise<T> => client.projects.importFromGhost<T>(projectId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.pages.allForProject(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.all() });
    },
  });
};

export const useTransferWorkspaceOwnership = () => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string) => client.workspace.transferOwnership(memberId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.members.all() });
      qc.invalidateQueries({ queryKey: queryKeys.workspace.settings() });
    },
  });
};

export const useDeleteWorkspace = () => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => client.workspace.delete(),
    onSuccess: () => {
      qc.clear();
    },
  });
};

export const useMembers = <T = WorkspaceMembersResponse>() => {
  const client = useCmsClient();
  return useQuery({
    queryKey: queryKeys.members.all(),
    queryFn: async () => (await client.workspace.getMembers()) as unknown as T,
  });
};

export const useInviteMember = () => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: any) => client.workspace.inviteMember(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members.all() }),
  });
};

export const useUpdateMemberRole = () => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: any }) => client.workspace.updateMemberRole(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members.all() }),
  });
};

export const useRemoveMember = () => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => client.workspace.removeMember(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members.all() }),
  });
};

export const useNotifications = <T = NotificationList>(options?: { enabled?: boolean }) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: queryKeys.notifications.list(),
    enabled: options?.enabled ?? true,
    queryFn: async () => (await client.notifications.list()) as unknown as T,
  });
};

export const useUnreadNotificationCount = () => {
  const client = useCmsClient();
  return useQuery({
    queryKey: queryKeys.notifications.unreadCount(),
    queryFn: async () => client.notifications.getUnreadCount(),
    refetchInterval: 30_000,
  });
};

export const useMarkNotificationsRead = () => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: any) => client.notifications.markRead(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications.list() });
      qc.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount() });
    },
  });
};
