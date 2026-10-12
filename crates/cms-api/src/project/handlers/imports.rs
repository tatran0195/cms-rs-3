use std::sync::Arc;

use axum::{
    extract::{Path, State},
    Json,
};
use cms_entity::common::{ApiResponse, SuccessResponse};
use cms_error::AppError;
use cms_middleware::app_state::AppState;

use crate::auth::AuthExtractor;

/// Import from Mintlify (Not implemented in internal CMS deployment)
pub async fn import_mintlify_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
) -> Result<Json<ApiResponse<SuccessResponse>>, AppError> {
    let project_uuid = uuid::Uuid::parse_str(&project_id)
        .map_err(|_| AppError::NotFound("Project not found".to_string()))?;
    cms_authz_gate::require_project_access(
        state.authz_backend(),
        &auth.authz_context(),
        project_uuid,
        cms_authz::Relation::Editor,
    )
    .await?;

    Err(AppError::custom(
        axum::http::StatusCode::NOT_IMPLEMENTED,
        "Mintlify import is not supported in this deployment",
    ))
}

/// Import from Ghost (Not implemented in internal CMS deployment)
pub async fn import_ghost_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
) -> Result<Json<ApiResponse<SuccessResponse>>, AppError> {
    let project_uuid = uuid::Uuid::parse_str(&project_id)
        .map_err(|_| AppError::NotFound("Project not found".to_string()))?;
    cms_authz_gate::require_project_access(
        state.authz_backend(),
        &auth.authz_context(),
        project_uuid,
        cms_authz::Relation::Editor,
    )
    .await?;

    Err(AppError::custom(
        axum::http::StatusCode::NOT_IMPLEMENTED,
        "Ghost import is not supported in this deployment",
    ))
}
