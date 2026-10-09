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

export * from './generated/AcceptInvitationPayload';
export * from './generated/AcceptInvitationRequest';
export * from './generated/AddProjectDomainRequest';
export * from './generated/AnalyticsDashboardResponse';
export * from './generated/AnalyticsEventResponse';
export * from './generated/AnalyticsQueryRequest';
export * from './generated/AnalyticsQueryResponse';
export * from './generated/AnalyticsResultItem';
export * from './generated/ApiKeyResponse';
export * from './generated/ArchiveNotificationRequest';
// Asset
export * from './generated/AssetResponse';
export * from './generated/AudienceGrantResponse';
export * from './generated/AudienceResponse';
export * from './generated/AuthSession';
export * from './generated/AuthSessionData';
export * from './generated/AuthUser';
// Branch
export * from './generated/BranchResponse';
export * from './generated/ChangeEmailPayload';
// Comment
export * from './generated/CommentResponse';
export * from './generated/CommentUserResponse';
export * from './generated/CommentWithReplies';
export * from './generated/ConfirmAssetResponse';
export * from './generated/CreateApiKeyRequest';
export * from './generated/CreateAudienceGrantRequest';
export * from './generated/CreateAudienceRequest';
export * from './generated/CreateBranchRequest';
export * from './generated/CreateCommentRequest';
export * from './generated/CreateDeploymentRequest';
export * from './generated/CreateDomainRequest';
export * from './generated/CreateExportJobRequest';
export * from './generated/CreateExportRequest';
export * from './generated/CreateExportScheduleRequest';
export * from './generated/CreateGitConnectionRequest';
export * from './generated/CreateInvitationRequest';
export * from './generated/CreateLanguageRequest';
export * from './generated/CreateOpenApiDocumentRequest';
export * from './generated/CreatePageRequest';
export * from './generated/CreateProjectIntegrationRequest';
export * from './generated/CreateProjectRequest';
export * from './generated/CreateReaderInvitationRequest';
export * from './generated/CreateReaderRequest';
export * from './generated/CreateSearchIndexRunRequest';
export * from './generated/CursorMeta';
export * from './generated/DeleteAudienceResponse';
export * from './generated/DeleteDomainResponse';
export * from './generated/DeleteProjectIntegrationResponse';
export * from './generated/DeploymentChangeItem';
export * from './generated/DeploymentChangesResponse';
export * from './generated/DeploymentListItem';
// Deployment
export * from './generated/DeploymentResponse';
export * from './generated/DeploymentStatus';
export * from './generated/DnsRecord';
// Domain
export * from './generated/DomainResponse';
export * from './generated/ExportArtifactResponse';
export * from './generated/ExportFormat';
export * from './generated/ExportJobResponse';
export * from './generated/ExportScheduleResponse';
export * from './generated/ExportSnapshotResponse';
// Export
export * from './generated/ExportStatus';
export * from './generated/GitConflictResponse';
export * from './generated/GitConnectionResponse';
export * from './generated/GitFileStateResponse';
export * from './generated/GitPreviewResponse';
// Git
export * from './generated/GitProvider';
export * from './generated/GitPullRequestResponse';
export * from './generated/GitSyncOperationResponse';
export * from './generated/GitSyncOperationStatus';
export * from './generated/GitSyncOperationType';
export * from './generated/IndexPageRequest';
export * from './generated/IntegrationAuditEventResponse';
export * from './generated/IntegrationConfirmationResponse';
export * from './generated/IntegrationEventStatus';
export * from './generated/IntegrationIdempotencyRecordResponse';
// Integration
export * from './generated/IntegrationProvider';
export * from './generated/IntegrationWebhookDeliveryResponse';
export * from './generated/JwtAccessProviderResponse';
export * from './generated/LanguageCoverage';
// Language
export * from './generated/LanguageResponse';
export * from './generated/LoginResponse';
export * from './generated/MarkAllNotificationsReadRequest';
export * from './generated/MarkNotificationReadRequest';
export * from './generated/MemberRole';
export * from './generated/NotificationCountResponse';
export * from './generated/NotificationResponse';
export * from './generated/NotificationStatus';
// Notification
export * from './generated/NotificationType';
// OpenAPI
export * from './generated/OpenApiDocumentResponse';
export * from './generated/OpenApiDocumentWithPaths';
export * from './generated/OpenApiParsingResult';
export * from './generated/OpenApiPathInfo';
export * from './generated/PageListItem';
// Page
export * from './generated/PageResponse';
export * from './generated/PageTreeNode';
export * from './generated/PageViewAnalytics';
export * from './generated/PaginationMeta';
export * from './generated/ParseOpenApiDocumentRequest';
export * from './generated/PresignAssetResponse';
export * from './generated/ProjectAnalyticsResponse';
export * from './generated/ProjectAnalyticsSummary';
export * from './generated/ProjectAnalyticsTimeseriesPoint';
export * from './generated/ProjectAudienceItem';
export * from './generated/ProjectCommentResponse';
export * from './generated/ProjectCountResponse';
export * from './generated/ProjectGitWorkflowStatus';
export * from './generated/ProjectIndexStats';
export * from './generated/ProjectIntegrationCatalogItem';
export * from './generated/ProjectIntegrationConfirmationResponse';
export * from './generated/ProjectIntegrationCredential';
export * from './generated/ProjectIntegrationHealth';
export * from './generated/ProjectIntegrationResponse';
export * from './generated/ProjectJwtProviderItem';
export * from './generated/ProjectJwtTestResponse';
export * from './generated/ProjectOpenApiConfigurationResponse';
export * from './generated/ProjectOpenApiSourceResponse';
export * from './generated/ProjectOpenApiValidationResponse';
export * from './generated/ProjectReaderAccessResponse';
export * from './generated/ProjectReaderEmergencyRevokeResponse';
export * from './generated/ProjectReaderInvitationResponse';
export * from './generated/ProjectReaderItem';
// Project
export * from './generated/ProjectResponse';
export * from './generated/ProjectThemeStyles';
export * from './generated/ProjectThemeTemplateDetails';
// Theme
export * from './generated/ProjectThemeTemplateResponse';
export * from './generated/ProjectTranslationResponse';
export * from './generated/ProjectUsageMeter';
export * from './generated/ProjectUsagePeriod';
export * from './generated/ProjectUsageTelemetryResponse';
export * from './generated/RagAnswer';
export * from './generated/ReaderAudienceResponse';
export * from './generated/ReaderAuditLogResponse';
export * from './generated/ReaderInvitationResponse';
// Reader Access
export * from './generated/ReaderResponse';
export * from './generated/ReaderSessionResponse';
export * from './generated/ReindexRequest';
export * from './generated/RequestEmailChangePayload';
export * from './generated/ResolveCommentRequest';
export * from './generated/ResolveGitConflictRequest';
// Re-export generated metadata & common types
export * from './generated/ResponseMeta';
export * from './generated/SearchConfiguration';
export * from './generated/SearchConstraints';
export * from './generated/SearchDiagnosticsResponse';
export * from './generated/SearchHit';
export * from './generated/SearchIndexRunResponse';
// Search
export * from './generated/SearchIndexRunStatus';
export * from './generated/SearchOptions';
export * from './generated/SearchReindexResponse';
export * from './generated/SearchRequest';
export * from './generated/SearchResponse';
export * from './generated/SearchResultItem';
export * from './generated/SearchSettingsResponse';
export * from './generated/SendVerificationOtpPayload';
export * from './generated/SessionResponse';
export * from './generated/SignInEmailOtpPayload';
export * from './generated/SignInSocialPayload';
export * from './generated/SignInSocialResponse';
export * from './generated/SortOrder';
export * from './generated/SpaDomainResponse';
export * from './generated/SuccessResponse';
// Serde JSON
export * from './generated/serde_json/JsonValue';
export * from './generated/TimeSeriesAnalytics';
// Analytics & Telemetry
export * from './generated/TrackAnalyticsEventRequest';
export * from './generated/TrackPageViewRequest';
export * from './generated/UpdateAudienceRequest';
export * from './generated/UpdateBranchRequest';
export * from './generated/UpdateCommentRequest';
export * from './generated/UpdateDeploymentRequest';
export * from './generated/UpdateDomainRequest';
export * from './generated/UpdateExportScheduleRequest';
export * from './generated/UpdateGitConnectionRequest';
export * from './generated/UpdateLanguageRequest';
export * from './generated/UpdateOpenApiDocumentRequest';
export * from './generated/UpdatePageRequest';
export * from './generated/UpdateProjectIntegrationRequest';
export * from './generated/UpdateProjectRequest';
export * from './generated/UpdateReaderRequest';
export * from './generated/UpdateSearchSettingsRequest';
export * from './generated/UpdateThemeRequest';
export * from './generated/UpdateUserPayload';
export * from './generated/UpdateUserRequest';
// Auth
export * from './generated/UserResponse';
export * from './generated/VerifyEmailOtpPayload';
export * from './generated/WebhookSecretRotateResponse';
export * from './generated/WorkspaceAnalyticsResponse';
export * from './generated/WorkspaceMemberItem';
export * from './generated/WorkspaceMembersResponse';
export * from './generated/WorkspaceMemberUser';
export * from './generated/WorkspaceSettingsResponse';
