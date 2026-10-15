//! Branch handlers
//!
//! This module contains the actual implementation of branch handlers.

use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    Json,
};
use cms_biz::branch::BranchService;
use cms_entity::{
    branch::{BranchResponse, CreateBranchRequest, ListBranchesQuery, UpdateBranchRequest},
    common::{Id, PaginatedResponse},
};
use cms_error::AppError;
use cms_middleware::app_state::AppState;

use cms_authz::Relation;
use cms_authz_gate::{require_parent_access, require_project_access, ParentLink};
use uuid::Uuid;

use crate::auth::AuthExtractor;

/// List branches for a project
///
/// Returns a paginated list of branches filtered by project and optional search criteria.
#[utoipa::path(
    get,
    path = "/branches",
    tag = "branches",
    security(
        ("bearerAuth" = []),
        ("apiKeyAuth" = []),
        ("cookieAuth" = []),
    ),
    params(
        ("project_id", Query, description = "Filter by project ID"),
        ("search", Query, description = "Search term for branch name or description"),
        ("limit", Query, description = "Number of items per page"),
        ("offset", Query, description = "Pagination offset"),
    ),
    responses(
        (status = 200, description = "List of branches", body = PaginatedResponse<BranchResponse>),
        (status = 401, description = "Unauthorized"),
        (status = 400, description = "Bad request"),
    )
)]
pub async fn list_branches_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Query(query): Query<ListBranchesQuery>,
) -> Result<Json<PaginatedResponse<BranchResponse>>, AppError> {
    if !query.project_id.is_empty() {
        if let Ok(project_uuid) = Uuid::parse_str(query.project_id.as_str()) {
            require_project_access(
                state.authz_backend(),
                &auth.authz_context(),
                project_uuid,
                Relation::Viewer,
            )
            .await?;
        }
    }

    let result =
        BranchService::list_branches(&state.biz_context, &auth.user.id, query, 1, 20).await?;

    Ok(Json(result))
}

/// Create a new branch
///
/// Creates a new branch within a project.
#[utoipa::path(
    post,
    path = "/branches",
    tag = "branches",
    security(
        ("bearerAuth" = []),
        ("apiKeyAuth" = []),
        ("cookieAuth" = []),
    ),
    request_body = CreateBranchRequest,
    responses(
        (status = 200, description = "Branch created successfully", body = BranchResponse),
        (status = 400, description = "Bad request"),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Forbidden - user may not have permission"),
    )
)]
pub async fn create_branch_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Json(request): Json<CreateBranchRequest>,
) -> Result<Json<BranchResponse>, AppError> {
    let project_uuid = Uuid::parse_str(&request.project_id)
        .map_err(|_| AppError::NotFound("Project not found".to_string()))?;
    require_project_access(
        state.authz_backend(),
        &auth.authz_context(),
        project_uuid,
        Relation::Editor,
    )
    .await?;

    let project_id = request.project_id.clone();
    let branch =
        BranchService::create_branch(&state.biz_context, &auth.user.id, &project_id, request)
            .await?;

    Ok(Json(branch.branch))
}

/// Get a specific branch by ID
///
/// Retrieves a branch by its unique identifier.
#[utoipa::path(
    get,
    path = "/branches/{branch_id}",
    tag = "branches",
    security(
        ("bearerAuth" = []),
        ("apiKeyAuth" = []),
        ("cookieAuth" = []),
    ),
    params(
        ("branch_id", Path, description = "The ID of the branch to retrieve"),
    ),
    responses(
        (status = 200, description = "Branch found", body = BranchResponse),
        (status = 404, description = "Branch not found"),
        (status = 401, description = "Unauthorized"),
    )
)]
pub async fn get_branch_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(branch_id): Path<Id>,
) -> Result<Json<BranchResponse>, AppError> {
    let branch_uuid = Uuid::parse_str(branch_id.as_str())
        .map_err(|_| AppError::NotFound("Branch not found".to_string()))?;
    require_parent_access(
        state.authz_backend(),
        &auth.authz_context(),
        &state.biz_context.pool,
        ParentLink::Branch(branch_uuid),
        Relation::Viewer,
    )
    .await?;

    let branch = BranchService::get_branch(&state.biz_context, &auth.user.id, &branch_id).await?;

    Ok(Json(branch.branch))
}

/// Update an existing branch
///
/// Updates a branch by its ID with the provided fields.
#[utoipa::path(
    put,
    path = "/branches/{branch_id}",
    tag = "branches",
    security(
        ("bearerAuth" = []),
        ("apiKeyAuth" = []),
        ("cookieAuth" = []),
    ),
    params(
        ("branch_id", Path, description = "The ID of the branch to update"),
    ),
    request_body = UpdateBranchRequest,
    responses(
        (status = 200, description = "Branch updated successfully", body = BranchResponse),
        (status = 400, description = "Bad request"),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Forbidden - user may not have permission"),
        (status = 404, description = "Branch not found"),
    )
)]
pub async fn update_branch_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(branch_id): Path<Id>,
    Json(request): Json<UpdateBranchRequest>,
) -> Result<Json<BranchResponse>, AppError> {
    let branch_uuid = Uuid::parse_str(branch_id.as_str())
        .map_err(|_| AppError::NotFound("Branch not found".to_string()))?;
    require_parent_access(
        state.authz_backend(),
        &auth.authz_context(),
        &state.biz_context.pool,
        ParentLink::Branch(branch_uuid),
        Relation::Editor,
    )
    .await?;

    let branch =
        BranchService::update_branch(&state.biz_context, &auth.user.id, &branch_id, request)
            .await?;

    Ok(Json(branch))
}

/// Delete a branch
///
/// Permanently deletes a branch by its ID.
#[utoipa::path(
    delete,
    path = "/branches/{branch_id}",
    tag = "branches",
    security(
        ("bearerAuth" = []),
        ("apiKeyAuth" = []),
        ("cookieAuth" = []),
    ),
    params(
        ("branch_id", Path, description = "The ID of the branch to delete"),
    ),
    responses(
        (status = 200, description = "Branch deleted successfully", body = serde_json::Value),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Forbidden - user may not have permission or branch is protected"),
        (status = 404, description = "Branch not found"),
    )
)]
pub async fn delete_branch_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(branch_id): Path<Id>,
) -> Result<Json<serde_json::Value>, AppError> {
    let branch_uuid = Uuid::parse_str(branch_id.as_str())
        .map_err(|_| AppError::NotFound("Branch not found".to_string()))?;
    require_parent_access(
        state.authz_backend(),
        &auth.authz_context(),
        &state.biz_context.pool,
        ParentLink::Branch(branch_uuid),
        Relation::Editor,
    )
    .await?;

    BranchService::delete_branch(&state.biz_context, &auth.user.id, &branch_id).await?;

    Ok(Json(serde_json::json!({"success": true, "id": branch_id})))
}
