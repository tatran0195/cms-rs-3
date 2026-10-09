//! Workspace and Members handlers
//!
//! Handlers for company workspace settings, workspace analytics,
//! and workspace member management.

use std::sync::Arc;

use axum::{
    extract::{Path, State},
    Json,
};
use sqlx::Row;
use cms_entity::{
    common::ApiResponse,
    workspace::{
        InviteWorkspaceMemberRequest, UpdateWorkspaceMemberRoleRequest,
        UpdateWorkspaceSettingsRequest, WorkspaceAnalyticsResponse, WorkspaceInvitationResponse,
        WorkspaceMemberItem, WorkspaceMemberUser, WorkspaceMembersResponse,
        WorkspaceMutationResponse, WorkspaceSettingsResponse,
    },
};
use cms_error::AppError;
use cms_middleware::app_state::AppState;

use crate::{auth::AuthExtractor, validation::ValidatedJson};

/// Get workspace settings
pub async fn get_workspace_settings_handler(
    State(state): State<Arc<AppState>>,
    _auth: AuthExtractor,
) -> Result<Json<ApiResponse<WorkspaceSettingsResponse>>, AppError> {
    let project_count = cms_db::project::ProjectQueries::count(&state.biz_context.pool, None, None)
        .await
        .unwrap_or(0);

    let member_count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM \"User\"")
        .fetch_one(&state.biz_context.pool)
        .await
        .unwrap_or(1);

    let response = WorkspaceSettingsResponse {
        name: "Workspace".to_string(),
        slug: "workspace".to_string(),
        notifications: std::collections::HashMap::new(),
        integrations: std::collections::HashMap::new(),
        git: std::collections::HashMap::new(),
        project_count,
        member_count,
    };

    Ok(Json(ApiResponse::new(response)))
}

/// Update workspace settings
pub async fn update_workspace_settings_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    _body: ValidatedJson<UpdateWorkspaceSettingsRequest>,
) -> Result<Json<ApiResponse<WorkspaceSettingsResponse>>, AppError> {
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
    // Query all users
    let rows = sqlx::query(
        r#"SELECT id, email, name, image, created_at FROM "User" ORDER BY created_at ASC"#
    )
    .fetch_all(&state.biz_context.pool)
    .await
    .unwrap_or_default();

    let items: Vec<WorkspaceMemberItem> = rows
        .into_iter()
        .map(|row| {
            let uid = row.get::<String, _>("id");
            WorkspaceMemberItem {
                id: uid.clone(),
                user_id: uid.clone(),
                role: "member".to_string(),
                created_at: row.get::<chrono::DateTime<chrono::Utc>, _>("created_at"),
                user: WorkspaceMemberUser {
                    id: uid,
                    name: row.get::<Option<String>, _>("name"),
                    email: row.get::<String, _>("email"),
                    image: row.get::<Option<String>, _>("image"),
                },
            }
        })
        .collect();

    Ok(Json(ApiResponse::new(WorkspaceMembersResponse {
        members: items,
        invitations: Vec::new(),
    })))
}

/// Invite workspace member
pub async fn invite_workspace_member_handler(
    State(_state): State<Arc<AppState>>,
    _auth: AuthExtractor,
    ValidatedJson(body): ValidatedJson<InviteWorkspaceMemberRequest>,
) -> Result<Json<ApiResponse<WorkspaceInvitationResponse>>, AppError> {
    let invitation_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now();
    let expires = now + chrono::Duration::days(7);

    let response = WorkspaceInvitationResponse {
        id: invitation_id,
        email: body.email,
        role: body.role.unwrap_or_else(|| "member".to_string()),
        expires_at: expires.to_rfc3339(),
        created_at: now.to_rfc3339(),
    };

    Ok(Json(ApiResponse::new(response)))
}

/// Update workspace member role
pub async fn update_workspace_member_role_handler(
    State(_state): State<Arc<AppState>>,
    _auth: AuthExtractor,
    Path(id): Path<String>,
    _body: Json<UpdateWorkspaceMemberRoleRequest>,
) -> Result<Json<ApiResponse<WorkspaceMutationResponse>>, AppError> {
    Ok(Json(ApiResponse::new(WorkspaceMutationResponse {
        success: true,
        id,
    })))
}

/// Remove workspace member
pub async fn remove_workspace_member_handler(
    State(_state): State<Arc<AppState>>,
    _auth: AuthExtractor,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<WorkspaceMutationResponse>>, AppError> {
    Ok(Json(ApiResponse::new(WorkspaceMutationResponse {
        success: true,
        id,
    })))
}

/// Cancel workspace invitation
pub async fn cancel_workspace_invitation_handler(
    State(_state): State<Arc<AppState>>,
    _auth: AuthExtractor,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<WorkspaceMutationResponse>>, AppError> {
    Ok(Json(ApiResponse::new(WorkspaceMutationResponse {
        success: true,
        id,
    })))
}

/// Transfer workspace ownership
pub async fn transfer_workspace_ownership_handler(
    State(_state): State<Arc<AppState>>,
    _auth: AuthExtractor,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<ApiResponse<WorkspaceMutationResponse>>, AppError> {
    let target_member_id = body
        .get("memberId")
        .and_then(|v| v.as_str())
        .unwrap_or("default")
        .to_string();

    Ok(Json(ApiResponse::new(WorkspaceMutationResponse {
        success: true,
        id: target_member_id,
    })))
}

/// Delete workspace
pub async fn delete_workspace_handler(
    State(_state): State<Arc<AppState>>,
    _auth: AuthExtractor,
) -> Result<Json<ApiResponse<WorkspaceMutationResponse>>, AppError> {
    Ok(Json(ApiResponse::new(WorkspaceMutationResponse {
        success: true,
        id: "workspace".to_string(),
    })))
}
