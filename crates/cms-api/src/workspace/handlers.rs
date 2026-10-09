//! Workspace and Members handlers
//!
//! Handlers for organization-level workspace settings, workspace analytics,
//! and workspace member management.

use std::sync::Arc;

use axum::{
    extract::{Path, State},
    Json,
};
use cms_entity::{
    common::ApiResponse,
    org::{
        InviteWorkspaceMemberRequest, MemberResponse, UpdateWorkspaceMemberRoleRequest,
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
    auth: AuthExtractor,
) -> Result<Json<ApiResponse<WorkspaceSettingsResponse>>, AppError> {
    let members =
        cms_db::org::MemberQueries::get_by_user(&state.biz_context.pool, &auth.user.id).await?;
    let org_id = members
        .first()
        .map(|m| m.organization_id.clone())
        .unwrap_or_default();

    let org = if !org_id.is_empty() {
        cms_db::org::OrganizationQueries::get_by_id(&state.biz_context.pool, &org_id).await?
    } else {
        None
    };

    let (name, slug) = org
        .map(|o| (o.name, o.slug))
        .unwrap_or_else(|| ("Workspace".to_string(), "workspace".to_string()));

    let project_count = if !org_id.is_empty() {
        cms_db::project::ProjectQueries::count_by_organization(
            &state.biz_context.pool,
            &org_id,
            None,
            None,
        )
        .await
        .unwrap_or(0)
    } else {
        0
    };

    let member_count = if !org_id.is_empty() {
        cms_db::org::MemberQueries::count_by_organization(
            &state.biz_context.pool,
            &org_id,
            None,
            None,
        )
        .await
        .unwrap_or(1)
    } else {
        1
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
    use cms_db::org::OrganizationQueries;

    let members =
        cms_db::org::MemberQueries::get_by_user(&state.biz_context.pool, &auth.user.id).await?;
    let org_id = match members.first() {
        Some(m) => m.organization_id.clone(),
        None => {
            let new_org = cms_biz::org::OrgService::create_organization(
                &state.biz_context,
                &auth.user.id,
                cms_entity::org::CreateOrganizationRequest {
                    name: body.name.clone().unwrap_or_else(|| "Workspace".to_string()),
                    description: None,
                },
            )
            .await?;
            new_org.id
        }
    };

    // Persist the editable workspace fields onto the owning organization.
    let name = body.name.as_deref().filter(|s| !s.trim().is_empty());
    let logo = body.logo.as_deref().or(body.logo_url.as_deref());
    let description = body.description.as_deref();

    if name.is_some() || logo.is_some() || description.is_some() {
        let _org =
            OrganizationQueries::update(&state.biz_context.pool, &org_id, name, description, logo)
                .await?;
    }

    // Return the updated workspace settings so the SPA reflects the change.
    get_workspace_settings_handler(State(state), auth).await
}

/// Get workspace analytics
///
/// Populates the dashboard shape from the workspace's real analytics store.
pub async fn get_workspace_analytics_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
) -> Result<Json<ApiResponse<WorkspaceAnalyticsResponse>>, AppError> {
    let org_id = match resolve_workspace_org(&state, &auth.user.id).await {
        Ok(id) => Some(id),
        Err(AppError::NotFound(_)) => None,
        Err(e) => return Err(e),
    };

    let stats = if let Some(ref org_id) = org_id {
        cms_biz::analytics::AnalyticsService::get_organization_stats(&state.biz_context, org_id)
            .await
            .unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

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
    auth: AuthExtractor,
) -> Result<Json<ApiResponse<WorkspaceMembersResponse>>, AppError> {
    let members =
        cms_db::org::MemberQueries::get_by_user(&state.biz_context.pool, &auth.user.id).await?;
    let org_id = members
        .first()
        .map(|m| m.organization_id.clone())
        .unwrap_or_default();

    if !org_id.is_empty() {
        let org_members = cms_db::org::MemberQueries::get_by_organization(
            &state.biz_context.pool,
            &org_id,
            None,
            None,
            Some(100),
            None,
        )
        .await?;

        let user_ids: Vec<&str> = org_members.iter().map(|m| m.user_id.as_str()).collect();
        let users = cms_db::auth::UserQueries::get_by_ids(&state.biz_context.pool, &user_ids)
            .await
            .unwrap_or_default();
        let user_map: std::collections::HashMap<String, cms_entity::auth::User> =
            users.into_iter().map(|u| (u.id.clone(), u)).collect();

        let items: Vec<WorkspaceMemberItem> = org_members
            .into_iter()
            .map(|m| {
                let (user_name, user_email, user_image) = if let Some(u) = user_map.get(&m.user_id)
                {
                    (u.name.clone(), u.email.clone(), u.image.clone())
                } else {
                    (None, String::new(), None)
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
            .collect();

        let invitations =
            cms_db::org::InvitationQueries::list_by_org(&state.biz_context.pool, &org_id)
                .await
                .unwrap_or_default();

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

/// Resolve the caller's workspace organization (the first org they belong to).
async fn resolve_workspace_org(state: &Arc<AppState>, user_id: &str) -> Result<String, AppError> {
    let members = cms_db::org::MemberQueries::get_by_user(&state.biz_context.pool, user_id).await?;
    members
        .first()
        .map(|m| m.organization_id.clone())
        .ok_or_else(|| AppError::NotFound("No workspace organization found".to_string()))
}

/// Map an SPA workspace role string to the internal MemberRole.
fn parse_workspace_role(role: Option<&str>) -> cms_entity::common::MemberRole {
    use cms_entity::common::MemberRole;
    match role {
        Some("owner") => MemberRole::Owner,
        Some("admin") => MemberRole::Admin,
        Some("member") | Some("editor") => MemberRole::Member,
        _ => MemberRole::Member,
    }
}

/// Invite workspace member
pub async fn invite_workspace_member_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    ValidatedJson(body): ValidatedJson<InviteWorkspaceMemberRequest>,
) -> Result<Json<ApiResponse<WorkspaceInvitationResponse>>, AppError> {
    let org_id = resolve_workspace_org(&state, &auth.user.id).await?;

    let role = parse_workspace_role(body.role.as_deref());

    let request = cms_entity::org::CreateInvitationRequest {
        email: body.email,
        role,
    };
    let invitation = cms_biz::org::OrgService::create_invitation(
        &state.biz_context,
        &auth.user.id,
        &org_id,
        request,
    )
    .await?;

    let response = WorkspaceInvitationResponse {
        id: invitation.id,
        organization_id: invitation.organization_id,
        email: invitation.email,
        role: format!("{:?}", invitation.role).to_lowercase(),
        expires_at: invitation.expires_at.to_rfc3339(),
        created_at: invitation.created_at.to_rfc3339(),
    };

    Ok(Json(ApiResponse::new(response)))
}

/// Update workspace member role
pub async fn update_workspace_member_role_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(id): Path<String>,
    Json(body): Json<UpdateWorkspaceMemberRoleRequest>,
) -> Result<Json<ApiResponse<MemberResponse>>, AppError> {
    let org_id = resolve_workspace_org(&state, &auth.user.id).await?;
    let role = parse_workspace_role(body.role.as_deref());
    let member = cms_biz::org::OrgService::update_member_role(
        &state.biz_context,
        &auth.user.id,
        &org_id,
        &id,
        role,
    )
    .await?;
    Ok(Json(ApiResponse::new(member)))
}

/// Remove workspace member
pub async fn remove_workspace_member_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<WorkspaceMutationResponse>>, AppError> {
    let org_id = resolve_workspace_org(&state, &auth.user.id).await?;
    cms_biz::org::OrgService::remove_member(&state.biz_context, &auth.user.id, &org_id, &id)
        .await?;
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
    let org_id = resolve_workspace_org(&state, &auth.user.id).await?;
    cms_biz::org::OrgService::revoke_invitation(&state.biz_context, &auth.user.id, &org_id, &id)
        .await?;
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
    use cms_db::org::MemberQueries;

    let org_id = resolve_workspace_org(&state, &auth.user.id).await?;
    let target_member_id = body
        .get("memberId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::InvalidInput("memberId is required".to_string()))?
        .to_string();

    // Verify caller is current owner of organization
    let caller_member = MemberQueries::get_by_user_and_org(&state.biz_context.pool, &auth.user.id, &org_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Caller membership not found".to_string()))?;
    if caller_member.role != cms_entity::common::MemberRole::Owner {
        return Err(AppError::Forbidden);
    }

    // Promote target member to Owner
    cms_biz::org::OrgService::update_member_role(
        &state.biz_context,
        &auth.user.id,
        &org_id,
        &target_member_id,
        cms_entity::common::MemberRole::Owner,
    )
    .await?;

    if caller_member.id != target_member_id {
        let _ = cms_biz::org::OrgService::update_member_role(
            &state.biz_context,
            &auth.user.id,
            &org_id,
            &caller_member.id,
            cms_entity::common::MemberRole::Admin,
        )
        .await;
    }

    Ok(Json(ApiResponse::new(WorkspaceMutationResponse {
        success: true,
        id: target_member_id,
    })))
}

/// Delete workspace organization
pub async fn delete_workspace_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
) -> Result<Json<ApiResponse<WorkspaceMutationResponse>>, AppError> {
    let org_id = resolve_workspace_org(&state, &auth.user.id).await?;
    let caller_member = cms_db::org::MemberQueries::get_by_user_and_org(&state.biz_context.pool, &auth.user.id, &org_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Caller membership not found".to_string()))?;
    if caller_member.role != cms_entity::common::MemberRole::Owner {
        return Err(AppError::Forbidden);
    }

    cms_biz::org::OrgService::delete_organization(&state.biz_context, &auth.user.id, &org_id).await?;

    Ok(Json(ApiResponse::new(WorkspaceMutationResponse {
        success: true,
        id: org_id,
    })))
}
