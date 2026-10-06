use std::sync::Arc;

use axum::{
    extract::{Path, State},
    Json,
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
) -> Result<Json<serde_json::Value>, AppError> {
    let project =
        cms_db::project::ProjectQueries::get_by_id(&state.biz_context.pool, &project_id).await?;
    if let Some(p) = project {
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

        let items: Vec<serde_json::Value> = members
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
                serde_json::json!({
                    "id": m.id,
                    "organizationId": m.organization_id,
                    "userId": m.user_id,
                    "role": format!("{:?}", m.role).to_lowercase(),
                    "createdAt": m.created_at,
                    "user": {
                        "id": m.user_id,
                        "name": user_name,
                        "email": user_email,
                        "image": user_image,
                    }
                })
            })
            .collect();

        let invitations = cms_db::org::InvitationQueries::list_by_org(
            &state.biz_context.pool,
            &p.organization_id,
        )
        .await
        .unwrap_or_default();

        return Ok(Json(serde_json::json!({
            "data": {
                "members": items,
                "invitations": invitations
            }
        })));
    }
    Ok(Json(serde_json::json!({
        "data": {
            "members": [],
            "invitations": []
        }
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
) -> Result<Json<serde_json::Value>, AppError> {
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

    Ok(Json(serde_json::json!({
        "data": {
            "id": invitation.id,
            "organizationId": invitation.organization_id,
            "email": invitation.email,
            "role": format!("{:?}", invitation.role).to_lowercase(),
            "expiresAt": invitation.expires_at.to_rfc3339(),
            "createdAt": invitation.created_at.to_rfc3339(),
        }
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
) -> Result<Json<serde_json::Value>, AppError> {
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

    Ok(Json(serde_json::json!({ "data": member })))
}

/// Project member remove
///
/// Removes a member from the project's owning organization.
pub async fn remove_project_member_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, id)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, AppError> {
    let org_id = project_org_id(&state, &auth, &project_id).await?;
    cms_biz::org::OrgService::remove_member(&state.biz_context, &auth.user.id, &org_id, &id)
        .await?;
    Ok(Json(
        serde_json::json!({ "data": { "success": true, "id": id } }),
    ))
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
) -> Result<Json<serde_json::Value>, AppError> {
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

    Ok(Json(serde_json::json!({ "data": { "success": true } })))
}

/// Project invitation revoke
///
/// Cancels a pending invitation in the project's owning organization.
pub async fn cancel_project_invitation_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, id)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, AppError> {
    let org_id = project_org_id(&state, &auth, &project_id).await?;
    cms_biz::org::OrgService::revoke_invitation(&state.biz_context, &auth.user.id, &org_id, &id)
        .await?;
    Ok(Json(
        serde_json::json!({ "data": { "success": true, "id": id } }),
    ))
}
