export {
  // Projects Mutations
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  useInviteProjectMember,
  useUpdateProjectMemberRole,
  useTransferProjectOwnership,
  useRemoveProjectMember,
  useCancelProjectInvitation,

  // Pages & Editor Mutations
  useCreatePage,
  useUpdatePage,
  useDeletePage,
  useReorderPages,
  useCreateBranch,
  useMergeBranch,
  useCreateLanguage,
  useUpdateLanguage,
  useDeleteLanguage,
  useCreateComment,
  useResolveComment,
  useDeleteComment,

  // Deployments & Publishing Mutations
  usePublish,
  usePublishAnyway,
  useRollback,

  // Assets Mutations
  useUploadAsset,

  // Settings & Workspace Mutations
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
  useInviteMember,
  useUpdateMemberRole,
  useRemoveMember,
  useMarkNotificationsRead,

  // Site & Reader Access Mutations
  useAnswerSite,
  useRecordSiteEvent,
  useCreateSiteAnalyticsEvent,
  useUpdateReaderAccessMode,
  useCreateReaderAudience,
  useDeleteReaderAudience,
  useInviteReader,
  useRevokeReader,
  useUpdateReaderJwt,
  useTestReaderJwt,
  useEmergencyRevokeReaderAccess,

  // Git Workflow Mutations
  useResolveGitConflict,
  useAuthorizeGitWorkflow,
  useConnectGitWorkflow,
  useDisconnectGitWorkflow,
  useQueueGitOperation,
  useRotateGitWorkflowWebhookSecret,

  // Integrations Mutations
  useCreateProjectIntegration,
  useUpdateProjectIntegration,
  useActivateProjectIntegration,
  useDeactivateProjectIntegration,
  useVerifyProjectIntegration,
  useDeleteProjectIntegration,

  // Search Mutations
  useUpdateProjectSearchConfiguration,
  useCreateProjectSearchReindex,

  // Setup Mutations
  useCompleteSetup,
} from '@cms/sdk/react/mutations';
