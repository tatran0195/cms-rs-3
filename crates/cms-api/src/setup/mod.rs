//! Setup API module
//!
//! Handlers for public setup and onboarding routes.

use std::sync::Arc;
use axum::{
    routing::{get, post},
    Router,
};
use cms_middleware::app_state::AppState;

pub mod handlers;
use handlers::*;

/// Create setup router
pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/status", get(get_setup_status_handler))
        .route("/complete", post(complete_setup_handler))
        .with_state(state)
}
