use std::path::PathBuf;
use ts_rs::{Config, TS};

#[test]
fn export_all_typescript_bindings() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let out_dir = manifest_dir
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("packages")
        .join("sdk")
        .join("src")
        .join("types")
        .join("generated");

    std::fs::create_dir_all(&out_dir).expect("failed to create export directory");

    let out_dir_str = out_dir.to_str().unwrap();
    std::env::set_var("TS_RS_EXPORT_DIR", out_dir_str);

    let cfg = Config::from_env();

    // Common
    cms_entity::common::ResponseMeta::export_all(&cfg).unwrap();
    cms_entity::common::PaginationMeta::export_all(&cfg).unwrap();
    cms_entity::common::CursorMeta::export_all(&cfg).unwrap();
    cms_entity::common::SuccessResponse::export_all(&cfg).unwrap();
    cms_entity::common::SortOrder::export_all(&cfg).unwrap();
    cms_entity::common::MemberRole::export_all(&cfg).unwrap();

    // Project
    cms_entity::project::ProjectResponse::export_all(&cfg).unwrap();
    cms_entity::project::CreateProjectRequest::export_all(&cfg).unwrap();
    cms_entity::project::UpdateProjectRequest::export_all(&cfg).unwrap();

    // Auth
    cms_entity::auth::UserResponse::export_all(&cfg).unwrap();
    cms_entity::auth::SessionResponse::export_all(&cfg).unwrap();
    cms_entity::auth::ApiKeyResponse::export_all(&cfg).unwrap();
    cms_entity::auth::CreateApiKeyRequest::export_all(&cfg).unwrap();
    cms_entity::auth::UpdateUserRequest::export_all(&cfg).unwrap();
    cms_entity::auth::LoginResponse::export_all(&cfg).unwrap();
    cms_entity::auth::AuthUser::export_all(&cfg).unwrap();
    cms_entity::auth::AuthSession::export_all(&cfg).unwrap();
    cms_entity::auth::AuthSessionData::export_all(&cfg).unwrap();
    cms_entity::auth::SendVerificationOtpPayload::export_all(&cfg).unwrap();
    cms_entity::auth::VerifyEmailOtpPayload::export_all(&cfg).unwrap();
    cms_entity::auth::SignInEmailOtpPayload::export_all(&cfg).unwrap();
    cms_entity::auth::RequestEmailChangePayload::export_all(&cfg).unwrap();
    cms_entity::auth::ChangeEmailPayload::export_all(&cfg).unwrap();
    cms_entity::auth::SignInSocialPayload::export_all(&cfg).unwrap();
    cms_entity::auth::SignInSocialResponse::export_all(&cfg).unwrap();
    cms_entity::auth::UpdateUserPayload::export_all(&cfg).unwrap();
    cms_entity::auth::AcceptInvitationPayload::export_all(&cfg).unwrap();

    // Org / Workspace
    cms_entity::org::OrganizationResponse::export_all(&cfg).unwrap();
    cms_entity::org::CreateOrganizationRequest::export_all(&cfg).unwrap();
    cms_entity::org::UpdateOrganizationRequest::export_all(&cfg).unwrap();
    cms_entity::org::MemberResponse::export_all(&cfg).unwrap();
    cms_entity::org::WorkspaceMembersResponse::export_all(&cfg).unwrap();
    cms_entity::org::WorkspaceAnalyticsResponse::export_all(&cfg).unwrap();
    cms_entity::org::CreateInvitationRequest::export_all(&cfg).unwrap();
    cms_entity::org::AcceptInvitationRequest::export_all(&cfg).unwrap();

    // Branch
    cms_entity::branch::BranchResponse::export_all(&cfg).unwrap();
    cms_entity::branch::CreateBranchRequest::export_all(&cfg).unwrap();
    cms_entity::branch::UpdateBranchRequest::export_all(&cfg).unwrap();

    // Language
    cms_entity::language::LanguageResponse::export_all(&cfg).unwrap();
    cms_entity::language::CreateLanguageRequest::export_all(&cfg).unwrap();
    cms_entity::language::UpdateLanguageRequest::export_all(&cfg).unwrap();
    cms_entity::language::LanguageCoverage::export_all(&cfg).unwrap();
    cms_entity::language::ProjectTranslationResponse::export_all(&cfg).unwrap();

    // Deployment
    cms_entity::deployment::DeploymentResponse::export_all(&cfg).unwrap();
    cms_entity::deployment::DeploymentListItem::export_all(&cfg).unwrap();
    cms_entity::deployment::DeploymentChangesResponse::export_all(&cfg).unwrap();
    cms_entity::deployment::CreateDeploymentRequest::export_all(&cfg).unwrap();
    cms_entity::deployment::UpdateDeploymentRequest::export_all(&cfg).unwrap();
    cms_entity::deployment::DeploymentStatus::export_all(&cfg).unwrap();

    // Page
    cms_entity::page::PageResponse::export_all(&cfg).unwrap();
    cms_entity::page::PageListItem::export_all(&cfg).unwrap();
    cms_entity::page::PageTreeNode::export_all(&cfg).unwrap();
    cms_entity::page::CreatePageRequest::export_all(&cfg).unwrap();
    cms_entity::page::UpdatePageRequest::export_all(&cfg).unwrap();

    // Domain
    cms_entity::domain::DomainResponse::export_all(&cfg).unwrap();
    cms_entity::domain::SpaDomainResponse::export_all(&cfg).unwrap();
    cms_entity::domain::CreateDomainRequest::export_all(&cfg).unwrap();
    cms_entity::domain::UpdateDomainRequest::export_all(&cfg).unwrap();
    cms_entity::domain::AddProjectDomainRequest::export_all(&cfg).unwrap();
    cms_entity::domain::DeleteDomainResponse::export_all(&cfg).unwrap();
    cms_entity::domain::DnsRecord::export_all(&cfg).unwrap();

    // Asset
    cms_entity::asset::AssetResponse::export_all(&cfg).unwrap();
    cms_entity::asset::PresignAssetResponse::export_all(&cfg).unwrap();
    cms_entity::asset::ConfirmAssetResponse::export_all(&cfg).unwrap();

    // Theme
    cms_entity::theme::ProjectThemeTemplateResponse::export_all(&cfg).unwrap();
    cms_entity::theme::ProjectThemeStyles::export_all(&cfg).unwrap();
    cms_entity::theme::UpdateThemeRequest::export_all(&cfg).unwrap();

    // Git
    cms_entity::git::GitProvider::export_all(&cfg).unwrap();
    cms_entity::git::GitSyncOperationType::export_all(&cfg).unwrap();
    cms_entity::git::GitSyncOperationStatus::export_all(&cfg).unwrap();
    cms_entity::git::GitConnectionResponse::export_all(&cfg).unwrap();
    cms_entity::git::CreateGitConnectionRequest::export_all(&cfg).unwrap();
    cms_entity::git::UpdateGitConnectionRequest::export_all(&cfg).unwrap();
    cms_entity::git::GitSyncOperationResponse::export_all(&cfg).unwrap();
    cms_entity::git::GitFileStateResponse::export_all(&cfg).unwrap();
    cms_entity::git::GitConflictResponse::export_all(&cfg).unwrap();
    cms_entity::git::ResolveGitConflictRequest::export_all(&cfg).unwrap();
    cms_entity::git::GitPullRequestResponse::export_all(&cfg).unwrap();
    cms_entity::git::GitPreviewResponse::export_all(&cfg).unwrap();
    cms_entity::git::WebhookSecretRotateResponse::export_all(&cfg).unwrap();
    cms_entity::git::ProjectGitWorkflowStatus::export_all(&cfg).unwrap();

    // Integration
    cms_entity::integration::IntegrationProvider::export_all(&cfg).unwrap();
    cms_entity::integration::IntegrationEventStatus::export_all(&cfg).unwrap();
    cms_entity::integration::ProjectIntegrationResponse::export_all(&cfg).unwrap();
    cms_entity::integration::CreateProjectIntegrationRequest::export_all(&cfg).unwrap();
    cms_entity::integration::UpdateProjectIntegrationRequest::export_all(&cfg).unwrap();
    cms_entity::integration::IntegrationAuditEventResponse::export_all(&cfg).unwrap();
    cms_entity::integration::IntegrationConfirmationResponse::export_all(&cfg).unwrap();
    cms_entity::integration::IntegrationWebhookDeliveryResponse::export_all(&cfg).unwrap();
    cms_entity::integration::IntegrationIdempotencyRecordResponse::export_all(&cfg).unwrap();
    cms_entity::integration::ProjectIntegrationHealth::export_all(&cfg).unwrap();
    cms_entity::integration::ProjectIntegrationCredential::export_all(&cfg).unwrap();
    cms_entity::integration::ProjectIntegrationCatalogItem::export_all(&cfg).unwrap();
    cms_entity::integration::DeleteProjectIntegrationResponse::export_all(&cfg).unwrap();
    cms_entity::integration::ProjectIntegrationConfirmationResponse::export_all(&cfg).unwrap();

    // Reader Access
    cms_entity::reader_access::ReaderResponse::export_all(&cfg).unwrap();
    cms_entity::reader_access::CreateReaderRequest::export_all(&cfg).unwrap();
    cms_entity::reader_access::UpdateReaderRequest::export_all(&cfg).unwrap();
    cms_entity::reader_access::AudienceResponse::export_all(&cfg).unwrap();
    cms_entity::reader_access::CreateAudienceRequest::export_all(&cfg).unwrap();
    cms_entity::reader_access::UpdateAudienceRequest::export_all(&cfg).unwrap();
    cms_entity::reader_access::ReaderAudienceResponse::export_all(&cfg).unwrap();
    cms_entity::reader_access::AudienceGrantResponse::export_all(&cfg).unwrap();
    cms_entity::reader_access::CreateAudienceGrantRequest::export_all(&cfg).unwrap();
    cms_entity::reader_access::ReaderInvitationResponse::export_all(&cfg).unwrap();
    cms_entity::reader_access::CreateReaderInvitationRequest::export_all(&cfg).unwrap();
    cms_entity::reader_access::ReaderSessionResponse::export_all(&cfg).unwrap();
    cms_entity::reader_access::JwtAccessProviderResponse::export_all(&cfg).unwrap();
    cms_entity::reader_access::ReaderAuditLogResponse::export_all(&cfg).unwrap();
    cms_entity::reader_access::CreateInvitationRequest::export_all(&cfg).unwrap();
    cms_entity::reader_access::AcceptInvitationRequest::export_all(&cfg).unwrap();
    cms_entity::reader_access::ProjectReaderItem::export_all(&cfg).unwrap();
    cms_entity::reader_access::ProjectAudienceItem::export_all(&cfg).unwrap();
    cms_entity::reader_access::ProjectJwtProviderItem::export_all(&cfg).unwrap();
    cms_entity::reader_access::ProjectReaderAccessResponse::export_all(&cfg).unwrap();
    cms_entity::reader_access::ProjectReaderInvitationResponse::export_all(&cfg).unwrap();
    cms_entity::reader_access::ProjectJwtTestResponse::export_all(&cfg).unwrap();
    cms_entity::reader_access::ProjectReaderEmergencyRevokeResponse::export_all(&cfg).unwrap();
    cms_entity::reader_access::DeleteAudienceResponse::export_all(&cfg).unwrap();

    // Analytics & Telemetry
    cms_entity::analytics::TrackAnalyticsEventRequest::export_all(&cfg).unwrap();
    cms_entity::analytics::AnalyticsEventResponse::export_all(&cfg).unwrap();
    cms_entity::analytics::AnalyticsQueryRequest::export_all(&cfg).unwrap();
    cms_entity::analytics::AnalyticsResultItem::export_all(&cfg).unwrap();
    cms_entity::analytics::AnalyticsQueryResponse::export_all(&cfg).unwrap();
    cms_entity::analytics::PageViewAnalytics::export_all(&cfg).unwrap();
    cms_entity::analytics::ProjectAnalyticsSummary::export_all(&cfg).unwrap();
    cms_entity::analytics::TrackPageViewRequest::export_all(&cfg).unwrap();
    cms_entity::analytics::TimeSeriesAnalytics::export_all(&cfg).unwrap();
    cms_entity::analytics::AnalyticsDashboardResponse::export_all(&cfg).unwrap();
    cms_entity::analytics::ProjectAnalyticsTimeseriesPoint::export_all(&cfg).unwrap();
    cms_entity::analytics::ProjectAnalyticsResponse::export_all(&cfg).unwrap();
    cms_entity::analytics::ProjectUsageTelemetryResponse::export_all(&cfg).unwrap();
    cms_entity::analytics::ProjectUsagePeriod::export_all(&cfg).unwrap();
    cms_entity::analytics::ProjectUsageMeter::export_all(&cfg).unwrap();

    // Search
    cms_entity::search::SearchIndexRunStatus::export_all(&cfg).unwrap();
    cms_entity::search::SearchIndexRunResponse::export_all(&cfg).unwrap();
    cms_entity::search::CreateSearchIndexRunRequest::export_all(&cfg).unwrap();
    cms_entity::search::SearchRequest::export_all(&cfg).unwrap();
    cms_entity::search::SearchResultItem::export_all(&cfg).unwrap();
    cms_entity::search::SearchResponse::export_all(&cfg).unwrap();
    cms_entity::search::ReindexRequest::export_all(&cfg).unwrap();
    cms_entity::search::SearchOptions::export_all(&cfg).unwrap();
    cms_entity::search::SearchHit::export_all(&cfg).unwrap();
    cms_entity::search::RagAnswer::export_all(&cfg).unwrap();
    cms_entity::search::ProjectIndexStats::export_all(&cfg).unwrap();
    cms_entity::search::IndexPageRequest::export_all(&cfg).unwrap();
    cms_entity::search::SearchConfiguration::export_all(&cfg).unwrap();
    cms_entity::search::SearchConstraints::export_all(&cfg).unwrap();
    cms_entity::search::SearchSettingsResponse::export_all(&cfg).unwrap();
    cms_entity::search::UpdateSearchSettingsRequest::export_all(&cfg).unwrap();
    cms_entity::search::SearchDiagnosticsResponse::export_all(&cfg).unwrap();
    cms_entity::search::SearchReindexResponse::export_all(&cfg).unwrap();

    // Comment
    cms_entity::comment::CommentResponse::export_all(&cfg).unwrap();
    cms_entity::comment::CreateCommentRequest::export_all(&cfg).unwrap();
    cms_entity::comment::UpdateCommentRequest::export_all(&cfg).unwrap();
    cms_entity::comment::ResolveCommentRequest::export_all(&cfg).unwrap();
    cms_entity::comment::CommentWithReplies::export_all(&cfg).unwrap();
    cms_entity::comment::CommentUserResponse::export_all(&cfg).unwrap();
    cms_entity::comment::ProjectCommentResponse::export_all(&cfg).unwrap();

    // OpenAPI
    cms_entity::openapi::OpenApiDocumentResponse::export_all(&cfg).unwrap();
    cms_entity::openapi::CreateOpenApiDocumentRequest::export_all(&cfg).unwrap();
    cms_entity::openapi::UpdateOpenApiDocumentRequest::export_all(&cfg).unwrap();
    cms_entity::openapi::ParseOpenApiDocumentRequest::export_all(&cfg).unwrap();
    cms_entity::openapi::OpenApiParsingResult::export_all(&cfg).unwrap();
    cms_entity::openapi::OpenApiPathInfo::export_all(&cfg).unwrap();
    cms_entity::openapi::OpenApiDocumentWithPaths::export_all(&cfg).unwrap();
    cms_entity::openapi::ProjectOpenApiSourceResponse::export_all(&cfg).unwrap();
    cms_entity::openapi::ProjectOpenApiConfigurationResponse::export_all(&cfg).unwrap();
    cms_entity::openapi::ProjectOpenApiValidationResponse::export_all(&cfg).unwrap();

    // Export
    cms_entity::export::ExportStatus::export_all(&cfg).unwrap();
    cms_entity::export::ExportFormat::export_all(&cfg).unwrap();
    cms_entity::export::ExportSnapshotResponse::export_all(&cfg).unwrap();
    cms_entity::export::ExportJobResponse::export_all(&cfg).unwrap();
    cms_entity::export::CreateExportJobRequest::export_all(&cfg).unwrap();
    cms_entity::export::ExportArtifactResponse::export_all(&cfg).unwrap();
    cms_entity::export::ExportScheduleResponse::export_all(&cfg).unwrap();
    cms_entity::export::CreateExportScheduleRequest::export_all(&cfg).unwrap();
    cms_entity::export::UpdateExportScheduleRequest::export_all(&cfg).unwrap();
    cms_entity::export::CreateExportRequest::export_all(&cfg).unwrap();

    // Notification
    cms_entity::notification::NotificationType::export_all(&cfg).unwrap();
    cms_entity::notification::NotificationStatus::export_all(&cfg).unwrap();
    cms_entity::notification::NotificationResponse::export_all(&cfg).unwrap();
    cms_entity::notification::MarkNotificationReadRequest::export_all(&cfg).unwrap();
    cms_entity::notification::MarkAllNotificationsReadRequest::export_all(&cfg).unwrap();
    cms_entity::notification::ArchiveNotificationRequest::export_all(&cfg).unwrap();
    cms_entity::notification::NotificationCountResponse::export_all(&cfg).unwrap();

    println!("All TypeScript types successfully exported to {:?}", out_dir);
}
