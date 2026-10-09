//! Workspace and Members handlers
//!
//! Handlers for company workspace settings, workspace analytics,
//! and workspace member management.

use std::sync::Arc;

use axum::{
    extract::{Path, State},
    Json,
};
use chrono::Utc;
use sqlx::Row;
use uuid::Uuid;

use cms_entity::{
    common::ApiResponse,
    workspace::{
        InviteWorkspaceMemberRequest, UpdateWorkspaceMemberRoleRequest,
        UpdateWorkspaceSettingsRequest, WorkspaceAnalyticsResponse, WorkspaceInvitationItem,
        WorkspaceInvitationResponse, WorkspaceMemberItem, WorkspaceMemberUser,
        WorkspaceMembersResponse, WorkspaceMutationResponse, WorkspaceSettingsResponse,
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

    // 2. Configured system admin email
    let auth_user = auth.to_auth_user(state);
    if auth_user.is_admin {
        return Ok(());
    }

    // 3. Fallback: First registered user is implicit owner
    let first_user_id: Option<String> = sqlx::query_scalar(
        r#"SELECT id FROM "User" ORDER BY created_at ASC LIMIT 1"#
    )
    .fetch_optional(&state.biz_context.pool)
    .await
    .unwrap_or(None);

    if let Some(first_id) = first_user_id {
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
    let project_count = cms_db::project::ProjectQueries::count(&state.biz_context.pool, None, None)
        .await
        .unwrap_or(0);

    let member_count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM \"User\"")
        .fetch_one(&state.biz_context.pool)
        .await
        .unwrap_or(1);

    let row = sqlx::query(
        r#"SELECT name, slug FROM "WorkspaceSettings" WHERE id = 'default' LIMIT 1"#
    )
    .fetch_optional(&state.biz_context.pool)
    .await
    .unwrap_or(None);

    let (name, slug) = if let Some(r) = row {
        (
            r.get::<String, _>("name"),
            r.get::<String, _>("slug"),
        )
    } else {
        ("Company Workspace".to_string(), "workspace".to_string())
    };

    let response = WorkspaceSettingsResponse {
        name,
        slug,
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
    ValidatedJson(body): ValidatedJson<UpdateWorkspaceSettingsRequest>,
) -> Result<Json<ApiResponse<WorkspaceSettingsResponse>>, AppError> {
    ensure_admin_or_owner(&state, &auth).await?;

    let logo_url = body.logo_url.as_deref().or(body.logo.as_deref());
    sqlx::query(
        r#"
        UPDATE "WorkspaceSettings"
        SET name = COALESCE($1, name),
            logo_url = COALESCE($2, logo_url),
            description = COALESCE($3, description),
            updated_at = NOW()
        WHERE id = 'default'
        "#
    )
    .bind(body.name.as_deref().map(str::trim))
    .bind(logo_url)
    .bind(body.description.as_deref())
    .execute(&state.biz_context.pool)
    .await
    .map_err(|e| AppError::Database(e.into()))?;

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
    // 1. Query all users from "User"
    let rows = sqlx::query(
        r#"SELECT id, email, name, image, role, created_at FROM "User" ORDER BY created_at ASC"#
    )
    .fetch_all(&state.biz_context.pool)
    .await
    .unwrap_or_default();

    let first_id = rows.first().map(|r| r.get::<String, _>("id"));

    let members: Vec<WorkspaceMemberItem> = rows
        .into_iter()
        .map(|row| {
            let uid = row.get::<String, _>("id");
            let role_db = row.get::<String, _>("role");
            let role = if Some(&uid) == first_id.as_ref() {
                "owner".to_string()
            } else if role_db == "admin" {
                "admin".to_string()
            } else {
                "member".to_string()
            };

            WorkspaceMemberItem {
                id: uid.clone(),
                user_id: uid.clone(),
                role,
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

    // 2. Query pending invitations from "WorkspaceInvitation"
    let inv_rows = sqlx::query(
        r#"SELECT id, email, role, expires_at, created_at FROM "WorkspaceInvitation" WHERE expires_at > NOW() ORDER BY created_at DESC"#
    )
    .fetch_all(&state.biz_context.pool)
    .await
    .unwrap_or_default();

    let invitations: Vec<WorkspaceInvitationItem> = inv_rows
        .into_iter()
        .map(|row| WorkspaceInvitationItem {
            id: row.get::<String, _>("id"),
            email: row.get::<String, _>("email"),
            role: row.get::<String, _>("role"),
            expires_at: row.get::<chrono::DateTime<chrono::Utc>, _>("expires_at"),
            created_at: row.get::<chrono::DateTime<chrono::Utc>, _>("created_at"),
        })
        .collect();

    Ok(Json(ApiResponse::new(WorkspaceMembersResponse {
        members,
        invitations,
    })))
}

/// Invite workspace member
pub async fn invite_workspace_member_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    ValidatedJson(body): ValidatedJson<InviteWorkspaceMemberRequest>,
) -> Result<Json<ApiResponse<WorkspaceInvitationResponse>>, AppError> {
    ensure_admin_or_owner(&state, &auth).await?;

    let email = body.email.trim().to_lowercase();
    let role = body.role.as_deref().unwrap_or("member");
    if role != "admin" && role != "member" {
        return Err(AppError::InvalidInput("Invalid role: must be 'admin' or 'member'".to_string()));
    }

    // Check if user is already a registered member
    if let Some(_existing) = cms_db::auth::UserQueries::get_by_email(&state.biz_context.pool, &email).await? {
        return Err(AppError::Conflict(format!("User {} is already a member of this workspace", email)));
    }

    let invitation_id = Uuid::new_v4().to_string();
    let token = Uuid::new_v4().simple().to_string();
    let now = Utc::now();
    let expires = now + chrono::Duration::days(7);

    sqlx::query(
        r#"
        INSERT INTO "WorkspaceInvitation" (id, email, role, token, invited_by, expires_at, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (email) DO UPDATE SET
            id = EXCLUDED.id,
            role = EXCLUDED.role,
            token = EXCLUDED.token,
            invited_by = EXCLUDED.invited_by,
            expires_at = EXCLUDED.expires_at,
            created_at = EXCLUDED.created_at
        "#
    )
    .bind(&invitation_id)
    .bind(&email)
    .bind(role)
    .bind(&token)
    .bind(&auth.user.id)
    .bind(expires)
    .bind(now)
    .execute(&state.biz_context.pool)
    .await
    .map_err(|e| AppError::Database(e.into()))?;

    // Attempt delivering invitation email if mailer is configured
    let base_url = format!("http://{}:{}", state.config.server.host, state.config.server.port);
    let invite_url = format!("{base_url}/accept-invitation?token={token}");
    let subject = "You've been invited to join the Documentation Workspace";
    let body_text = format!("Hello,\n\nYou have been invited to join the company documentation workspace as a {role}.\n\nAccept your invitation here:\n{invite_url}\n\nThis invitation link expires in 7 days.");
    let _ = state.mailer.send_email(&email, subject, &body_text).await;

    let response = WorkspaceInvitationResponse {
        id: invitation_id,
        email,
        role: role.to_string(),
        token: Some(token),
        expires_at: expires.to_rfc3339(),
        created_at: now.to_rfc3339(),
    };

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

    let new_role = body.role.as_deref().unwrap_or("member");
    if new_role != "admin" && new_role != "member" {
        return Err(AppError::InvalidInput("Invalid role: must be 'admin' or 'member'".to_string()));
    }

    let _target_user = cms_db::auth::UserQueries::get_by_id(&state.biz_context.pool, &id)
        .await?
        .ok_or_else(|| AppError::NotFound("Member not found".to_string()))?;

    // Protect workspace owner
    let first_user_id: Option<String> = sqlx::query_scalar(
        r#"SELECT id FROM "User" ORDER BY created_at ASC LIMIT 1"#
    )
    .fetch_optional(&state.biz_context.pool)
    .await
    .unwrap_or(None);

    if Some(&id) == first_user_id.as_ref() {
        return Err(AppError::InvalidInput("Cannot change role of the workspace owner".to_string()));
    }

    let db_role = if new_role == "admin" { "admin" } else { "user" };

    let is_admin = cms_db::auth::UserQueries::is_system_admin(&state.biz_context.pool, &id)
        .await
        .unwrap_or(false);

    // Prevent demoting last remaining admin
    if is_admin && db_role == "user" {
        let admin_count: i64 = sqlx::query_scalar(
            r#"SELECT COUNT(*) FROM "User" WHERE role = 'admin' OR id = (SELECT id FROM "User" ORDER BY created_at ASC LIMIT 1)"#
        )
        .fetch_one(&state.biz_context.pool)
        .await
        .unwrap_or(0);
        if admin_count <= 1 {
            return Err(AppError::InvalidInput("Cannot demote the last remaining workspace admin".to_string()));
        }
    }

    sqlx::query(r#"UPDATE "User" SET role = $1, updated_at = NOW() WHERE id = $2"#)
        .bind(db_role)
        .bind(&id)
        .execute(&state.biz_context.pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

    Ok(Json(ApiResponse::new(WorkspaceMutationResponse {
        success: true,
        id,
    })))
}

/// Remove workspace member
pub async fn remove_workspace_member_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<WorkspaceMutationResponse>>, AppError> {
    ensure_admin_or_owner(&state, &auth).await?;

    if auth.user.id == id {
        return Err(AppError::InvalidInput("You cannot remove yourself from the workspace".to_string()));
    }

    let _target_user = cms_db::auth::UserQueries::get_by_id(&state.biz_context.pool, &id)
        .await?
        .ok_or_else(|| AppError::NotFound("Member not found".to_string()))?;

    // Protect workspace owner
    let first_user_id: Option<String> = sqlx::query_scalar(
        r#"SELECT id FROM "User" ORDER BY created_at ASC LIMIT 1"#
    )
    .fetch_optional(&state.biz_context.pool)
    .await
    .unwrap_or(None);

    if Some(&id) == first_user_id.as_ref() {
        return Err(AppError::InvalidInput("Cannot remove the workspace owner".to_string()));
    }

    let is_admin = cms_db::auth::UserQueries::is_system_admin(&state.biz_context.pool, &id)
        .await
        .unwrap_or(false);

    // Prevent removing the last admin
    if is_admin {
        let admin_count: i64 = sqlx::query_scalar(
            r#"SELECT COUNT(*) FROM "User" WHERE role = 'admin' OR id = (SELECT id FROM "User" ORDER BY created_at ASC LIMIT 1)"#
        )
        .fetch_one(&state.biz_context.pool)
        .await
        .unwrap_or(0);
        if admin_count <= 1 {
            return Err(AppError::InvalidInput("Cannot remove the last remaining workspace admin".to_string()));
        }
    }

    sqlx::query(r#"DELETE FROM "User" WHERE id = $1"#)
        .bind(&id)
        .execute(&state.biz_context.pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

    Ok(Json(ApiResponse::new(WorkspaceMutationResponse {
        success: true,
        id,
    })))
}

/// Cancel workspace invitation
pub async fn cancel_workspace_invitation_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<WorkspaceMutationResponse>>, AppError> {
    ensure_admin_or_owner(&state, &auth).await?;

    let result = sqlx::query(r#"DELETE FROM "WorkspaceInvitation" WHERE id = $1 OR email = $1 OR token = $1"#)
        .bind(&id)
        .execute(&state.biz_context.pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Invitation not found".to_string()));
    }

    Ok(Json(ApiResponse::new(WorkspaceMutationResponse {
        success: true,
        id,
    })))
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
        .ok_or_else(|| AppError::InvalidInput("memberId is required".to_string()))?
        .to_string();

    if target_member_id == auth.user.id {
        return Err(AppError::InvalidInput("Cannot transfer ownership to yourself".to_string()));
    }

    let _target_user = cms_db::auth::UserQueries::get_by_id(&state.biz_context.pool, &target_member_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Target member not found".to_string()))?;

    // Promote target member to admin in User table
    sqlx::query(r#"UPDATE "User" SET role = 'admin', updated_at = NOW() WHERE id = $1"#)
        .bind(&target_member_id)
        .execute(&state.biz_context.pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

    Ok(Json(ApiResponse::new(WorkspaceMutationResponse {
        success: true,
        id: target_member_id,
    })))
}

/// Delete workspace
pub async fn delete_workspace_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
) -> Result<Json<ApiResponse<WorkspaceMutationResponse>>, AppError> {
    ensure_admin_or_owner(&state, &auth).await?;

    // In company internal deployment: Deleting workspace resets all documentation projects
    sqlx::query(r#"DELETE FROM "Project""#)
        .execute(&state.biz_context.pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

    // Also clear pending invitations
    sqlx::query(r#"DELETE FROM "WorkspaceInvitation""#)
        .execute(&state.biz_context.pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

    Ok(Json(ApiResponse::new(WorkspaceMutationResponse {
        success: true,
        id: "workspace".to_string(),
    })))
}
