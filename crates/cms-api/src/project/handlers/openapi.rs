use std::sync::Arc;

use axum::{
    extract::{Path, State},
    Json,
};
use cms_error::AppError;
use cms_middleware::app_state::AppState;

use crate::auth::AuthExtractor;

/// Map an `OpenApiDocument` row to the SPA `OpenApiConfiguration` shape.
fn openapi_to_json(doc: &cms_entity::openapi::OpenApiDocument) -> serde_json::Value {
    use sha2::Digest;
    let content = doc.content.as_deref().unwrap_or("");
    let hash = sha2::Sha256::digest(content.as_bytes());
    serde_json::json!({
        "title": doc.name,
        "path": doc.url,
        "contentHash": hex::encode(hash),
        "updatedAt": doc.updated_at.to_rfc3339(),
        "source": {
            "type": "url",
            "url": doc.url,
        },
    })
}

/// Project openapi get
///
/// Returns the project's stored OpenAPI reference configuration, mapped to the
/// SPA `OpenApiConfiguration` shape, or `null` when none has been saved.
pub async fn get_project_openapi_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    use cms_db::openapi::OpenApiDocumentQueries;

    cms_biz::project::ProjectService::get_project(&state.biz_context, &auth.user.id, &project_id)
        .await?;

    let docs = OpenApiDocumentQueries::get_by_project(&state.biz_context.pool, &project_id).await?;
    Ok(Json(serde_json::json!({
        "data": docs.first().map(openapi_to_json)
    })))
}

/// Project openapi save (upsert)
///
/// Creates or updates the project's OpenAPI reference. Title and path map to the
/// `OpenApiDocument.name`/`url` columns; an uploaded source's content is stored
/// so it can be re-served and hashed.
pub async fn save_project_openapi_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
    use cms_db::openapi::OpenApiDocumentQueries;

    cms_biz::project::ProjectService::get_project(&state.biz_context, &auth.user.id, &project_id)
        .await?;

    let title = body
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("API Reference")
        .to_string();
    let path = body
        .get("path")
        .and_then(|v| v.as_str())
        .unwrap_or("openapi")
        .to_string();
    let source = body.get("source");
    let url = match source {
        Some(s) => s.get("url").and_then(|v| v.as_str()).map(String::from),
        None => None,
    }
    .unwrap_or_else(|| format!("/api/public/pages/{}", path));
    let content = source
        .and_then(|s| s.get("content"))
        .and_then(|v| v.as_str())
        .map(String::from);

    // Upsert: first document for the project wins; otherwise update the earliest.
    let docs = OpenApiDocumentQueries::get_by_project(&state.biz_context.pool, &project_id).await?;
    let doc = match docs.first() {
        Some(d) => {
            OpenApiDocumentQueries::update(&state.biz_context.pool, &d.id, Some(&title), Some(&url))
                .await?
        }
        None => {
            OpenApiDocumentQueries::create(&state.biz_context.pool, &project_id, &title, &url)
                .await?
        }
    };

    // Persist uploaded content if provided (best-effort).
    if let Some(content) = content {
        let _ = cms_db::openapi::OpenApiDocumentQueries::update_parsed(
            &state.biz_context.pool,
            &doc.id,
            Some(&content),
            Some(chrono::Utc::now()),
            None,
        )
        .await;
    }

    Ok(Json(serde_json::json!({ "data": openapi_to_json(&doc) })))
}

/// Project openapi sync
///
/// Re-reads the stored configuration and returns it (recomputed content hash).
pub async fn sync_project_openapi_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    use cms_db::openapi::OpenApiDocumentQueries;

    cms_biz::project::ProjectService::get_project(&state.biz_context, &auth.user.id, &project_id)
        .await?;

    let docs = OpenApiDocumentQueries::get_by_project(&state.biz_context.pool, &project_id).await?;
    Ok(Json(serde_json::json!({
        "data": docs.first().map(openapi_to_json)
    })))
}

/// Project openapi delete
///
/// Removes the project's OpenAPI reference documents.
pub async fn delete_project_openapi_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    use cms_db::openapi::OpenApiDocumentQueries;

    cms_biz::project::ProjectService::get_project(&state.biz_context, &auth.user.id, &project_id)
        .await?;

    let docs = OpenApiDocumentQueries::get_by_project(&state.biz_context.pool, &project_id).await?;
    for d in &docs {
        let _ = OpenApiDocumentQueries::delete(&state.biz_context.pool, &d.id).await;
    }

    Ok(Json(serde_json::json!({ "data": { "success": true } })))
}
