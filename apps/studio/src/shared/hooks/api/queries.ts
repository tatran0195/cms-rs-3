import {
  useProjects as useSdkProjects,
  useProject as useSdkProject,
  useProjectMembers as useSdkProjectMembers,
  useProjectUsage,
  usePages as useSdkPages,
  usePage as useSdkPage,
  useBranches as useSdkBranches,
  useLanguages as useSdkLanguages,
  useComments as useSdkComments,
  useDeployments as useSdkDeployments,
  usePendingChanges as useSdkPendingChanges,
  useDomains as useSdkDomains,
  useApiKeys as useSdkApiKeys,
  useOpenApiConfiguration as useSdkOpenApiConfiguration,
  useProjectAddons as useSdkProjectAddons,
  useWorkspaceSettings as useSdkWorkspaceSettings,
  useMembers as useSdkMembers,
  useNotifications as useSdkNotifications,
  useUnreadNotificationCount,
  useSite,
  useSitePage,
  useSiteChangelog,
  useSiteSearch,
  useReaderAccess as useSdkReaderAccess,
  useGitWorkflow as useSdkGitWorkflow,
  useProjectIntegrations as useSdkProjectIntegrations,
  useProjectSearchConfiguration,
  useProjectSearchIndexDiagnostics,
  useSetupStatus,
  useGetPublicMeta,
  useGetInvitationInfo,
  useProjectAnalytics,
  useWorkspaceAnalytics,
} from '@cms/sdk/react/queries';
import type { IntegrationCatalogEntry } from '@cms/shared/integrations';
import type {
  ApiKey,
  Branch,
  Comment,
  Deployment,
  Domain,
  GitWorkflowStatus,
  Language,
  NotificationList,
  OpenApiConfiguration,
  Page,
  PageNode,
  PendingChangesResponse,
  Project,
  ProjectAddon,
  ReaderAccessData,
  WorkspaceSettings,
} from './types';

// ─── Projects Queries ────────────────────────────────────────────────────────
export const useProjects = (options?: { enabled?: boolean }) => useSdkProjects<Project>(options);
export const useProject = (projectId: string | undefined, options?: { enabled?: boolean }) =>
  useSdkProject<Project>(projectId, options);
export const useProjectMembers = (projectId: string | undefined, options?: { enabled?: boolean }) =>
  useSdkProjectMembers(projectId, options);
export { useProjectUsage };

// ─── Pages & Editor Queries ──────────────────────────────────────────────────
export const usePages = (projectId: string | undefined, languageId?: string, branchId?: string) =>
  useSdkPages<PageNode>(projectId, languageId, branchId);
export const usePage = (projectId: string | undefined, pageId: string | undefined) =>
  useSdkPage<Page>(projectId, pageId);
export const useBranches = (projectId: string | undefined) =>
  useSdkBranches<Branch>(projectId);
export const useLanguages = (projectId: string | undefined) =>
  useSdkLanguages<Language>(projectId);
export const useComments = (projectId: string | undefined, pageId?: string) =>
  useSdkComments<Comment>(projectId, pageId);

// ─── Deployments & Publishing Queries ────────────────────────────────────────
export const useDeployments = (projectId: string | undefined, options?: { enabled?: boolean; pollIntervalMs?: number }) =>
  useSdkDeployments<Deployment>(projectId, options);
export const usePendingChanges = (projectId: string | undefined, options?: { enabled?: boolean }) =>
  useSdkPendingChanges<PendingChangesResponse>(projectId, options);

// ─── Project & Workspace Settings Queries ────────────────────────────────────
export const useDomains = (projectId: string | undefined) => useSdkDomains<Domain>(projectId);
export const useApiKeys = (projectId: string | undefined) => useSdkApiKeys<ApiKey>(projectId);
export const useOpenApiConfiguration = (projectId: string | undefined) =>
  useSdkOpenApiConfiguration<OpenApiConfiguration>(projectId);
export const useProjectAddons = (projectId: string) => useSdkProjectAddons<ProjectAddon>(projectId);
export const useWorkspaceSettings = (projectId?: string) => useSdkWorkspaceSettings<WorkspaceSettings>(projectId);
export const useMembers = <T = any>() => useSdkMembers<T>();
export const useNotifications = (options?: { enabled?: boolean }) =>
  useSdkNotifications<NotificationList>(options);
export { useUnreadNotificationCount };

// ─── Site & Reader Queries ───────────────────────────────────────────────────
export const useReaderAccess = (projectId: string | undefined) =>
  useSdkReaderAccess<ReaderAccessData>(projectId);
export { useSite, useSitePage, useSiteChangelog, useSiteSearch };

// ─── Workflow & Integrations Queries ─────────────────────────────────────────
export const useGitWorkflow = (projectId: string) => useSdkGitWorkflow<GitWorkflowStatus | null>(projectId);
export const useProjectIntegrations = (projectId: string) =>
  useSdkProjectIntegrations<IntegrationCatalogEntry>(projectId);

// ─── Search, Setup, Public, Analytics Queries ────────────────────────────────
export {
  useProjectSearchConfiguration,
  useProjectSearchIndexDiagnostics,
  useSetupStatus,
  useGetPublicMeta,
  useGetInvitationInfo,
  useProjectAnalytics,
  useWorkspaceAnalytics,
};
