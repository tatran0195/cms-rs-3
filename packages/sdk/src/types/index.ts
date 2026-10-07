import type { ResponseMeta } from './generated/ResponseMeta';

/**
 * Standard API Response envelope matching the unified Axum wire format
 */
export interface ApiResponse<T> {
  data: T;
  meta?: ResponseMeta;
}

/**
 * Canonical Nominal ID types for type safety in TypeScript
 */
export type Id = string;
export type ProjectId = string;
export type UserId = string;
export type OrgId = string;
export type BranchId = string;
export type LanguageId = string;
export type DeploymentId = string;
export type PageId = string;
export type DomainId = string;
export type AssetId = string;

// Re-export generated metadata & common types
export * from './generated/ResponseMeta';
export * from './generated/PaginationMeta';
export * from './generated/CursorMeta';
export * from './generated/SuccessResponse';
export * from './generated/SortOrder';
export * from './generated/MemberRole';

// Project
export * from './generated/ProjectResponse';
export * from './generated/ProjectCountResponse';
export * from './generated/CreateProjectRequest';
export * from './generated/UpdateProjectRequest';

// Auth
export * from './generated/UserResponse';
export * from './generated/SessionResponse';
export * from './generated/ApiKeyResponse';
export * from './generated/CreateApiKeyRequest';
export * from './generated/UpdateUserRequest';
export * from './generated/LoginResponse';
export * from './generated/AuthUser';
export * from './generated/AuthSession';
export * from './generated/AuthSessionData';
export * from './generated/SendVerificationOtpPayload';
export * from './generated/VerifyEmailOtpPayload';
export * from './generated/SignInEmailOtpPayload';
export * from './generated/RequestEmailChangePayload';
export * from './generated/ChangeEmailPayload';
export * from './generated/SignInSocialPayload';
export * from './generated/SignInSocialResponse';
export * from './generated/UpdateUserPayload';
export * from './generated/AcceptInvitationPayload';

// Organization / Workspace
export * from './generated/OrganizationResponse';
export * from './generated/CreateOrganizationRequest';
export * from './generated/UpdateOrganizationRequest';
export * from './generated/MemberResponse';
export * from './generated/WorkspaceMemberItem';
export * from './generated/WorkspaceMemberUser';
export * from './generated/WorkspaceMembersResponse';
export * from './generated/WorkspaceAnalyticsResponse';
export * from './generated/InvitationResponse';

// Branch
export * from './generated/BranchResponse';
export * from './generated/CreateBranchRequest';
export * from './generated/UpdateBranchRequest';

// Language
export * from './generated/LanguageResponse';
export * from './generated/CreateLanguageRequest';
export * from './generated/UpdateLanguageRequest';
export * from './generated/LanguageCoverage';
export * from './generated/ProjectTranslationResponse';

// Deployment
export * from './generated/DeploymentResponse';
export * from './generated/DeploymentListItem';
export * from './generated/DeploymentChangesResponse';
export * from './generated/DeploymentChangeItem';
export * from './generated/CreateDeploymentRequest';
export * from './generated/UpdateDeploymentRequest';
export * from './generated/DeploymentStatus';

// Page
export * from './generated/PageResponse';
export * from './generated/PageListItem';
export * from './generated/PageTreeNode';
export * from './generated/CreatePageRequest';
export * from './generated/UpdatePageRequest';

// Domain
export * from './generated/DomainResponse';
export * from './generated/SpaDomainResponse';
export * from './generated/CreateDomainRequest';
export * from './generated/UpdateDomainRequest';
export * from './generated/AddProjectDomainRequest';
export * from './generated/DeleteDomainResponse';
export * from './generated/DnsRecord';

// Asset
export * from './generated/AssetResponse';
export * from './generated/PresignAssetResponse';
export * from './generated/ConfirmAssetResponse';

// Theme
export * from './generated/ProjectThemeTemplateResponse';
export * from './generated/ProjectThemeTemplateDetails';
export * from './generated/ProjectThemeStyles';
export * from './generated/UpdateThemeRequest';

// Git
export * from './generated/GitProvider';
export * from './generated/GitSyncOperationType';
export * from './generated/GitSyncOperationStatus';
export * from './generated/GitConnectionResponse';
export * from './generated/CreateGitConnectionRequest';
export * from './generated/UpdateGitConnectionRequest';
export * from './generated/GitSyncOperationResponse';
export * from './generated/GitFileStateResponse';
export * from './generated/GitConflictResponse';
export * from './generated/ResolveGitConflictRequest';
export * from './generated/GitPullRequestResponse';
export * from './generated/GitPreviewResponse';
export * from './generated/WebhookSecretRotateResponse';
export * from './generated/ProjectGitWorkflowStatus';

// Integration
export * from './generated/IntegrationProvider';
export * from './generated/IntegrationEventStatus';
export * from './generated/ProjectIntegrationResponse';
export * from './generated/CreateProjectIntegrationRequest';
export * from './generated/UpdateProjectIntegrationRequest';
export * from './generated/IntegrationAuditEventResponse';
export * from './generated/IntegrationConfirmationResponse';
export * from './generated/IntegrationWebhookDeliveryResponse';
export * from './generated/IntegrationIdempotencyRecordResponse';
export * from './generated/ProjectIntegrationHealth';
export * from './generated/ProjectIntegrationCredential';
export * from './generated/ProjectIntegrationCatalogItem';
export * from './generated/DeleteProjectIntegrationResponse';
export * from './generated/ProjectIntegrationConfirmationResponse';

// Reader Access
export * from './generated/ReaderResponse';
export * from './generated/CreateReaderRequest';
export * from './generated/UpdateReaderRequest';
export * from './generated/AudienceResponse';
export * from './generated/CreateAudienceRequest';
export * from './generated/UpdateAudienceRequest';
export * from './generated/ReaderAudienceResponse';
export * from './generated/AudienceGrantResponse';
export * from './generated/CreateAudienceGrantRequest';
export * from './generated/ReaderInvitationResponse';
export * from './generated/CreateReaderInvitationRequest';
export * from './generated/ReaderSessionResponse';
export * from './generated/JwtAccessProviderResponse';
export * from './generated/ReaderAuditLogResponse';
export * from './generated/CreateInvitationRequest';
export * from './generated/AcceptInvitationRequest';
export * from './generated/ProjectReaderItem';
export * from './generated/ProjectAudienceItem';
export * from './generated/ProjectJwtProviderItem';
export * from './generated/ProjectReaderAccessResponse';
export * from './generated/ProjectReaderInvitationResponse';
export * from './generated/ProjectJwtTestResponse';
export * from './generated/ProjectReaderEmergencyRevokeResponse';
export * from './generated/DeleteAudienceResponse';

// Analytics & Telemetry
export * from './generated/TrackAnalyticsEventRequest';
export * from './generated/AnalyticsEventResponse';
export * from './generated/AnalyticsQueryRequest';
export * from './generated/AnalyticsResultItem';
export * from './generated/AnalyticsQueryResponse';
export * from './generated/PageViewAnalytics';
export * from './generated/ProjectAnalyticsSummary';
export * from './generated/TrackPageViewRequest';
export * from './generated/TimeSeriesAnalytics';
export * from './generated/AnalyticsDashboardResponse';
export * from './generated/ProjectAnalyticsTimeseriesPoint';
export * from './generated/ProjectAnalyticsResponse';
export * from './generated/ProjectUsageTelemetryResponse';
export * from './generated/ProjectUsagePeriod';
export * from './generated/ProjectUsageMeter';

// Search
export * from './generated/SearchIndexRunStatus';
export * from './generated/SearchIndexRunResponse';
export * from './generated/CreateSearchIndexRunRequest';
export * from './generated/SearchRequest';
export * from './generated/SearchResultItem';
export * from './generated/SearchResponse';
export * from './generated/ReindexRequest';
export * from './generated/SearchOptions';
export * from './generated/SearchHit';
export * from './generated/RagAnswer';
export * from './generated/ProjectIndexStats';
export * from './generated/IndexPageRequest';
export * from './generated/SearchConfiguration';
export * from './generated/SearchConstraints';
export * from './generated/SearchSettingsResponse';
export * from './generated/UpdateSearchSettingsRequest';
export * from './generated/SearchDiagnosticsResponse';
export * from './generated/SearchReindexResponse';

// Comment
export * from './generated/CommentResponse';
export * from './generated/CreateCommentRequest';
export * from './generated/UpdateCommentRequest';
export * from './generated/ResolveCommentRequest';
export * from './generated/CommentWithReplies';
export * from './generated/CommentUserResponse';
export * from './generated/ProjectCommentResponse';

// OpenAPI
export * from './generated/OpenApiDocumentResponse';
export * from './generated/CreateOpenApiDocumentRequest';
export * from './generated/UpdateOpenApiDocumentRequest';
export * from './generated/ParseOpenApiDocumentRequest';
export * from './generated/OpenApiParsingResult';
export * from './generated/OpenApiPathInfo';
export * from './generated/OpenApiDocumentWithPaths';
export * from './generated/ProjectOpenApiSourceResponse';
export * from './generated/ProjectOpenApiConfigurationResponse';
export * from './generated/ProjectOpenApiValidationResponse';

// Export
export * from './generated/ExportStatus';
export * from './generated/ExportFormat';
export * from './generated/ExportSnapshotResponse';
export * from './generated/ExportJobResponse';
export * from './generated/CreateExportJobRequest';
export * from './generated/ExportArtifactResponse';
export * from './generated/ExportScheduleResponse';
export * from './generated/CreateExportScheduleRequest';
export * from './generated/UpdateExportScheduleRequest';
export * from './generated/CreateExportRequest';

// Notification
export * from './generated/NotificationType';
export * from './generated/NotificationStatus';
export * from './generated/NotificationResponse';
export * from './generated/MarkNotificationReadRequest';
export * from './generated/MarkAllNotificationsReadRequest';
export * from './generated/ArchiveNotificationRequest';
export * from './generated/NotificationCountResponse';

// Serde JSON
export * from './generated/serde_json/JsonValue';
