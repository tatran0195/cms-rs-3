use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    Json,
};
use cms_biz::project::ProjectService;
use cms_entity::{
    common::Id,
    project::{
        CreateProjectRequest, ListProjectsQuery, ListProjectsResponse, ProjectWithOrgResponse, UpdateProjectRequest,
        UpdateProjectSettingsRequest,
    },
};
use cms_error::AppError;
use cms_middleware::app_state::AppState;

use crate::auth::AuthExtractor;

/// List all projects for the authenticated user
///
/// Returns a paginated list of projects that the user has access to.
#[utoipa::path(
    get,
    path = "/projects",
    tag = "projects",
    security(
        ("bearerAuth" = []),
        ("apiKeyAuth" = []),
        ("cookieAuth" = []),
    ),
    params(
        ("page", Query, description = "Page number"),
        ("limit", Query, description = "Items per page"),
    ),
    responses(
        (status = 200, description = "List of projects", body = ListProjectsResponse),
        (status = 401, description = "Unauthorized"),
    )
)]
pub async fn list_projects_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Query(query): Query<ListProjectsQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    let result = ProjectService::list_all_projects_for_user(
        &state.biz_context,
        &auth.user.id,
        query.page.unwrap_or(1),
        query.limit.unwrap_or(100),
    )
    .await?;

    Ok(Json(serde_json::json!({ "data": result.data })))
}

/// Create a new project
///
/// Creates a new project within an organization.
#[utoipa::path(
    post,
    path = "/projects",
    tag = "projects",
    security(
        ("bearerAuth" = []),
        ("apiKeyAuth" = []),
        ("cookieAuth" = []),
    ),
    request_body = CreateProjectRequest,
    responses(
        (status = 200, description = "Project created successfully", body = ProjectWithOrgResponse),
        (status = 400, description = "Bad request"),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Forbidden - user may not have permission"),
    )
)]
pub async fn create_project_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Json(request): Json<CreateProjectRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let org_id = request.organization_id.clone().unwrap_or_default();
    let project =
        ProjectService::create_project(&state.biz_context, &auth.user.id, &org_id, request).await?;

    Ok(Json(serde_json::json!({ "data": project })))
}

/// Get project handler
pub async fn get_project_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<Id>,
) -> Result<Json<serde_json::Value>, AppError> {
    let project =
        ProjectService::get_project(&state.biz_context, &auth.user.id, &project_id).await?;

    Ok(Json(serde_json::json!({ "data": project })))
}

/// Update project handler
pub async fn update_project_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<Id>,
    Json(request): Json<UpdateProjectRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let project =
        ProjectService::update_project(&state.biz_context, &auth.user.id, &project_id, request)
            .await?;

    Ok(Json(serde_json::json!({ "data": project })))
}

/// Delete project handler
pub async fn delete_project_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<Id>,
) -> Result<Json<serde_json::Value>, AppError> {
    ProjectService::delete_project(&state.biz_context, &auth.user.id, &project_id).await?;

    Ok(Json(
        serde_json::json!({ "data": { "success": true, "id": project_id } }),
    ))
}

/// Get project settings handler
pub async fn get_project_settings_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<Id>,
) -> Result<Json<serde_json::Value>, AppError> {
    let settings =
        ProjectService::get_project_settings(&state.biz_context, &auth.user.id, &project_id)
            .await?;

    Ok(Json(serde_json::json!({ "data": settings })))
}

/// Update project settings handler
pub async fn update_project_settings_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<Id>,
    Json(request): Json<UpdateProjectSettingsRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let settings = ProjectService::update_project_settings(
        &state.biz_context,
        &auth.user.id,
        &project_id,
        request,
    )
    .await?;

    Ok(Json(serde_json::json!({ "data": settings })))
}

/// List project addons handler
pub async fn list_project_addons_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<Id>,
) -> Result<Json<serde_json::Value>, AppError> {
    let addons =
        ProjectService::list_project_addons(&state.biz_context, &auth.user.id, &project_id).await?;

    Ok(Json(serde_json::json!({ "data": addons })))
}
