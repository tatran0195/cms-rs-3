//! HTTP Handlers for Permission Catalogs and Custom Roles (Workspace & Project)

use std::sync::Arc;
use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use cms_db::authz::{OrgRoleQueries, ProjectRoleQueries};
use cms_entity::{
    authz::{
        Action, CreateRoleRequest, OrganizationRole, PermissionCatalog,
        PermissionCatalogResource, ProjectPermissions, ProjectResource, ProjectRole,
        RoleUsageResponse, UpdateRoleRequest, WorkspacePermissions, WorkspaceResource,
    },
    common::{ApiResponse, SuccessResponse},
};
use cms_error::AppError;
use cms_middleware::app_state::AppState;

use crate::extractors::{
    ProjectAuth, WorkspaceAuth,
    ACTION_CREATE, ACTION_DELETE, ACTION_EDIT, ACTION_READ,
    PROJECT_ROLES, WORKSPACE_ROLES,
};

/// Combined dual-domain catalog response
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct FullPermissionCatalogResponse {
    pub workspace: PermissionCatalog<WorkspaceResource>,
    pub project: PermissionCatalog<ProjectResource>,
}

/// Query parameters for deleting a role with optional reassignment
#[derive(Debug, Clone, Deserialize)]
pub struct DeleteRoleQuery {
    pub target_role_id: Option<String>,
}

/// Dynamic permission catalog endpoint returning supported resources and actions
pub async fn get_permission_catalog_handler() -> Json<ApiResponse<FullPermissionCatalogResponse>> {
    let workspace_resources = vec![
        WorkspaceResource::Projects,
        WorkspaceResource::Members,
        WorkspaceResource::Roles,
        WorkspaceResource::ApiKeys,
        WorkspaceResource::AuditLogs,
        WorkspaceResource::Settings,
        WorkspaceResource::DangerZone,
    ];

    let workspace_catalog = PermissionCatalog {
        resources: workspace_resources
            .into_iter()
            .map(|res| PermissionCatalogResource {
                actions: res.supported_actions().to_vec(),
                key: res,
            })
            .collect(),
        actions: vec![
            Action::Create,
            Action::Read,
            Action::Edit,
            Action::Delete,
        ],
    };

    let project_resources = vec![
        ProjectResource::Pages,
        ProjectResource::Branches,
        ProjectResource::Deployments,
        ProjectResource::Domains,
        ProjectResource::Openapi,
        ProjectResource::Assets,
        ProjectResource::Addons,
        ProjectResource::Members,
        ProjectResource::Roles,
        ProjectResource::Analytics,
        ProjectResource::Comments,
        ProjectResource::DangerZone,
    ];

    let project_catalog = PermissionCatalog {
        resources: project_resources
            .into_iter()
            .map(|res| PermissionCatalogResource {
                actions: res.supported_actions().to_vec(),
                key: res,
            })
            .collect(),
        actions: vec![
            Action::Create,
            Action::Read,
            Action::Edit,
            Action::Delete,
            Action::Publish,
        ],
    };

    Json(ApiResponse::new(FullPermissionCatalogResponse {
        workspace: workspace_catalog,
        project: project_catalog,
    }))
}

// ---------------------------------------------------------------------------
// Workspace Roles Handlers
// ---------------------------------------------------------------------------

/// List workspace roles
pub async fn list_workspace_roles_handler(
    State(state): State<Arc<AppState>>,
    _guard: WorkspaceAuth<{ WORKSPACE_ROLES }, { ACTION_READ }>,
    Path(org_id): Path<String>,
) -> Result<Json<ApiResponse<Vec<OrganizationRole>>>, AppError> {
    let mut roles = OrgRoleQueries::list_by_org(&state.biz_context.pool, &org_id).await?;
    if roles.is_empty() {
        OrgRoleQueries::seed_defaults(&state.biz_context.pool, &org_id).await?;
        roles = OrgRoleQueries::list_by_org(&state.biz_context.pool, &org_id).await?;
    }
    Ok(Json(ApiResponse::new(roles)))
}

/// Create a workspace role
pub async fn create_workspace_role_handler(
    State(state): State<Arc<AppState>>,
    _guard: WorkspaceAuth<{ WORKSPACE_ROLES }, { ACTION_CREATE }>,
    Path(org_id): Path<String>,
    Json(payload): Json<CreateRoleRequest>,
) -> Result<Json<ApiResponse<OrganizationRole>>, AppError> {
    let name = payload.name.trim();
    if name.is_empty() || name.chars().count() > 100 {
        return Err(AppError::InvalidInput("Role name must be between 1 and 100 characters".to_string()));
    }

    let normalized = WorkspacePermissions::normalize(payload.permissions);
    let perms_val = serde_json::to_value(&normalized).map_err(|e| AppError::Internal(e.into()))?;

    let role = OrgRoleQueries::create(
        &state.biz_context.pool,
        &org_id,
        name,
        payload.description.as_deref(),
        payload.is_default,
        perms_val,
    )
    .await?;

    Ok(Json(ApiResponse::new(role)))
}

/// Get a specific workspace role
pub async fn get_workspace_role_handler(
    State(state): State<Arc<AppState>>,
    _guard: WorkspaceAuth<{ WORKSPACE_ROLES }, { ACTION_READ }>,
    Path((org_id, role_id)): Path<(String, String)>,
) -> Result<Json<ApiResponse<OrganizationRole>>, AppError> {
    let role = OrgRoleQueries::get_by_id(&state.biz_context.pool, &role_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Role not found".to_string()))?;

    if role.organization_id != org_id {
        return Err(AppError::NotFound("Role not found in this workspace".to_string()));
    }

    Ok(Json(ApiResponse::new(role)))
}

/// Update an existing workspace role
pub async fn update_workspace_role_handler(
    State(state): State<Arc<AppState>>,
    _guard: WorkspaceAuth<{ WORKSPACE_ROLES }, { ACTION_EDIT }>,
    Path((org_id, role_id)): Path<(String, String)>,
    Json(payload): Json<UpdateRoleRequest>,
) -> Result<Json<ApiResponse<OrganizationRole>>, AppError> {
    if let Some(ref n) = payload.name {
        let trimmed = n.trim();
        if trimmed.is_empty() || trimmed.chars().count() > 100 {
            return Err(AppError::InvalidInput("Role name must be between 1 and 100 characters".to_string()));
        }
    }

    let perms_val = if let Some(raw_perms) = payload.permissions {
        let normalized = WorkspacePermissions::normalize(raw_perms);
        Some(serde_json::to_value(&normalized).map_err(|e| AppError::Internal(e.into()))?)
    } else {
        None
    };

    let updated = OrgRoleQueries::update(
        &state.biz_context.pool,
        &org_id,
        &role_id,
        payload.name.as_deref().map(|s| s.trim()),
        payload.description.as_deref(),
        payload.is_default,
        perms_val,
    )
    .await?;

    Ok(Json(ApiResponse::new(updated)))
}

/// Get usage count of a workspace role
pub async fn get_workspace_role_usage_handler(
    State(state): State<Arc<AppState>>,
    _guard: WorkspaceAuth<{ WORKSPACE_ROLES }, { ACTION_READ }>,
    Path((_org_id, role_id)): Path<(String, String)>,
) -> Result<Json<ApiResponse<RoleUsageResponse>>, AppError> {
    let usage_count = OrgRoleQueries::count_usage(&state.biz_context.pool, &role_id).await?;
    Ok(Json(ApiResponse::new(RoleUsageResponse { usage_count })))
}

/// Delete a workspace role with safety reassign check
pub async fn delete_workspace_role_handler(
    State(state): State<Arc<AppState>>,
    _guard: WorkspaceAuth<{ WORKSPACE_ROLES }, { ACTION_DELETE }>,
    Path((org_id, role_id)): Path<(String, String)>,
    Query(query): Query<DeleteRoleQuery>,
) -> Result<Json<ApiResponse<SuccessResponse>>, AppError> {
    let usage = OrgRoleQueries::count_usage(&state.biz_context.pool, &role_id).await?;
    if usage > 0 && query.target_role_id.is_none() {
        return Err(AppError::Conflict(
            "Role is assigned to active members. Provide target_role_id to reassign before deleting.".to_string(),
        ));
    }

    OrgRoleQueries::delete_with_reassign(
        &state.biz_context.pool,
        &org_id,
        &role_id,
        query.target_role_id.as_deref(),
    )
    .await?;

    Ok(Json(ApiResponse::new(SuccessResponse::ok())))
}

// ---------------------------------------------------------------------------
// Project Roles Handlers
// ---------------------------------------------------------------------------

/// List project roles
pub async fn list_project_roles_handler(
    State(state): State<Arc<AppState>>,
    _guard: ProjectAuth<{ PROJECT_ROLES }, { ACTION_READ }>,
    Path(project_id): Path<String>,
) -> Result<Json<ApiResponse<Vec<ProjectRole>>>, AppError> {
    let mut roles = ProjectRoleQueries::list_by_project(&state.biz_context.pool, &project_id).await?;
    if roles.is_empty() {
        ProjectRoleQueries::seed_defaults(&state.biz_context.pool, &project_id).await?;
        roles = ProjectRoleQueries::list_by_project(&state.biz_context.pool, &project_id).await?;
    }
    Ok(Json(ApiResponse::new(roles)))
}

/// Create a project role
pub async fn create_project_role_handler(
    State(state): State<Arc<AppState>>,
    _guard: ProjectAuth<{ PROJECT_ROLES }, { ACTION_CREATE }>,
    Path(project_id): Path<String>,
    Json(payload): Json<CreateRoleRequest>,
) -> Result<Json<ApiResponse<ProjectRole>>, AppError> {
    let name = payload.name.trim();
    if name.is_empty() || name.chars().count() > 100 {
        return Err(AppError::InvalidInput("Role name must be between 1 and 100 characters".to_string()));
    }

    let normalized = ProjectPermissions::normalize(payload.permissions);
    let perms_val = serde_json::to_value(&normalized).map_err(|e| AppError::Internal(e.into()))?;

    let role = ProjectRoleQueries::create(
        &state.biz_context.pool,
        &project_id,
        name,
        payload.description.as_deref(),
        payload.is_default,
        perms_val,
    )
    .await?;

    Ok(Json(ApiResponse::new(role)))
}

/// Get a specific project role
pub async fn get_project_role_handler(
    State(state): State<Arc<AppState>>,
    _guard: ProjectAuth<{ PROJECT_ROLES }, { ACTION_READ }>,
    Path((project_id, role_id)): Path<(String, String)>,
) -> Result<Json<ApiResponse<ProjectRole>>, AppError> {
    let role = ProjectRoleQueries::get_by_id(&state.biz_context.pool, &role_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Role not found".to_string()))?;

    if role.project_id != project_id {
        return Err(AppError::NotFound("Role not found in this project".to_string()));
    }

    Ok(Json(ApiResponse::new(role)))
}

/// Update an existing project role
pub async fn update_project_role_handler(
    State(state): State<Arc<AppState>>,
    _guard: ProjectAuth<{ PROJECT_ROLES }, { ACTION_EDIT }>,
    Path((project_id, role_id)): Path<(String, String)>,
    Json(payload): Json<UpdateRoleRequest>,
) -> Result<Json<ApiResponse<ProjectRole>>, AppError> {
    if let Some(ref n) = payload.name {
        let trimmed = n.trim();
        if trimmed.is_empty() || trimmed.chars().count() > 100 {
            return Err(AppError::InvalidInput("Role name must be between 1 and 100 characters".to_string()));
        }
    }

    let perms_val = if let Some(raw_perms) = payload.permissions {
        let normalized = ProjectPermissions::normalize(raw_perms);
        Some(serde_json::to_value(&normalized).map_err(|e| AppError::Internal(e.into()))?)
    } else {
        None
    };

    let updated = ProjectRoleQueries::update(
        &state.biz_context.pool,
        &project_id,
        &role_id,
        payload.name.as_deref().map(|s| s.trim()),
        payload.description.as_deref(),
        payload.is_default,
        perms_val,
    )
    .await?;

    Ok(Json(ApiResponse::new(updated)))
}

/// Get usage count of a project role
pub async fn get_project_role_usage_handler(
    State(state): State<Arc<AppState>>,
    _guard: ProjectAuth<{ PROJECT_ROLES }, { ACTION_READ }>,
    Path((_project_id, role_id)): Path<(String, String)>,
) -> Result<Json<ApiResponse<RoleUsageResponse>>, AppError> {
    let usage_count = ProjectRoleQueries::count_usage(&state.biz_context.pool, &role_id).await?;
    Ok(Json(ApiResponse::new(RoleUsageResponse { usage_count })))
}

/// Delete a project role with safety reassign check
pub async fn delete_project_role_handler(
    State(state): State<Arc<AppState>>,
    _guard: ProjectAuth<{ PROJECT_ROLES }, { ACTION_DELETE }>,
    Path((project_id, role_id)): Path<(String, String)>,
    Query(query): Query<DeleteRoleQuery>,
) -> Result<Json<ApiResponse<SuccessResponse>>, AppError> {
    let usage = ProjectRoleQueries::count_usage(&state.biz_context.pool, &role_id).await?;
    if usage > 0 && query.target_role_id.is_none() {
        return Err(AppError::Conflict(
            "Role is assigned to active project members. Provide target_role_id to reassign before deleting.".to_string(),
        ));
    }

    ProjectRoleQueries::delete_with_reassign(
        &state.biz_context.pool,
        &project_id,
        &role_id,
        query.target_role_id.as_deref(),
    )
    .await?;

    Ok(Json(ApiResponse::new(SuccessResponse::ok())))
}
