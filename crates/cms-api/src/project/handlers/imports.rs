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
    let auth_user = auth.to_auth_user(&state);
    let session = state.gatehouse.session();
    let target = cms_authz::ProjectTarget {
        id: project_id.clone(),
        is_public: false,
        owner_id: None,
    };
    state
        .gatehouse
        .project_checker
        .bind(&session, &auth_user, &cms_authz::ProjectAction::Edit, &())
        .authorize(&target)
        .await
        .map_err(|_| AppError::Forbidden)?;

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
    let auth_user = auth.to_auth_user(&state);
    let session = state.gatehouse.session();
    let target = cms_authz::ProjectTarget {
        id: project_id.clone(),
        is_public: false,
        owner_id: None,
    };
    state
        .gatehouse
        .project_checker
        .bind(&session, &auth_user, &cms_authz::ProjectAction::Edit, &())
        .authorize(&target)
        .await
        .map_err(|_| AppError::Forbidden)?;

    Err(AppError::custom(
        axum::http::StatusCode::NOT_IMPLEMENTED,
        "Ghost import is not supported in this deployment",
    ))
}
