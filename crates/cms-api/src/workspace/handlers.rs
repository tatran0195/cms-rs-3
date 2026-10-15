//! Workspace and Members handlers
//!
//! Handlers for company workspace settings, workspace analytics,
//! and workspace member management.

use std::sync::Arc;

use axum::{
    extract::{Path, State},
    Json,
};

use cms_entity::{
    common::ApiResponse,
    workspace::{
        InviteWorkspaceMemberRequest, UpdateWorkspaceMemberRoleRequest,
        UpdateWorkspaceSettingsRequest, WorkspaceAnalyticsResponse,
        WorkspaceInvitationResponse, WorkspaceMembersResponse,
        WorkspaceMutationResponse, WorkspaceSettingsResponse,
    },
};
use cms_error::AppError;
use cms_middleware::app_state::AppState;

use crate::{auth::AuthExtractor, validation::ValidatedJson};

/// Verify caller has administrative authority (operator, system admin, or workspace owner)
async fn ensure_admin_or_owner(state: &AppState, auth: &AuthExtractor) -> Result<(), AppError> {
    // 1. Explicit admin role in database
    if cms_db::auth::UserQueries::is_system_admin(&state.biz_context.pool, &auth.user.id)
        .await
        .unwrap_or(false)
    {
        return Ok(());
    }

    // 2. ReBAC workspace admin/owner check
    if cms_authz_gate::require_workspace_access(
        state.authz_backend(),
        &auth.authz_context(),
        cms_authz::Relation::Admin,
    )
    .await
    .is_ok()
    {
        return Ok(());
    }

    // 3. Fallback: First registered user is implicit owner
    if let Ok(Some(first_id)) = cms_db::WorkspaceQueries::get_owner_user_id(&state.biz_context.pool).await {
        if first_id == auth.user.id {
            return Ok(());
        }
    }

    Err(AppError::Forbidden)
}

/// Get workspace settings
pub async fn get_workspace_settings_handler(
    State(state): State<Arc<AppState>>,
    _auth: AuthExtractor,
) -> Result<Json<ApiResponse<WorkspaceSettingsResponse>>, AppError> {
    let response = cms_biz::WorkspaceService::get_settings(&state.biz_context).await?;
    Ok(Json(ApiResponse::new(response)))
}

/// Update workspace settings
pub async fn update_workspace_settings_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    ValidatedJson(body): ValidatedJson<UpdateWorkspaceSettingsRequest>,
) -> Result<Json<ApiResponse<WorkspaceSettingsResponse>>, AppError> {
    ensure_admin_or_owner(&state, &auth).await?;
    cms_biz::WorkspaceService::update_settings(&state.biz_context, &body).await?;
    get_workspace_settings_handler(State(state), auth).await
}

/// Get workspace analytics
pub async fn get_workspace_analytics_handler(
    State(state): State<Arc<AppState>>,
    _auth: AuthExtractor,
) -> Result<Json<ApiResponse<WorkspaceAnalyticsResponse>>, AppError> {
    let stats = cms_biz::analytics::AnalyticsService::get_system_stats(&state.biz_context)
        .await
        .unwrap_or_else(|_| serde_json::json!({}));

    let total_views = stats
        .get("events")
        .and_then(|v| v.as_i64())
        .unwrap_or(0)
        .max(0);

    let analytics = WorkspaceAnalyticsResponse {
        availability: "available".to_string(),
        total_views,
        unique_visitors: total_views,
        views_previous_period: 0,
        visitors_previous_period: 0,
        views_change_pct: 0.0,
        visitors_change_pct: 0.0,
        avg_duration_seconds: 0,
        timeseries: Vec::new(),
        top_pages: Vec::new(),
        top_referrers: Vec::new(),
        top_countries: Vec::new(),
        top_searches: Vec::new(),
        referrers: Vec::new(),
        languages: Vec::new(),
        devices: Vec::new(),
        engagement: serde_json::json!({ "engagedViews": null, "averageEngagementMs": null }),
        searches: serde_json::json!({
            "total": 0,
            "zeroResults": null,
            "clickedResults": null,
            "averageLatencyMs": null,
            "queryTerms": "legacy",
            "topTerms": []
        }),
        ai: serde_json::json!({
            "answersCompleted": null,
            "answersFailed": null,
            "promptTokens": null,
            "completionTokens": null,
            "costMicros": null,
            "averageLatencyMs": null
        }),
        no_answer_reasons: Vec::new(),
    };

    Ok(Json(ApiResponse::new(analytics)))
}

/// List workspace members
pub async fn list_workspace_members_handler(
    State(state): State<Arc<AppState>>,
    _auth: AuthExtractor,
) -> Result<Json<ApiResponse<WorkspaceMembersResponse>>, AppError> {
    let response = cms_biz::WorkspaceService::list_members(&state.biz_context).await?;
    Ok(Json(ApiResponse::new(response)))
}

/// Invite workspace member
pub async fn invite_workspace_member_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    ValidatedJson(body): ValidatedJson<InviteWorkspaceMemberRequest>,
) -> Result<Json<ApiResponse<WorkspaceInvitationResponse>>, AppError> {
    ensure_admin_or_owner(&state, &auth).await?;

    let (response, token) = cms_biz::WorkspaceService::invite_member(
        &state.biz_context,
        &auth.user.id,
        &body,
    )
    .await?;

    // Attempt delivering invitation email if mailer is configured
    let base_url = format!("http://{}:{}", state.config.server.host, state.config.server.port);
    let invite_url = format!("{base_url}/accept-invitation?token={token}");
    let inviter_name = auth
        .user
        .name
        .clone()
        .filter(|n| !n.trim().is_empty())
        .unwrap_or_else(|| auth.user.email.clone());
    let invitation_email = cms_biz::email::Email::MemberInvitation {
        inviter_name,
        workspace_name: "cms".to_string(),
        role: response.role.clone(),
        accept_url: invite_url.clone(),
        expires_in_days: 7,
    };
    let locale = state.email_renderer.negotiate(["en"]);
    if let Ok(rendered) = state.email_renderer.render(&invitation_email, &locale) {
        let _ = state.mailer.send_rendered_email(&response.email, &rendered).await;
    } else {
        let subject = "You've been invited to join the Documentation Workspace";
        let role = &response.role;
        let body_text = format!("Hello,\n\nYou have been invited to join the company documentation workspace as a {role}.\n\nAccept your invitation here:\n{invite_url}\n\nThis invitation link expires in 7 days.");
        let _ = state.mailer.send_email(&response.email, subject, &body_text).await;
    }

    Ok(Json(ApiResponse::new(response)))
}

/// Update workspace member role
pub async fn update_workspace_member_role_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(id): Path<String>,
    Json(body): Json<UpdateWorkspaceMemberRoleRequest>,
) -> Result<Json<ApiResponse<WorkspaceMutationResponse>>, AppError> {
    ensure_admin_or_owner(&state, &auth).await?;
    let response = cms_biz::WorkspaceService::update_member_role(&state.biz_context, &id, &body).await?;
    Ok(Json(ApiResponse::new(response)))
}

/// Remove workspace member
pub async fn remove_workspace_member_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<WorkspaceMutationResponse>>, AppError> {
    ensure_admin_or_owner(&state, &auth).await?;
    let response = cms_biz::WorkspaceService::remove_member(&state.biz_context, &auth.user.id, &id).await?;
    Ok(Json(ApiResponse::new(response)))
}

/// Cancel workspace invitation
pub async fn cancel_workspace_invitation_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<WorkspaceMutationResponse>>, AppError> {
    ensure_admin_or_owner(&state, &auth).await?;
    let response = cms_biz::WorkspaceService::cancel_invitation(&state.biz_context, &id).await?;
    Ok(Json(ApiResponse::new(response)))
}

/// Transfer workspace ownership
pub async fn transfer_workspace_ownership_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<ApiResponse<WorkspaceMutationResponse>>, AppError> {
    ensure_admin_or_owner(&state, &auth).await?;

    let target_member_id = body
        .get("memberId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::InvalidInput("memberId is required".to_string()))?;

    let response = cms_biz::WorkspaceService::transfer_ownership(
        &state.biz_context,
        &auth.user.id,
        target_member_id,
    )
    .await?;

    Ok(Json(ApiResponse::new(response)))
}

/// Delete workspace
pub async fn delete_workspace_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
) -> Result<Json<ApiResponse<WorkspaceMutationResponse>>, AppError> {
    ensure_admin_or_owner(&state, &auth).await?;
    let response = cms_biz::WorkspaceService::delete_workspace(&state.biz_context).await?;
    Ok(Json(ApiResponse::new(response)))
}
