use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    Json,
};
use cms_error::AppError;
use cms_middleware::app_state::AppState;

use crate::auth::AuthExtractor;

/// Map a DB comment row to the SPA comment shape, resolving the author's
/// display name/image. Anchors are not yet persisted, so they render as null.
async fn comment_to_json(
    state: &Arc<AppState>,
    comment: &cms_entity::comment::Comment,
) -> Result<serde_json::Value, AppError> {
    let user = match comment.user_id.as_deref() {
        Some(uid) => cms_db::auth::UserQueries::get_by_id(&state.biz_context.pool, uid).await?,
        None => None,
    };
    let (uid, name, image) = match user {
        Some(u) => (u.id, u.name.unwrap_or_else(|| u.email.clone()), u.image),
        None => ("anonymous".to_string(), "Anonymous".to_string(), None),
    };
    Ok(serde_json::json!({
        "id": comment.id,
        "body": comment.content,
        "resolved": comment.resolved,
        "createdAt": comment.created_at.to_rfc3339(),
        "anchor": null,
        "user": { "id": uid, "name": name, "image": image }
    }))
}

/// Project comments list
///
/// Lists comments scoped to the project (optionally a specific pageId). Comments
/// are read from the `Comment` table joined to the project's pages, so a site-wide
/// thread view works even without a page filter.
pub async fn list_project_comments_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Query(query): Query<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
    use cms_db::comment::CommentQueries;

    // Enforce project membership first.
    cms_biz::project::ProjectService::get_project(&state.biz_context, &auth.user.id, &project_id)
        .await?;

    let page_id = query
        .get("pageId")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("");

    let comments = if page_id.is_empty() {
        // Site-wide: comments on any page belonging to the project.
        CommentQueries::get_by_project(
            &state.biz_context.pool,
            &project_id,
            None,
            None,
            Some(200),
            None,
        )
        .await?
    } else {
        CommentQueries::get_by_page(
            &state.biz_context.pool,
            page_id,
            None,
            None,
            Some(200),
            None,
        )
        .await?
    };

    let mut vec = Vec::with_capacity(comments.len());
    for c in comments {
        vec.push(comment_to_json(&state, &c).await?);
    }

    Ok(Json(serde_json::json!({ "data": vec })))
}

/// Project comment create
///
/// Creates a comment on a page using the real comment service (enforces page
/// existence and project membership, and authorizes the caller to view the page).
pub async fn create_project_comment_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(_project_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
    use cms_entity::comment::CreateCommentRequest;

    let page_id = body
        .get("pageId")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| AppError::InvalidInput("pageId is required".to_string()))?;

    let request = CreateCommentRequest {
        page_id: page_id.to_string(),
        content: body
            .get("body")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        parent_id: body
            .get("parentId")
            .and_then(|v| v.as_str())
            .map(String::from),
    };

    let comment = cms_biz::comment::CommentService::create_comment(
        &state.biz_context,
        &auth.user.id,
        page_id,
        request,
    )
    .await?;

    // Re-read as the full entity so the user join is populated.
    let entity = cms_db::comment::CommentQueries::get_by_id(&state.biz_context.pool, &comment.id)
        .await?
        .ok_or_else(|| AppError::NotFound("Comment not found".to_string()))?;

    Ok(Json(
        serde_json::json!({ "data": comment_to_json(&state, &entity).await? }),
    ))
}

/// Project comment update
///
/// Applies a comment update (resolved/content) through the comment service so the
/// author/admin authorization check is applied.
pub async fn update_project_comment_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, id)): Path<(String, String)>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
    use cms_entity::comment::UpdateCommentRequest;

    let existing = cms_db::comment::CommentQueries::get_by_id(&state.biz_context.pool, &id)
        .await?
        .ok_or_else(|| AppError::NotFound("Comment not found".to_string()))?;

    let page = cms_db::page::PageQueries::get_by_id(&state.biz_context.pool, &existing.page_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Page not found for comment".to_string()))?;
    if page.project_id != project_id {
        return Err(AppError::NotFound("Comment not found for this project".to_string()));
    }

    let request = UpdateCommentRequest {
        content: body.get("body").and_then(|v| v.as_str()).map(String::from),
        resolved: body.get("resolved").and_then(|v| v.as_bool()),
    };

    let updated = cms_biz::comment::CommentService::update_comment(
        &state.biz_context,
        &auth.user.id,
        &id,
        request,
    )
    .await?;

    let entity = cms_db::comment::CommentQueries::get_by_id(&state.biz_context.pool, &updated.id)
        .await?
        .ok_or_else(|| AppError::NotFound("Comment not found".to_string()))?;

    Ok(Json(
        serde_json::json!({ "data": comment_to_json(&state, &entity).await? }),
    ))
}

/// Project comment delete
///
/// Deletes a comment after the author/admin authorization check.
pub async fn delete_project_comment_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, id)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, AppError> {
    let existing = cms_db::comment::CommentQueries::get_by_id(&state.biz_context.pool, &id)
        .await?
        .ok_or_else(|| AppError::NotFound("Comment not found".to_string()))?;

    let page = cms_db::page::PageQueries::get_by_id(&state.biz_context.pool, &existing.page_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Page not found for comment".to_string()))?;
    if page.project_id != project_id {
        return Err(AppError::NotFound("Comment not found for this project".to_string()));
    }

    cms_biz::comment::CommentService::delete_comment(&state.biz_context, &auth.user.id, &id)
        .await?;
    Ok(Json(
        serde_json::json!({ "data": { "success": true, "id": id } }),
    ))
}
