use std::sync::Arc;

use axum::{
    extract::{Path, State},
    Json,
};
use cms_error::AppError;
use cms_middleware::app_state::AppState;

use crate::auth::AuthExtractor;

/// Import from Mintlify (Not implemented in internal CMS deployment)
pub async fn import_mintlify_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    state
        .biz_context
        .authz
        .require_project_role(
            &auth.user.id,
            &project_id,
            cms_entity::common::MemberRole::Admin,
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
) -> Result<Json<serde_json::Value>, AppError> {
    state
        .biz_context
        .authz
        .require_project_role(
            &auth.user.id,
            &project_id,
            cms_entity::common::MemberRole::Admin,
        )
        .await?;

    Err(AppError::custom(
        axum::http::StatusCode::NOT_IMPLEMENTED,
        "Ghost import is not supported in this deployment",
    ))
}
