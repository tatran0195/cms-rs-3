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
import { api } from '../../../shared/services/api';
import { ApiResponseError, getData, mutateData } from '../../../shared/hooks/api/client-helpers';
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
    queryFn: async () =>
      getData<Domain[]>(
        await api.app.projects[':projectId'].domains.$get({
          param: { projectId: projectId! },
        }),
        'domains',
      ),
  });

export const useApiKeys = (projectId: string | undefined) => {
  const t = useT();
  return useQuery({
    queryKey: queryKeys.apiKeys.all(projectId ?? ''),
    enabled: Boolean(projectId),
    queryFn: async () =>
      getData<ApiKey[]>(
        await api.app.projects[':projectId']['api-keys'].$get({
          param: { projectId: projectId! },
        }),
        t('settings.apiKeys.loadError'),
      ),
  });
};

export const useOpenApiConfiguration = (projectId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.openapi.detail(projectId ?? ''),
    enabled: Boolean(projectId),
    queryFn: async () =>
      getData<OpenApiConfiguration>(
        await api.app.projects[':projectId'].openapi.$get({
          param: { projectId: projectId! },
        }),
        'openapi configuration',
      ),
  });

export const useProjectUsage = (projectId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.usage.forProject(projectId ?? ''),
    enabled: Boolean(projectId),
    queryFn: async () =>
      getData(
        await api.app.projects[':projectId'].settings.usage.$get({ param: { projectId: projectId! } }),
        'usage',
      ),
  });

export const useProjectAddons = (projectId: string) =>
  useQuery({
    queryKey: queryKeys.addons.all(projectId),
    queryFn: async () => getData<ProjectAddon[]>(await api.app.projects[':projectId'].addons.$get({ param: { projectId } }), 'project add-ons'),
  });

export const useWorkspaceSettings = (projectId?: string) =>
  useQuery({
    queryKey: projectId ? queryKeys.workspace.projectSettings(projectId) : queryKeys.workspace.settings(),
    queryFn: async () =>
      getData<WorkspaceSettings>(
        projectId ? await api.app.projects[':projectId'].settings.$get({ param: { projectId } }) : await api.app.workspace.$get(),
        'settings',
      ),
  });

export const useExportProjectTheme = (projectId: string) =>
  useMutation({
    mutationFn: async () => getData(await api.app.projects[':id']['theme-template'].$get({ param: { id: projectId } }), 'theme template'),
  });

export const useImportProjectTheme = (projectId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ template, mode, apply }: { template: unknown; mode: 'merge' | 'replace'; apply: boolean }) =>
      getData<ProjectThemeImportResult>(
        await api.app.projects[':id']['theme-template'].$post({
          param: { id: projectId },
          json: { template, mode, apply },
        }),
        'theme template',
      ),
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
  const t = useT();
  return useMutation({
    mutationFn: async (body: CreateApiKeyBody) =>
      mutateData<ApiKeySecret>(
        await api.app.projects[':projectId']['api-keys'].$post({ param: { projectId }, json: body }),
        t('settings.apiKeys.createError'),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.all(projectId) }),
  });
};

export const useRotateApiKey = (projectId: string) => {
  const queryClient = useQueryClient();
  const t = useT();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: RotateApiKeyBody }) =>
      mutateData<ApiKeySecret>(
        await api.app.projects[':projectId']['api-keys'][':id'].rotate.$post({ param: { projectId, id }, json: body }),
        t('settings.apiKeys.rotateError'),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.all(projectId) }),
  });
};

export const useRevokeApiKey = (projectId: string) => {
  const queryClient = useQueryClient();
  const t = useT();
  return useMutation({
    mutationFn: async (id: string) =>
      mutateData<ApiKey>(
        await api.app.projects[':projectId']['api-keys'][':id'].$delete({ param: { projectId, id } }),
        t('settings.apiKeys.revokeError'),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.all(projectId) }),
  });
};

export const useUpdateProjectConfig = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ config, icon }: { config: ProjectConfigUpdate; icon?: string | null }) =>
      mutateData<Project>(
        await api.app.projects[':id'].$patch({ param: { id: projectId }, json: icon === undefined ? { config } : { config, icon } }),
        'Could not update the site configuration.',
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.all() });
      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
    },
  });
};

export const useUpsertOpenApi = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpsertOpenApiBody) =>
      mutateData(await api.app.projects[':projectId'].openapi.$put({ param: { projectId }, json: body }), 'Could not save the OpenAPI document.'),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.openapi.detail(projectId) }),
  });
};

export const useSyncOpenApi = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      mutateData(await api.app.projects[':projectId'].openapi.sync.$post({ param: { projectId } }), 'Could not refresh the OpenAPI document.'),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.openapi.detail(projectId) }),
  });
};

export const useDeleteOpenApi = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      mutateData(await api.app.projects[':projectId'].openapi.$delete({ param: { projectId } }), 'Could not remove the OpenAPI document.'),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.openapi.detail(projectId) }),
  });
};

export const useAddDomain = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: AddDomainBody) =>
      mutateData(await api.app.projects[':projectId'].domains.$post({ param: { projectId }, json: body }), 'Could not add the domain.'),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.domains.all(projectId) }),
  });
};

export const useVerifyDomain = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      mutateData(await api.app.projects[':projectId'].domains[':id'].verify.$post({ param: { projectId, id } }), 'Could not verify.'),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.domains.all(projectId) }),
  });
};

export const useSetPrimaryDomain = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      mutateData(
        await api.app.projects[':projectId'].domains[':id'].primary.$post({ param: { projectId, id } }),
        'Could not set the primary domain.',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.domains.all(projectId) }),
  });
};

export const useDeleteDomain = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      mutateData(await api.app.projects[':projectId'].domains[':id'].$delete({ param: { projectId, id } }), 'Could not remove the domain.'),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.domains.all(projectId) }),
  });
};

export const useUpdateProjectAddon = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ addonId, body }: { addonId: string; body: UpdateProjectAddonBody }) =>
      mutateData<ProjectAddon>(
        await api.app.projects[':projectId'].addons[':addonId'].$patch({ param: { projectId, addonId }, json: body }),
        'Could not update the add-on.',
      ),
    onSuccess: (addon) => {
      qc.setQueryData(queryKeys.addons.detail(projectId, addon.id), addon);
      qc.invalidateQueries({ queryKey: queryKeys.addons.all(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
    },
    onError: async (error, variables) => {
      if (error instanceof ApiResponseError && error.code === 'addon:revision_conflict') {
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
      const response =
        action === 'activate'
          ? await api.app.projects[':projectId'].addons[':addonId'].activate.$post({ param: { projectId, addonId }, json: { expectedRevision } })
          : await api.app.projects[':projectId'].addons[':addonId'].deactivate.$post({ param: { projectId, addonId }, json: { expectedRevision } });
      return mutateData<ProjectAddon>(response, action === 'activate' ? 'Could not enable the add-on.' : 'Could not disable the add-on.');
    },
    onSuccess: (addon) => {
      qc.setQueryData(queryKeys.addons.detail(projectId, addon.id), addon);
      qc.invalidateQueries({ queryKey: queryKeys.addons.all(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
    },
    onError: async (error, variables) => {
      if (error instanceof ApiResponseError && error.code === 'addon:revision_conflict') {
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
      projectId
        ? mutateData<WorkspaceSettings>(
            await api.app.projects[':projectId'].settings.$patch({ param: { projectId }, json: body }),
            'Could not update settings.',
          )
        : mutateData<WorkspaceSettings>(await api.app.workspace.$patch({ json: body }), 'Could not update workspace settings.'),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectId ? queryKeys.workspace.projectSettings(projectId) : queryKeys.workspace.settings() }),
  });
};

export const useImportFromGit = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      mutateData(await api.app.projects[':projectId'].settings.git.import.$post({ param: { projectId } }), 'Could not import from Git.'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.workspace.projectSettings(projectId) });
      qc.invalidateQueries({ queryKey: ['pages', projectId] });
    },
  });
};

export const useRotateGitWebhookSecret = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      mutateData(
        await api.app.projects[':projectId'].settings.git['webhook-secret'].$post({ param: { projectId } }),
        'Could not rotate the webhook secret.',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workspace.projectSettings(projectId) }),
  });
};

export const useImportFromMintlify = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: MintlifyImportBody) =>
      mutateData(
        await api.app.projects[':projectId'].settings.import.mintlify.$post({ param: { projectId }, json: body }),
        'Could not import from Mintlify.',
      ),
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
    mutationFn: async (body: Record<string, unknown>) =>
      mutateData(
        await api.app.projects[':projectId'].settings.import.ghost.$post({ param: { projectId }, json: body }),
        'Could not import from Ghost.',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.pages.allForProject(projectId) }),
  });
};
