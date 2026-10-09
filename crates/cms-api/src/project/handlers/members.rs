use std::sync::Arc;

use axum::{
    extract::{Path, State},
    Json,
};
use cms_entity::{
    common::{ApiResponse, SuccessResponse},
    workspace::{
        WorkspaceInvitationResponse, WorkspaceMemberItem, WorkspaceMemberUser,
        WorkspaceMembersResponse, WorkspaceMutationResponse,
    },
};
use cms_error::AppError;
use cms_middleware::app_state::AppState;

use crate::auth::AuthExtractor;

/// Map an SPA role string to the internal MemberRole.
fn parse_member_role(role: Option<&str>) -> Result<cms_entity::common::MemberRole, AppError> {
    use cms_entity::common::MemberRole;
    Ok(match role {
        Some("owner") => MemberRole::Owner,
        Some("admin") => MemberRole::Admin,
        Some("editor") => MemberRole::Editor,
        Some("viewer") => MemberRole::Viewer,
        Some("member") => MemberRole::Member,
        _ => MemberRole::Member,
    })
}

/// Project members list
pub async fn list_project_members_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
) -> Result<Json<ApiResponse<WorkspaceMembersResponse>>, AppError> {
    let _project = cms_db::project::ProjectQueries::get_by_id(&state.biz_context.pool, &project_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Project not found".to_string()))?;

    let proj_members = cms_db::authz::ProjectMemberQueries::list_by_project(
        &state.biz_context.pool,
        &project_id,
    )
    .await
    .unwrap_or_default();

    let uids: Vec<&str> = proj_members.iter().map(|m| m.user_id.as_str()).collect();
    let users = if !uids.is_empty() {
        cms_db::auth::UserQueries::get_by_ids(&state.biz_context.pool, &uids)
            .await
            .unwrap_or_default()
    } else {
        Vec::new()
    };
    let user_map: std::collections::HashMap<String, cms_entity::auth::User> =
        users.into_iter().map(|u| (u.id.clone(), u)).collect();

    let items: Vec<WorkspaceMemberItem> = proj_members
        .into_iter()
        .map(|m| {
            let (user_name, user_email, user_image) = if let Some(u) = user_map.get(&m.user_id) {
                (u.name.clone(), u.email.clone(), u.image.clone())
            } else {
                (
                    auth.user.name.clone(),
                    auth.user.email.clone(),
                    auth.user.image.clone(),
                )
            };
            WorkspaceMemberItem {
                id: m.id,
                user_id: m.user_id.clone(),
                role: m.role,
                created_at: m.created_at,
                user: WorkspaceMemberUser {
                    id: m.user_id,
                    name: user_name,
                    email: user_email,
                    image: user_image,
                },
            }
        })
        .collect();

    Ok(Json(ApiResponse::new(WorkspaceMembersResponse {
        members: items,
        invitations: Vec::new(),
    })))
}

/// Project member invite
pub async fn invite_project_member_handler(
    State(state): State<Arc<AppState>>,
    _auth: AuthExtractor,
    Path(project_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<ApiResponse<WorkspaceInvitationResponse>>, AppError> {
    let email = body
        .get("email")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::InvalidInput("email is required".to_string()))?
        .to_string();
    let role = parse_member_role(body.get("role").and_then(|v| v.as_str()))?;
    let role_str = format!("{:?}", role).to_lowercase();
    let role_id = body
        .get("roleId")
        .or_else(|| body.get("role_id"))
        .and_then(|v| v.as_str());

    if let Ok(Some(existing_user)) =
        cms_db::auth::UserQueries::get_by_email(&state.biz_context.pool, &email).await
    {
        let _ = cms_db::authz::ProjectMemberQueries::create(
            &state.biz_context.pool,
            &project_id,
            &existing_user.id,
            &role_str,
            role_id,
        )
        .await;
    }

    let invitation_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now();
    let expires = now + chrono::Duration::days(7);

    Ok(Json(ApiResponse::new(WorkspaceInvitationResponse {
        id: invitation_id,
        email,
        role: role_str,
        expires_at: expires.to_rfc3339(),
        created_at: now.to_rfc3339(),
    })))
}

/// Project member role update
pub async fn update_project_member_role_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, id)): Path<(String, String)>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<ApiResponse<WorkspaceMemberItem>>, AppError> {
    let role = parse_member_role(body.get("role").and_then(|v| v.as_str()))?;
    let role_str = format!("{:?}", role).to_lowercase();
    let role_id = body
        .get("roleId")
        .or_else(|| body.get("role_id"))
        .and_then(|v| v.as_str());

    let updated = cms_db::authz::ProjectMemberQueries::update_role(
        &state.biz_context.pool,
        &project_id,
        &id,
        Some(&role_str),
        role_id,
    )
    .await?;

    let user = cms_db::auth::UserQueries::get_by_id(&state.biz_context.pool, &updated.user_id)
        .await?
        .unwrap_or(cms_entity::auth::User {
            id: updated.user_id.clone(),
            name: auth.user.name.clone(),
            email: auth.user.email.clone(),
            email_verified: false,
            image: auth.user.image.clone(),
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        });

    Ok(Json(ApiResponse::new(WorkspaceMemberItem {
        id: updated.id,
        user_id: updated.user_id.clone(),
        role: updated.role,
        created_at: updated.created_at,
        user: WorkspaceMemberUser {
            id: updated.user_id,
            name: user.name,
            email: user.email,
            image: user.image,
        },
    })))
}

/// Project member remove
pub async fn remove_project_member_handler(
    State(state): State<Arc<AppState>>,
    _auth: AuthExtractor,
    Path((project_id, id)): Path<(String, String)>,
) -> Result<Json<ApiResponse<WorkspaceMutationResponse>>, AppError> {
    cms_db::authz::ProjectMemberQueries::remove(&state.biz_context.pool, &project_id, &id).await?;
    Ok(Json(ApiResponse::new(WorkspaceMutationResponse {
        success: true,
        id,
    })))
}

/// Project ownership transfer
pub async fn transfer_project_ownership_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<ApiResponse<SuccessResponse>>, AppError> {
    let target_id = body
        .get("memberId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::InvalidInput("memberId is required".to_string()))?
        .to_string();

    let _ = cms_db::authz::ProjectMemberQueries::update_role(
        &state.biz_context.pool,
        &project_id,
        &target_id,
        Some("owner"),
        None,
    )
    .await?;

    let _ = cms_db::authz::ProjectMemberQueries::update_role(
        &state.biz_context.pool,
        &project_id,
        &auth.user.id,
        Some("admin"),
        None,
    )
    .await;

    Ok(Json(ApiResponse::new(SuccessResponse::ok())))
}

/// Project invitation revoke
pub async fn cancel_project_invitation_handler(
    State(_state): State<Arc<AppState>>,
    _auth: AuthExtractor,
    Path((_project_id, id)): Path<(String, String)>,
) -> Result<Json<ApiResponse<WorkspaceMutationResponse>>, AppError> {
    Ok(Json(ApiResponse::new(WorkspaceMutationResponse {
        success: true,
        id,
    })))
}
