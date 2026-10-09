use std::sync::Arc;

use axum::{
    extract::{Path, State},
    Json,
};
use cms_entity::{
    auth::ProjectApiKeyResponse, common::ApiResponse, workspace::WorkspaceMutationResponse,
};
use cms_error::AppError;
use cms_middleware::app_state::AppState;

use super::common::verify_project_access;
use crate::auth::AuthExtractor;

/// Render a stored API key as the SPA's `ApiKey` shape. `secret` is only supplied
/// on create/rotate, when the plaintext key is still known.
fn api_key_to_response(
    key: &cms_entity::auth::ApiKey,
    secret: Option<&str>,
) -> ProjectApiKeyResponse {
    let last_four = match secret {
        Some(s) => {
            let chars: Vec<char> = s.chars().collect();
            let start = chars.len().saturating_sub(4);
            chars[start..].iter().collect::<String>()
        }
        None => {
            let chars: Vec<char> = key.key.chars().collect();
            let start = chars.len().saturating_sub(4);
            chars[start..].iter().collect::<String>()
        }
    };

    ProjectApiKeyResponse {
        id: key.id.clone(),
        name: key.name.clone(),
        last_four,
        scopes: vec![
            "mcp:connect".to_string(),
            "projects:read".to_string(),
            "pages:read".to_string(),
        ],
        created_at: key.created_at.to_rfc3339(),
        last_used_at: key.last_used_at.map(|d| d.to_rfc3339()),
        expires_at: None,
        revoked_at: None,
        rotated_from_id: None,
        legacy: false,
        state: "active".to_string(),
        secret: secret.map(|s| s.to_string()),
    }
}

/// Project API keys list
///
/// Lists the caller's API keys (keys are owned by the user, not the project; the
/// project id is only validated to confirm the caller may access it).
pub async fn list_project_api_keys_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
) -> Result<Json<ApiResponse<Vec<ProjectApiKeyResponse>>>, AppError> {
    verify_project_access(&state, &auth, &project_id).await?;
    let keys =
        cms_db::auth::ApiKeyQueries::get_all_for_user_raw(&state.biz_context.pool, &auth.user.id)
            .await?;
    let items: Vec<ProjectApiKeyResponse> =
        keys.iter().map(|k| api_key_to_response(k, None)).collect();
    Ok(Json(ApiResponse::new(items)))
}

/// Project API key create
///
/// Creates a new API key for the user, returning the plaintext secret once.
pub async fn create_project_api_key_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<ApiResponse<ProjectApiKeyResponse>>, AppError> {
    verify_project_access(&state, &auth, &project_id).await?;
    let name = body
        .get("name")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "API Key".to_string());

    let raw_key = format!("nbl_{}", uuid::Uuid::new_v4().to_string().replace('-', ""));
    let hashed = cms_auth::api_key::hash_key(&raw_key);
    let key =
        cms_db::auth::ApiKeyQueries::create(&state.biz_context.pool, &auth.user.id, &name, &hashed)
            .await?;

    Ok(Json(ApiResponse::new(api_key_to_response(
        &key,
        Some(&raw_key),
    ))))
}

/// Project API key delete
///
/// Revokes an API key, ensuring it belongs to the caller.
pub async fn delete_project_api_key_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, id)): Path<(String, String)>,
) -> Result<Json<ApiResponse<WorkspaceMutationResponse>>, AppError> {
    verify_project_access(&state, &auth, &project_id).await?;
    cms_biz::auth::AuthService::delete_api_key(&state.biz_context, &auth.user.id, &id).await?;
    Ok(Json(ApiResponse::new(WorkspaceMutationResponse {
        success: true,
        id,
    })))
}

/// Project API key rotate
///
/// Replaces an existing key with a freshly generated one under the same name,
/// returning the new plaintext secret once. The old key is removed.
pub async fn rotate_project_api_key_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, id)): Path<(String, String)>,
    Json(_body): Json<serde_json::Value>,
) -> Result<Json<ApiResponse<ProjectApiKeyResponse>>, AppError> {
    verify_project_access(&state, &auth, &project_id).await?;

    let existing = cms_db::auth::ApiKeyQueries::get_by_id(&state.biz_context.pool, &id)
        .await?
        .ok_or_else(|| AppError::NotFound("API key not found".to_string()))?;
    if existing.user_id != auth.user.id {
        return Err(AppError::Forbidden);
    }

    let name = if existing.name.is_empty() {
        "API Key".to_string()
    } else {
        existing.name.clone()
    };
    let raw_key = format!("nbl_{}", uuid::Uuid::new_v4().to_string().replace('-', ""));
    let hashed = cms_auth::api_key::hash_key(&raw_key);
    let new_key =
        cms_db::auth::ApiKeyQueries::create(&state.biz_context.pool, &auth.user.id, &name, &hashed)
            .await?;
    let _ = cms_db::auth::ApiKeyQueries::delete(&state.biz_context.pool, &id).await;

    Ok(Json(ApiResponse::new(api_key_to_response(
        &new_key,
        Some(&raw_key),
    ))))
}
