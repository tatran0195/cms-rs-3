use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use cms_biz::project::ProjectService;
use cms_entity::{
    common::ApiResponse,
    id::ProjectId,
    project::{
        CreateProjectRequest, DeleteProjectResponse, ListProjectsQuery, ListProjectsResponse,
        ProjectAddonResponse, ProjectResponse, ProjectSettings,
        UpdateProjectRequest, UpdateProjectSettingsRequest,
    },
};
use cms_error::AppError;
use cms_middleware::app_state::AppState;

use crate::{auth::AuthExtractor, validation::ValidatedJson};

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
) -> Result<Json<ApiResponse<Vec<ProjectResponse>>>, AppError> {
    let candidates = ProjectService::list_all_projects_for_user(
        &state.biz_context,
        &auth.user.id,
        query.page.unwrap_or(1),
        query.limit.unwrap_or(100),
    )
    .await?;

    let auth_user = auth.to_auth_user(&state);
    let session = state.gatehouse.session();

    let targets: Vec<cms_authz::ProjectTarget> = candidates
        .data
        .iter()
        .map(|p| cms_authz::ProjectTarget {
            id: p.id.to_string(),
            is_public: p.is_public,
            owner_id: None,
        })
        .collect();

    let authorized_targets = state
        .gatehouse
        .project_checker
        .bind(&session, &auth_user, &cms_authz::ProjectAction::View, &())
        .try_filter(targets)
        .await
        .map_err(|_| AppError::Forbidden)?;

    let allowed_ids: std::collections::HashSet<String> =
        authorized_targets.into_iter().map(|t| t.id).collect();

    let filtered: Vec<ProjectResponse> = candidates
        .data
        .into_iter()
        .filter(|p| allowed_ids.contains(&p.id.to_string()))
        .collect();

    let total = filtered.len() as u64;
    let paginated = cms_entity::common::PaginatedResponse::new(
        filtered,
        total,
        candidates.page,
        candidates.page_size,
    );

    Ok(Json(ApiResponse::from(paginated)))
}

/// Create a new project
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
        (status = 201, description = "Project created successfully", body = ApiResponse<ProjectResponse>),
        (status = 400, description = "Bad request"),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Forbidden - user may not have permission"),
    )
)]
pub async fn create_project_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    ValidatedJson(request): ValidatedJson<CreateProjectRequest>,
) -> Result<(StatusCode, Json<ApiResponse<ProjectResponse>>), AppError> {
    let project =
        ProjectService::create_project(&state.biz_context, &auth.user.id, request).await?;

    Ok((StatusCode::CREATED, Json(ApiResponse::new(project))))
}

/// Get project handler
#[utoipa::path(
    get,
    path = "/projects/{id}",
    tag = "projects",
    security(
        ("bearerAuth" = []),
        ("apiKeyAuth" = []),
        ("cookieAuth" = []),
    ),
    params(
        ("id", Path, description = "Project ID"),
    ),
    responses(
        (status = 200, description = "Project details", body = ApiResponse<ProjectResponse>),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Project not found"),
    )
)]
pub async fn get_project_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<ProjectId>,
) -> Result<Json<ApiResponse<ProjectResponse>>, AppError> {
    let project =
        ProjectService::get_project(&state.biz_context, &auth.user.id, &project_id).await?;

    let target = cms_authz::ProjectTarget {
        id: project.id.to_string(),
        is_public: project.is_public,
        owner_id: None,
    };

    let auth_user = auth.to_auth_user(&state);
    let session = state.gatehouse.session();
    state
        .gatehouse
        .project_checker
        .bind(&session, &auth_user, &cms_authz::ProjectAction::View, &())
        .authorize(&target)
        .await
        .map_err(|_| AppError::Forbidden)?;

    Ok(Json(ApiResponse::new(project)))
}

/// Update project handler
#[utoipa::path(
    put,
    path = "/projects/{id}",
    tag = "projects",
    security(
        ("bearerAuth" = []),
        ("apiKeyAuth" = []),
        ("cookieAuth" = []),
    ),
    params(
        ("id", Path, description = "Project ID"),
    ),
    request_body = UpdateProjectRequest,
    responses(
        (status = 200, description = "Project updated successfully", body = ApiResponse<ProjectResponse>),
        (status = 400, description = "Bad request"),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Forbidden"),
        (status = 404, description = "Project not found"),
    )
)]
pub async fn update_project_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<ProjectId>,
    ValidatedJson(request): ValidatedJson<UpdateProjectRequest>,
) -> Result<Json<ApiResponse<ProjectResponse>>, AppError> {
    let project =
        ProjectService::update_project(&state.biz_context, &auth.user.id, &project_id, request)
            .await?;

    Ok(Json(ApiResponse::new(project)))
}

/// Delete project handler
#[utoipa::path(
    delete,
    path = "/projects/{id}",
    tag = "projects",
    security(
        ("bearerAuth" = []),
        ("apiKeyAuth" = []),
        ("cookieAuth" = []),
    ),
    params(
        ("id", Path, description = "Project ID"),
    ),
    responses(
        (status = 200, description = "Project deleted successfully", body = ApiResponse<DeleteProjectResponse>),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Forbidden"),
        (status = 404, description = "Project not found"),
    )
)]
pub async fn delete_project_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<ProjectId>,
) -> Result<Json<ApiResponse<DeleteProjectResponse>>, AppError> {
    ProjectService::delete_project(&state.biz_context, &auth.user.id, &project_id).await?;

    Ok(Json(ApiResponse::new(DeleteProjectResponse::new(
        project_id,
    ))))
}

/// Get project settings handler
#[utoipa::path(
    get,
    path = "/projects/{id}/settings",
    tag = "projects",
    security(
        ("bearerAuth" = []),
        ("apiKeyAuth" = []),
        ("cookieAuth" = []),
    ),
    params(
        ("id", Path, description = "Project ID"),
    ),
    responses(
        (status = 200, description = "Project settings", body = ApiResponse<ProjectSettings>),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Forbidden"),
        (status = 404, description = "Project not found"),
    )
)]
pub async fn get_project_settings_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<ProjectId>,
) -> Result<Json<ApiResponse<ProjectSettings>>, AppError> {
    let settings =
        ProjectService::get_project_settings(&state.biz_context, &auth.user.id, &project_id)
            .await?;

    Ok(Json(ApiResponse::new(settings)))
}

/// Update project settings handler
#[utoipa::path(
    put,
    path = "/projects/{id}/settings",
    tag = "projects",
    security(
        ("bearerAuth" = []),
        ("apiKeyAuth" = []),
        ("cookieAuth" = []),
    ),
    params(
        ("id", Path, description = "Project ID"),
    ),
    request_body = UpdateProjectSettingsRequest,
    responses(
        (status = 200, description = "Project settings updated", body = ApiResponse<ProjectSettings>),
        (status = 400, description = "Bad request"),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Forbidden"),
        (status = 404, description = "Project not found"),
    )
)]
pub async fn update_project_settings_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<ProjectId>,
    Json(request): Json<UpdateProjectSettingsRequest>,
) -> Result<Json<ApiResponse<ProjectSettings>>, AppError> {
    let settings = ProjectService::update_project_settings(
        &state.biz_context,
        &auth.user.id,
        &project_id,
        request,
    )
    .await?;

    Ok(Json(ApiResponse::new(settings)))
}

/// List project addons handler
#[utoipa::path(
    get,
    path = "/projects/{id}/addons",
    tag = "projects",
    security(
        ("bearerAuth" = []),
        ("apiKeyAuth" = []),
        ("cookieAuth" = []),
    ),
    params(
        ("id", Path, description = "Project ID"),
    ),
    responses(
        (status = 200, description = "List of project addons", body = ApiResponse<Vec<ProjectAddonResponse>>),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Forbidden"),
        (status = 404, description = "Project not found"),
    )
)]
pub async fn list_project_addons_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<ProjectId>,
) -> Result<Json<ApiResponse<Vec<ProjectAddonResponse>>>, AppError> {
    let addons =
        ProjectService::list_project_addons(&state.biz_context, &auth.user.id, &project_id).await?;

    Ok(Json(ApiResponse::new(addons)))
}
