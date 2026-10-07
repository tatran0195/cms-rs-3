import { useT } from '@cms/i18n/react';
import type { ResolvedTheme, ThemeConfigChange, ThemeTemplateV1 } from '@cms/shared/themes';
import type {
  AddDomainBody,
  CreateApiKeyBody,
  MintlifyImportBody,
  ProjectConfigUpdate,
  RotateApiKeyBody,
  UpdateProjectAddonBody,
  UpdateWorkspaceSettingsBody,
  UpsertOpenApiBody,
} from '@cms/validators';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cmsClient } from '../../../shared/services/cms-client';
import { CmsApiError } from '@cms/sdk';
import { queryKeys } from '../../../shared/hooks/api/query-keys';
import type { ApiKey, ApiKeySecret, Domain, OpenApiConfiguration, Project, ProjectAddon, WorkspaceSettings } from '../../../shared/hooks/api/types';

export interface ProjectThemeImportResult {
  applied: boolean;
  mode: 'merge' | 'replace';
  migratedFrom?: 0;
  changes: ThemeConfigChange[];
  theme: ResolvedTheme;
  template: ThemeTemplateV1;
  publishedChangesPending: boolean;
}

export interface ContentImportSummary {
  imported: number;
  updated: number;
  skipped: number;
  assetsImported?: number;
  assetsSkipped?: number;
  warnings: string[];
}

export const useDomains = (projectId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.domains.all(projectId ?? ''),
    enabled: Boolean(projectId),
    queryFn: async () => (await cmsClient.domains.list(projectId!)) as unknown as Domain[],
  });

export const useApiKeys = (projectId: string | undefined) => {
  const t = useT();
  return useQuery({
    queryKey: queryKeys.apiKeys.all(projectId ?? ''),
    enabled: Boolean(projectId),
    queryFn: async () => (await cmsClient.apiKeys.list(projectId!)) as unknown as ApiKey[],
  });
};

export const useOpenApiConfiguration = (projectId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.openapi.detail(projectId ?? ''),
    enabled: Boolean(projectId),
    queryFn: async () => (await cmsClient.openapi.getConfig(projectId!)) as unknown as OpenApiConfiguration,
  });

export const useProjectUsage = (projectId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.usage.forProject(projectId ?? ''),
    enabled: Boolean(projectId),
    queryFn: async () => cmsClient.projects.getUsage(projectId!),
  });

export const useProjectAddons = (projectId: string) =>
  useQuery({
    queryKey: queryKeys.addons.all(projectId),
    queryFn: async () => (await cmsClient.addons.list<ProjectAddon>(projectId)),
  });

export const useWorkspaceSettings = (projectId?: string) =>
  useQuery({
    queryKey: projectId ? queryKeys.workspace.projectSettings(projectId) : queryKeys.workspace.settings(),
    queryFn: async () =>
      (projectId
        ? await cmsClient.projects.getSettings(projectId)
        : await cmsClient.workspace.get()) as unknown as WorkspaceSettings,
  });

export const useExportProjectTheme = (projectId: string) =>
  useMutation({
    mutationFn: async () => cmsClient.projects.getThemeTemplate<{ json: any }>(projectId),
  });

export const useImportProjectTheme = (projectId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ template, mode, apply }: { template: unknown; mode: 'merge' | 'replace'; apply: boolean }) =>
      (await cmsClient.projects.importThemeTemplate<ProjectThemeImportResult>(projectId, {
        template,
        mode,
        apply,
      })),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
      if (result.applied) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.all() });
      }
    },
  });
};

export const useCreateApiKey = (projectId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateApiKeyBody) =>
      (await cmsClient.apiKeys.create<ApiKeySecret>(projectId, body as any)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.all(projectId) }),
  });
};

export const useRotateApiKey = (projectId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: RotateApiKeyBody }) =>
      (await cmsClient.apiKeys.rotate<ApiKeySecret>(projectId, id, body)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.all(projectId) }),
  });
};

export const useRevokeApiKey = (projectId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await cmsClient.apiKeys.revoke<ApiKey>(projectId, id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.all(projectId) }),
  });
};

export const useUpdateProjectConfig = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ config, icon }: { config: ProjectConfigUpdate; icon?: string | null }) =>
      (await cmsClient.projects.update(projectId, (icon === undefined ? { config } : { config, icon }) as any)) as unknown as Project,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.all() });
      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
    },
  });
};

export const useUpsertOpenApi = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpsertOpenApiBody) => cmsClient.openapi.upsert(projectId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.openapi.detail(projectId) }),
  });
};

export const useSyncOpenApi = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => cmsClient.openapi.sync(projectId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.openapi.detail(projectId) }),
  });
};

export const useDeleteOpenApi = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => cmsClient.openapi.delete(projectId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.openapi.detail(projectId) }),
  });
};

export const useAddDomain = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: AddDomainBody) => cmsClient.domains.add(projectId, body as any),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.domains.all(projectId) }),
  });
};

export const useVerifyDomain = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => cmsClient.domains.verify(projectId, id),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.domains.all(projectId) }),
  });
};

export const useSetPrimaryDomain = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => cmsClient.domains.setPrimary(projectId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.domains.all(projectId) }),
  });
};

export const useDeleteDomain = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => cmsClient.domains.delete(projectId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.domains.all(projectId) }),
  });
};

export const useUpdateProjectAddon = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ addonId, body }: { addonId: string; body: UpdateProjectAddonBody }) =>
      cmsClient.addons.update<ProjectAddon>(projectId, addonId, body),
    onSuccess: (addon) => {
      qc.setQueryData(queryKeys.addons.detail(projectId, addon.id), addon);
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

const useSetProjectAddonEnabled = (projectId: string, action: 'activate' | 'deactivate') => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ addonId, expectedRevision }: { addonId: string; expectedRevision: number }) => {
      return action === 'activate'
        ? cmsClient.addons.activate<ProjectAddon>(projectId, addonId, { expectedRevision })
        : cmsClient.addons.deactivate<ProjectAddon>(projectId, addonId, { expectedRevision });
    },
    onSuccess: (addon) => {
      qc.setQueryData(queryKeys.addons.detail(projectId, addon.id), addon);
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

export const useActivateProjectAddon = (projectId: string) => useSetProjectAddonEnabled(projectId, 'activate');
export const useDeactivateProjectAddon = (projectId: string) => useSetProjectAddonEnabled(projectId, 'deactivate');

export const useUpdateWorkspaceSettings = (projectId?: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateWorkspaceSettingsBody) =>
      (projectId
        ? await cmsClient.projects.updateSettings(projectId, body)
        : await cmsClient.workspace.update(body)) as unknown as WorkspaceSettings,
    onSuccess: () => qc.invalidateQueries({ queryKey: projectId ? queryKeys.workspace.projectSettings(projectId) : queryKeys.workspace.settings() }),
  });
};

export const useImportFromGit = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<ContentImportSummary> => cmsClient.projects.importFromGit<ContentImportSummary>(projectId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.workspace.projectSettings(projectId) });
      qc.invalidateQueries({ queryKey: ['pages', projectId] });
    },
  });
};

export const useRotateGitWebhookSecret = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => cmsClient.projects.rotateGitWebhookSecret(projectId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workspace.projectSettings(projectId) }),
  });
};

export const useImportFromMintlify = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: MintlifyImportBody): Promise<ContentImportSummary> =>
      cmsClient.projects.importFromMintlify<ContentImportSummary>(projectId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.pages.allForProject(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.all() });
    },
  });
};

export const useImportFromGhost = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>): Promise<ContentImportSummary> =>
      cmsClient.projects.importFromGhost<ContentImportSummary>(projectId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.pages.allForProject(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.all() });
    },
  });
};
