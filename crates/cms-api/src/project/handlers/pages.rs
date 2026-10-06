use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    Json,
};
use cms_error::AppError;
use cms_middleware::app_state::AppState;

use crate::auth::AuthExtractor;

/// List pages for a project
pub async fn list_project_pages_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Query(mut query): Query<cms_entity::page::ListPagesQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    query.project_id = project_id.clone();
    if query.branch_id.is_empty() {
        if let Ok(Some(b)) =
            cms_db::branch::BranchQueries::get_default(&state.biz_context.pool, &project_id).await
        {
            query.branch_id = b.id;
        } else if let Ok(Some(b)) = cms_db::branch::BranchQueries::get_by_project(
            &state.biz_context.pool,
            &project_id,
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
        cms_db::language::LanguageQueries::get_default(&state.biz_context.pool, &project_id).await
    {
        Some(dl.id)
    } else if let Ok(langs) = cms_db::language::LanguageQueries::get_by_project(
        &state.biz_context.pool,
        &project_id,
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

    Ok(Json(serde_json::json!({ "data": result.data })))
}

/// Create a page for a project
pub async fn create_project_page_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Json(mut request): Json<cms_entity::page::CreatePageRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    request.project_id = project_id.clone();
    if request.branch_id.is_empty() {
        if let Ok(Some(b)) =
            cms_db::branch::BranchQueries::get_default(&state.biz_context.pool, &project_id).await
        {
            request.branch_id = b.id;
        } else if let Ok(Some(b)) = cms_db::branch::BranchQueries::get_by_project(
            &state.biz_context.pool,
            &project_id,
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
        &project_id,
        &branch_id,
        request,
    )
    .await?;

    Ok(Json(serde_json::json!({ "data": page })))
}

/// Get a page for a project
pub async fn get_project_page_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, page_id)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, AppError> {
    let mut page =
        cms_biz::page::PageService::get_page(&state.biz_context, &auth.user.id, &page_id).await?;

    if page.project_id != project_id {
        return Err(AppError::NotFound("Page not found for this project".to_string()));
    }

    if page.language_id.is_none() {
        if let Ok(Some(dl)) =
            cms_db::language::LanguageQueries::get_default(&state.biz_context.pool, &project_id)
                .await
        {
            page.language_id = Some(dl.id);
        }
    }

    Ok(Json(serde_json::json!({ "data": page })))
}

/// Update a page for a project
pub async fn update_project_page_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, page_id)): Path<(String, String)>,
    Json(request): Json<cms_entity::page::UpdatePageRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let existing =
        cms_biz::page::PageService::get_page(&state.biz_context, &auth.user.id, &page_id).await?;
    if existing.project_id != project_id {
        return Err(AppError::NotFound("Page not found for this project".to_string()));
    }

    let mut page = cms_biz::page::PageService::update_page(
        &state.biz_context,
        &auth.user.id,
        &page_id,
        request,
    )
    .await?;

    if page.language_id.is_none() {
        if let Ok(Some(dl)) =
            cms_db::language::LanguageQueries::get_default(&state.biz_context.pool, &project_id)
                .await
        {
            page.language_id = Some(dl.id);
        }
    }

    Ok(Json(serde_json::json!({ "data": page })))
}

/// Delete a page for a project
pub async fn delete_project_page_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, page_id)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, AppError> {
    let page =
        cms_biz::page::PageService::get_page(&state.biz_context, &auth.user.id, &page_id).await?;
    if page.project_id != project_id {
        return Err(AppError::NotFound("Page not found for this project".to_string()));
    }
    cms_biz::page::PageService::delete_page(&state.biz_context, &auth.user.id, &page_id).await?;
    Ok(Json(serde_json::json!({ "data": { "success": true } })))
}

/// Reorder pages for a project
pub async fn reorder_project_pages_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
    state
        .biz_context
        .authz
        .require_project_role(
            &auth.user.id,
            &project_id,
            cms_entity::common::MemberRole::Editor,
        )
        .await?;

    let items = payload
        .get("items")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| {
            AppError::Validation("Reorder request must include an items array".to_string())
        })?;
    if items.is_empty() || items.len() > 10_000 {
        return Err(AppError::Validation(
            "Reorder requests must contain between 1 and 10000 pages".to_string(),
        ));
    }

    let mut reorder_items = Vec::with_capacity(items.len());
    for item in items {
        let id = item
            .get("id")
            .and_then(serde_json::Value::as_str)
            .filter(|id| !id.is_empty())
            .ok_or_else(|| AppError::Validation("Each reorder item requires an id".to_string()))?;
        let parent_id = match item.get("parentId") {
            Some(serde_json::Value::Null) => None,
            Some(serde_json::Value::String(parent_id)) if !parent_id.is_empty() => {
                Some(parent_id.clone())
            }
            Some(_) => {
                return Err(AppError::Validation(
                    "parentId must be a page id or null".to_string(),
                ));
            }
            None => {
                return Err(AppError::Validation(
                    "Each reorder item requires parentId".to_string(),
                ));
            }
        };
        let position = item
            .get("position")
            .and_then(serde_json::Value::as_i64)
            .and_then(|position| i32::try_from(position).ok())
            .ok_or_else(|| {
                AppError::Validation("Each reorder item requires an integer position".to_string())
            })?;
        reorder_items.push((id.to_string(), parent_id, position));
    }

    cms_db::page::PageQueries::reorder_tree(&state.biz_context.pool, &project_id, &reorder_items)
        .await?;

    Ok(Json(serde_json::json!({ "data": { "success": true } })))
}
