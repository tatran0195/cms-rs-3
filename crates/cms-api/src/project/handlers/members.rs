use std::sync::Arc;

use axum::{
    extract::{Path, State},
    Json,
};
use cms_entity::{
    common::{ApiResponse, SuccessResponse},
    org::{
        MemberResponse, WorkspaceInvitationResponse, WorkspaceMemberItem, WorkspaceMemberUser,
        WorkspaceMembersResponse, WorkspaceMutationResponse,
    },
};
use cms_error::AppError;
use cms_middleware::app_state::AppState;

use super::common::project_org_id;
use crate::auth::AuthExtractor;

/// Map an SPA role string ("owner"/"admin"/"member") to the internal MemberRole.
fn parse_member_role(role: Option<&str>) -> Result<cms_entity::common::MemberRole, AppError> {
    use cms_entity::common::MemberRole;
    Ok(match role {
        Some("owner") => MemberRole::Owner,
        Some("admin") => MemberRole::Admin,
        Some("member") | Some("editor") => MemberRole::Member,
        _ => MemberRole::Member,
    })
}

/// Project members list
pub async fn list_project_members_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
) -> Result<Json<ApiResponse<WorkspaceMembersResponse>>, AppError> {
    let project =
        cms_db::project::ProjectQueries::get_by_id(&state.biz_context.pool, &project_id).await?;
    if let Some(p) = project {
        let proj_members = cms_db::authz::ProjectMemberQueries::list_by_project(
            &state.biz_context.pool,
            &project_id,
        )
        .await
        .unwrap_or_default();

        let items: Vec<WorkspaceMemberItem> = if !proj_members.is_empty() {
            let uids: Vec<&str> = proj_members.iter().map(|m| m.user_id.as_str()).collect();
            let users = cms_db::auth::UserQueries::get_by_ids(&state.biz_context.pool, &uids)
                .await
                .unwrap_or_default();
            let user_map: std::collections::HashMap<String, cms_entity::auth::User> =
                users.into_iter().map(|u| (u.id.clone(), u)).collect();

            proj_members
                .into_iter()
                .map(|m| {
                    let (user_name, user_email, user_image) = if let Some(u) = user_map.get(&m.user_id) {
                        (u.name.clone(), u.email.clone(), u.image.clone())
                    } else {
                        (auth.user.name.clone(), auth.user.email.clone(), auth.user.image.clone())
                    };
                    WorkspaceMemberItem {
                        id: m.id,
                        organization_id: p.organization_id.clone(),
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
                .collect()
        } else {
            let members = cms_db::org::MemberQueries::get_by_organization(
                &state.biz_context.pool,
                &p.organization_id,
                None,
                None,
                Some(100),
                None,
            )
            .await?;

            let user_ids: Vec<&str> = members.iter().map(|m| m.user_id.as_str()).collect();
            let users = cms_db::auth::UserQueries::get_by_ids(&state.biz_context.pool, &user_ids)
                .await
                .unwrap_or_default();
            let user_map: std::collections::HashMap<String, cms_entity::auth::User> =
                users.into_iter().map(|u| (u.id.clone(), u)).collect();

            members
                .into_iter()
                .map(|m| {
                    let (user_name, user_email, user_image) = if let Some(u) = user_map.get(&m.user_id)
                    {
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
                        organization_id: m.organization_id,
                        user_id: m.user_id.clone(),
                        role: format!("{:?}", m.role).to_lowercase(),
                        created_at: m.created_at,
                        user: WorkspaceMemberUser {
                            id: m.user_id,
                            name: user_name,
                            email: user_email,
                            image: user_image,
                        },
                    }
                })
                .collect()
        };

        let raw_invitations = cms_db::org::InvitationQueries::list_by_org(
            &state.biz_context.pool,
            &p.organization_id,
        )
        .await
        .unwrap_or_default();

        let invitations = raw_invitations;

        return Ok(Json(ApiResponse::new(WorkspaceMembersResponse {
            members: items,
            invitations,
        })));
    }

    Ok(Json(ApiResponse::new(WorkspaceMembersResponse {
        members: Vec::new(),
        invitations: Vec::new(),
    })))
}

/// Project member invite
///
/// Creates an invitation in the project's owning organization and returns the
/// invitation (with an `id` the SPA uses to build the accept link).
pub async fn invite_project_member_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<ApiResponse<WorkspaceInvitationResponse>>, AppError> {
    use cms_entity::org::CreateInvitationRequest;

    let org_id = project_org_id(&state, &auth, &project_id).await?;

    let email = body
        .get("email")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::InvalidInput("email is required".to_string()))?
        .to_string();
    let role = parse_member_role(body.get("role").and_then(|v| v.as_str()))?;

    let request = CreateInvitationRequest { email, role };

    let invitation = cms_biz::org::OrgService::create_invitation(
        &state.biz_context,
        &auth.user.id,
        &org_id,
        request,
    )
    .await?;

    Ok(Json(ApiResponse::new(WorkspaceInvitationResponse {
        id: invitation.id,
        organization_id: invitation.organization_id,
        email: invitation.email,
        role: format!("{:?}", invitation.role).to_lowercase(),
        expires_at: invitation.expires_at.to_rfc3339(),
        created_at: invitation.created_at.to_rfc3339(),
    })))
}

/// Project member role update
///
/// Changes a member's role via the org service (admin/owner guarded).
pub async fn update_project_member_role_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, id)): Path<(String, String)>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<ApiResponse<MemberResponse>>, AppError> {
    let org_id = project_org_id(&state, &auth, &project_id).await?;
    let role = parse_member_role(body.get("role").and_then(|v| v.as_str()))?;

    let member = cms_biz::org::OrgService::update_member_role(
        &state.biz_context,
        &auth.user.id,
        &org_id,
        &id,
        role,
    )
    .await?;

    let role_id = body.get("roleId").or_else(|| body.get("role_id")).and_then(|v| v.as_str());
    if let Ok(Some(pm)) = cms_db::authz::ProjectMemberQueries::get_by_user_and_project(&state.biz_context.pool, &id, &project_id).await {
        let role_str = body.get("role").and_then(|v| v.as_str()).unwrap_or(&pm.role);
        let _ = cms_db::authz::ProjectMemberQueries::update_role(
            &state.biz_context.pool,
            &pm.id,
            &project_id,
            Some(role_str),
            role_id,
        ).await;
    }

    Ok(Json(ApiResponse::new(member)))
}

/// Project member remove
///
/// Removes a member from the project's owning organization.
pub async fn remove_project_member_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, id)): Path<(String, String)>,
) -> Result<Json<ApiResponse<WorkspaceMutationResponse>>, AppError> {
    let org_id = project_org_id(&state, &auth, &project_id).await?;
    cms_biz::org::OrgService::remove_member(&state.biz_context, &auth.user.id, &org_id, &id)
        .await?;
    let _ = cms_db::authz::ProjectMemberQueries::remove(&state.biz_context.pool, &id, &project_id).await;
    Ok(Json(ApiResponse::new(WorkspaceMutationResponse {
        success: true,
        id,
    })))
}

/// Project ownership transfer
///
/// Atomically promotes the target member to Owner and demotes the current owner(s)
/// to Admin. Guarded so only the current owner may perform it.
pub async fn transfer_project_ownership_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<ApiResponse<SuccessResponse>>, AppError> {
    use cms_db::org::MemberQueries;

    let org_id = project_org_id(&state, &auth, &project_id).await?;
    let target_id = body
        .get("memberId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::InvalidInput("memberId is required".to_string()))?
        .to_string();

    // Only the current owner may transfer ownership.
    cms_biz::org::OrgService::update_member_role(
        &state.biz_context,
        &auth.user.id,
        &org_id,
        &target_id,
        cms_entity::common::MemberRole::Owner,
    )
    .await?;

    // Demote every other Owner (including the current actor) to Admin.
    let members = MemberQueries::get_by_organization(
        &state.biz_context.pool,
        &org_id,
        None,
        None,
        Some(500),
        None,
    )
    .await?;
    for m in members {
        if m.role == cms_entity::common::MemberRole::Owner && m.id != target_id {
            let _ = cms_biz::org::OrgService::update_member_role(
                &state.biz_context,
                &auth.user.id,
                &org_id,
                &m.id,
                cms_entity::common::MemberRole::Admin,
            )
            .await;
        }
    }

    Ok(Json(ApiResponse::new(SuccessResponse::ok())))
}

/// Project invitation revoke
///
/// Cancels a pending invitation in the project's owning organization.
pub async fn cancel_project_invitation_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, id)): Path<(String, String)>,
) -> Result<Json<ApiResponse<WorkspaceMutationResponse>>, AppError> {
    let org_id = project_org_id(&state, &auth, &project_id).await?;
    cms_biz::org::OrgService::revoke_invitation(&state.biz_context, &auth.user.id, &org_id, &id)
        .await?;
    Ok(Json(ApiResponse::new(WorkspaceMutationResponse {
        success: true,
        id,
    })))
}
