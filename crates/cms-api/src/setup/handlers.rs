//! Handlers for public setup and onboarding

use std::sync::Arc;
use axum::{
    extract::State,
    http::HeaderMap,
    Json,
};
use cms_biz::SetupService;
use cms_entity::setup::{CompleteSetupRequest, CompleteSetupResponse, SetupStatusResponse};
use cms_error::AppError;
use cms_middleware::app_state::AppState;
use uuid::Uuid;

use crate::validation::ValidatedJson;

/// Get setup status
#[utoipa::path(
    get,
    path = "/public/setup/status",
    tag = "setup",
    responses(
        (status = 200, description = "Setup status retrieved", body = SetupStatusResponse),
    )
)]
pub async fn get_setup_status_handler(
    State(state): State<Arc<AppState>>,
) -> Result<Json<SetupStatusResponse>, AppError> {
    let mut configured_oauth = Vec::new();
    if let Some(oauth) = state.config.auth.oauth.as_ref() {
        if oauth.google.is_some() {
            configured_oauth.push("google".to_string());
        }
        if oauth.github.is_some() {
            configured_oauth.push("github".to_string());
        }
    }

    let status = SetupService::get_status(&state.biz_context, configured_oauth).await?;
    Ok(Json(status))
}

/// Complete setup and initialize platform
#[utoipa::path(
    post,
    path = "/public/setup/complete",
    tag = "setup",
    request_body = CompleteSetupRequest,
    responses(
        (status = 200, description = "Platform initialized successfully", body = CompleteSetupResponse),
        (status = 400, description = "Bad request"),
        (status = 409, description = "Conflict - already initialized"),
    )
)]
pub async fn complete_setup_handler(
    State(state): State<Arc<AppState>>,
    ValidatedJson(payload): ValidatedJson<CompleteSetupRequest>,
) -> Result<(HeaderMap, Json<CompleteSetupResponse>), AppError> {
    let session_token = Uuid::new_v4().to_string();
    let res = SetupService::complete_setup(&state.biz_context, payload, &session_token).await?;

    let mut res_headers = HeaderMap::new();
    let cookie_val = state.config.auth.session_cookie_value(
        &session_token,
        30 * 24 * 3600,
        state.config.is_production(),
        state.config.server.https,
    );
    if let Ok(val) = axum::http::HeaderValue::from_str(&cookie_val) {
        res_headers.insert(axum::http::header::SET_COOKIE, val);
    }

    Ok((res_headers, Json(res)))
}
