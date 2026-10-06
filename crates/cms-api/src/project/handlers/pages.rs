use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    Json,
};
use cms_entity::{
    common::ApiResponse,
    id::{PageId, ProjectId},
    page::{
        CreatePageRequest, DeletePageResponse, PageListItem, PageResponse, ReorderPageTreeRequest,
        ReorderPageTreeResponse, UpdatePageRequest,
    },
};
use cms_error::AppError;
use cms_middleware::app_state::AppState;

use crate::{auth::AuthExtractor, validation::ValidatedJson};

/// List pages for a project
#[utoipa::path(
    get,
    path = "/api/app/projects/{project_id}/pages",
    tag = "projects",
    params(
        ("project_id" = ProjectId, Path, description = "Project ID"),
        ("branch_id", Query, description = "Filter by branch ID"),
        ("language_id", Query, description = "Filter by language ID"),
        ("parent_id", Query, description = "Filter by parent page ID"),
        ("search", Query, description = "Search query for title or content"),
        ("is_published", Query, description = "Filter by publication status"),
    ),
    responses(
        (status = 200, description = "List of project pages", body = ApiResponse<Vec<PageListItem>>),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Project not found"),
    )
)]
pub async fn list_project_pages_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<ProjectId>,
    Query(mut query): Query<cms_entity::page::ListPagesQuery>,
) -> Result<Json<ApiResponse<Vec<PageListItem>>>, AppError> {
    query.project_id = project_id.to_string();
    if query.branch_id.is_empty() {
        if let Ok(Some(b)) =
            cms_db::branch::BranchQueries::get_default(&state.biz_context.pool, project_id.as_str())
                .await
        {
            query.branch_id = b.id;
        } else if let Ok(Some(b)) = cms_db::branch::BranchQueries::get_by_project(
            &state.biz_context.pool,
            project_id.as_str(),
            None,
            Some(1),
            None,
        )
        .await
        .map(|v| v.into_iter().next())
        {
            query.branch_id = b.id;
        }
    }

    let default_lang_id = if let Some(lid) = query.language_id.clone() {
        Some(lid)
    } else if let Ok(Some(dl)) =
        cms_db::language::LanguageQueries::get_default(&state.biz_context.pool, project_id.as_str())
            .await
    {
        Some(dl.id)
    } else if let Ok(langs) = cms_db::language::LanguageQueries::get_by_project(
        &state.biz_context.pool,
        project_id.as_str(),
        Some(1),
        None,
    )
    .await
    {
        langs.into_iter().next().map(|l| l.id)
    } else {
        None
    };

    let mut result =
        cms_biz::page::PageService::list_pages(&state.biz_context, &auth.user.id, query, 1, 100)
            .await?;

    if let Some(ref default_lang) = default_lang_id {
        for page in &mut result.data {
            if page.language_id.is_none() {
                page.language_id = Some(default_lang.clone());
            }
        }
    }

    Ok(Json(ApiResponse::from(result)))
}

/// Create a page for a project
#[utoipa::path(
    post,
    path = "/api/app/projects/{project_id}/pages",
    tag = "projects",
    params(
        ("project_id" = ProjectId, Path, description = "Project ID"),
    ),
    request_body = CreatePageRequest,
    responses(
        (status = 200, description = "Page created successfully", body = ApiResponse<PageResponse>),
        (status = 400, description = "Validation error"),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Project not found"),
    )
)]
pub async fn create_project_page_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<ProjectId>,
    ValidatedJson(mut request): ValidatedJson<cms_entity::page::CreatePageRequest>,
) -> Result<Json<ApiResponse<PageResponse>>, AppError> {
    request.project_id = project_id.to_string();
    if request.branch_id.is_empty() {
        if let Ok(Some(b)) =
            cms_db::branch::BranchQueries::get_default(&state.biz_context.pool, project_id.as_str())
                .await
        {
            request.branch_id = b.id;
        } else if let Ok(Some(b)) = cms_db::branch::BranchQueries::get_by_project(
            &state.biz_context.pool,
            project_id.as_str(),
            None,
            Some(1),
            None,
        )
        .await
        .map(|v| v.into_iter().next())
        {
            request.branch_id = b.id;
        } else {
            return Err(AppError::BadRequest(
                "Project has no default branch configured; please specify branch_id".to_string(),
            ));
        }
    }
    let branch_id = request.branch_id.clone();
    let page = cms_biz::page::PageService::create_page(
        &state.biz_context,
        &auth.user.id,
        project_id.as_str(),
        &branch_id,
        request,
    )
    .await?;

    Ok(Json(ApiResponse::new(page)))
}

/// Get a page for a project
#[utoipa::path(
    get,
    path = "/api/app/projects/{project_id}/pages/{page_id}",
    tag = "projects",
    params(
        ("project_id" = ProjectId, Path, description = "Project ID"),
        ("page_id" = PageId, Path, description = "Page ID"),
    ),
    responses(
        (status = 200, description = "Page details", body = ApiResponse<PageResponse>),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Page not found"),
    )
)]
pub async fn get_project_page_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, page_id)): Path<(ProjectId, PageId)>,
) -> Result<
    (
        [(axum::http::HeaderName, String); 1],
        Json<ApiResponse<PageResponse>>,
    ),
    AppError,
> {
    let mut page =
        cms_biz::page::PageService::get_page(&state.biz_context, &auth.user.id, page_id.as_str())
            .await?;

    if page.project_id != project_id.as_str() {
        return Err(AppError::NotFound(
            "Page not found for this project".to_string(),
        ));
    }

    if page.language_id.is_none() {
        if let Ok(Some(dl)) = cms_db::language::LanguageQueries::get_default(
            &state.biz_context.pool,
            project_id.as_str(),
        )
        .await
        {
            page.language_id = Some(dl.id);
        }
    }

    let etag = format!("\"{}\"", page.updated_at.timestamp_millis());
    Ok((
        [(axum::http::header::ETAG, etag)],
        Json(ApiResponse::new(page)),
    ))
}

/// Update a page for a project
#[utoipa::path(
    put,
    path = "/api/app/projects/{project_id}/pages/{page_id}",
    tag = "projects",
    params(
        ("project_id" = ProjectId, Path, description = "Project ID"),
        ("page_id" = PageId, Path, description = "Page ID"),
    ),
    request_body = UpdatePageRequest,
    responses(
        (status = 200, description = "Page updated successfully", body = ApiResponse<PageResponse>),
        (status = 400, description = "Validation error"),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Page not found"),
        (status = 412, description = "Precondition failed - concurrent modification"),
    )
)]
pub async fn update_project_page_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    headers: axum::http::HeaderMap,
    Path((project_id, page_id)): Path<(ProjectId, PageId)>,
    ValidatedJson(request): ValidatedJson<cms_entity::page::UpdatePageRequest>,
) -> Result<
    (
        [(axum::http::HeaderName, String); 1],
        Json<ApiResponse<PageResponse>>,
    ),
    AppError,
> {
    let existing =
        cms_biz::page::PageService::get_page(&state.biz_context, &auth.user.id, page_id.as_str())
            .await?;
    if existing.project_id != project_id.as_str() {
        return Err(AppError::NotFound(
            "Page not found for this project".to_string(),
        ));
    }

    // Optimistic concurrency check via If-Match
    let current_etag = format!("\"{}\"", existing.updated_at.timestamp_millis());
    if let Some(if_match) = headers.get(axum::http::header::IF_MATCH) {
        if let Ok(if_match_str) = if_match.to_str() {
            let trimmed = if_match_str.trim();
            if trimmed != "*" && trimmed != current_etag {
                return Err(AppError::PreconditionFailed(
                    "Page has been modified concurrently. Please reload before saving.".to_string(),
                ));
            }
        }
    }

    let mut page = cms_biz::page::PageService::update_page(
        &state.biz_context,
        &auth.user.id,
        page_id.as_str(),
        request,
    )
    .await?;

    if page.language_id.is_none() {
        if let Ok(Some(dl)) = cms_db::language::LanguageQueries::get_default(
            &state.biz_context.pool,
            project_id.as_str(),
        )
        .await
        {
            page.language_id = Some(dl.id);
        }
    }

    let new_etag = format!("\"{}\"", page.updated_at.timestamp_millis());
    Ok((
        [(axum::http::header::ETAG, new_etag)],
        Json(ApiResponse::new(page)),
    ))
}

/// Delete a page for a project
#[utoipa::path(
    delete,
    path = "/api/app/projects/{project_id}/pages/{page_id}",
    tag = "projects",
    params(
        ("project_id" = ProjectId, Path, description = "Project ID"),
        ("page_id" = PageId, Path, description = "Page ID"),
    ),
    responses(
        (status = 200, description = "Page deleted successfully", body = ApiResponse<DeletePageResponse>),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Page not found"),
    )
)]
pub async fn delete_project_page_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, page_id)): Path<(ProjectId, PageId)>,
) -> Result<Json<ApiResponse<DeletePageResponse>>, AppError> {
    let page =
        cms_biz::page::PageService::get_page(&state.biz_context, &auth.user.id, page_id.as_str())
            .await?;
    if page.project_id != project_id.as_str() {
        return Err(AppError::NotFound(
            "Page not found for this project".to_string(),
        ));
    }
    cms_biz::page::PageService::delete_page(&state.biz_context, &auth.user.id, page_id.as_str())
        .await?;
    Ok(Json(ApiResponse::new(DeletePageResponse {
        success: true,
        id: Some(page_id),
    })))
}

/// Reorder pages for a project
#[utoipa::path(
    post,
    path = "/api/app/projects/{project_id}/pages/reorder",
    tag = "projects",
    params(
        ("project_id" = ProjectId, Path, description = "Project ID"),
    ),
    request_body = ReorderPageTreeRequest,
    responses(
        (status = 200, description = "Pages reordered successfully", body = ApiResponse<ReorderPageTreeResponse>),
        (status = 400, description = "Validation error"),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Forbidden"),
    )
)]
pub async fn reorder_project_pages_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<ProjectId>,
    ValidatedJson(payload): ValidatedJson<cms_entity::page::ReorderPageTreeRequest>,
) -> Result<Json<ApiResponse<ReorderPageTreeResponse>>, AppError> {
    state
        .biz_context
        .authz
        .require_project_role(
            &auth.user.id,
            project_id.as_str(),
            cms_entity::common::MemberRole::Editor,
        )
        .await?;

    let reorder_items: Vec<(String, Option<String>, i32)> = payload
        .items
        .iter()
        .map(|item| {
            (
                item.id.to_string(),
                item.parent_id.as_ref().map(|p| p.to_string()),
                item.position,
            )
        })
        .collect();

    cms_db::page::PageQueries::reorder_tree(
        &state.biz_context.pool,
        project_id.as_str(),
        &reorder_items,
    )
    .await?;

    Ok(Json(ApiResponse::new(ReorderPageTreeResponse {
        success: true,
    })))
}
