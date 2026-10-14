import type { ResolvedTheme, ThemeConfigChange, ThemeTemplateV1 } from '@cms/shared/themes';
import {
  useDomains as useSdkDomains,
  useApiKeys as useSdkApiKeys,
  useOpenApiConfiguration as useSdkOpenApiConfiguration,
  useProjectUsage,
  useProjectAddons as useSdkProjectAddons,
  useWorkspaceSettings as useSdkWorkspaceSettings,
  useExportProjectTheme,
  useImportProjectTheme,
  useCreateApiKey,
  useRotateApiKey,
  useRevokeApiKey,
  useUpdateProjectConfig,
  useUpsertOpenApi,
  useSyncOpenApi,
  useDeleteOpenApi,
  useAddDomain,
  useVerifyDomain,
  useSetPrimaryDomain,
  useDeleteDomain,
  useUpdateProjectAddon,
  useActivateProjectAddon,
  useDeactivateProjectAddon,
  useUpdateWorkspaceSettings,
  useImportFromGit,
  useRotateGitWebhookSecret,
  useImportFromMintlify,
  useImportFromGhost,
  useTransferWorkspaceOwnership,
  useDeleteWorkspace,
} from '@cms/sdk/react';
import type { ApiKey, Domain, OpenApiConfiguration, ProjectAddon, WorkspaceSettings } from '../../../shared/hooks/api/types';

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

export const useDomains = (projectId: string | undefined) => useSdkDomains<Domain>(projectId);
export const useApiKeys = (projectId: string | undefined) => useSdkApiKeys<ApiKey>(projectId);
export const useOpenApiConfiguration = (projectId: string | undefined) => useSdkOpenApiConfiguration<OpenApiConfiguration>(projectId);
export const useProjectAddons = (projectId: string) => useSdkProjectAddons<ProjectAddon>(projectId);
export const useWorkspaceSettings = (projectId?: string) => useSdkWorkspaceSettings<WorkspaceSettings>(projectId);

export {
  useProjectUsage,
  useExportProjectTheme,
  useImportProjectTheme,
  useCreateApiKey,
  useRotateApiKey,
  useRevokeApiKey,
  useUpdateProjectConfig,
  useUpsertOpenApi,
  useSyncOpenApi,
  useDeleteOpenApi,
  useAddDomain,
  useVerifyDomain,
  useSetPrimaryDomain,
  useDeleteDomain,
  useUpdateProjectAddon,
  useActivateProjectAddon,
  useDeactivateProjectAddon,
  useUpdateWorkspaceSettings,
  useImportFromGit,
  useRotateGitWebhookSecret,
  useImportFromMintlify,
  useImportFromGhost,
  useTransferWorkspaceOwnership,
  useDeleteWorkspace,
};
