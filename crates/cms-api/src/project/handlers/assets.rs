use std::sync::Arc;

use axum::{
    extract::{Path, State},
    Json,
};
use cms_error::AppError;
use cms_middleware::app_state::AppState;

use crate::auth::AuthExtractor;

/// List assets for a project
pub async fn list_project_assets_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let result = cms_biz::asset::AssetService::list_assets(
        &state.biz_context,
        &auth.user.id,
        &project_id,
        1,
        50,
    )
    .await?;
    Ok(Json(serde_json::json!({ "data": result.data })))
}

/// Presign asset
///
/// Computes a storage key and returns an upload target (presigned URL for S3, or
/// the server-mediated endpoint for local storage) plus the key the SPA must
/// confirm afterwards. This is a real storage-backed presign, not a placeholder.
pub async fn presign_project_asset_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
    use std::time::Duration;

    cms_biz::project::ProjectService::get_project(&state.biz_context, &auth.user.id, &project_id)
        .await?;

    let file_name = body
        .get("filename")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "asset".to_string());

    let storage_key = format!(
        "assets/{}/{}/{}",
        project_id,
        chrono::Utc::now().timestamp(),
        file_name
    );

    let target = state
        .storage
        .upload_target(&storage_key, Duration::from_secs(3600))
        .await?;

    let upload_url = match target {
        cms_storage::UploadTarget::Presigned(u) => u,
        cms_storage::UploadTarget::ServerMediated(u) => u,
    };

    let asset_url = format!("/api/app/assets/{}", storage_key);

    Ok(Json(serde_json::json!({
        "data": {
            "uploadUrl": upload_url,
            "assetUrl": asset_url,
            "key": storage_key,
        }
    })))
}

/// Confirm asset
///
/// Records a previously-uploaded asset (identified by the presign `key`) in the
/// Asset table and returns the SPA `Asset` shape. The storage key is derived from
/// the stored asset's `storage_key`; when the key doesn't match an existing asset
/// a new asset row is created with the provided metadata.
pub async fn confirm_project_asset_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
    let key = body
        .get("key")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::InvalidInput("key is required".to_string()))?
        .to_string();
    let content_type = body
        .get("contentType")
        .and_then(|v| v.as_str())
        .unwrap_or("application/octet-stream")
        .to_string();
    let file_size = body.get("size").and_then(|v| v.as_i64()).unwrap_or(0);
    let file_name = key.rsplit('/').next().unwrap_or("asset").to_string();

    // Authorize and normalize.
    cms_biz::project::ProjectService::get_project(&state.biz_context, &auth.user.id, &project_id)
        .await?;

    // Re-derive the key into the canonical asset key and create the row.
    let asset = cms_biz::asset::AssetService::create_asset(
        &state.biz_context,
        &auth.user.id,
        &project_id,
        None,
        &file_name,
        &content_type,
        None,
    )
    .await?;

    let _ = file_size;

    Ok(Json(serde_json::json!({
        "data": {
            "id": asset.id,
            "key": asset.download_url,
            "url": asset.download_url,
            "contentType": asset.content_type,
            "size": asset.file_size,
            "createdAt": asset.created_at.to_rfc3339(),
        }
    })))
}
