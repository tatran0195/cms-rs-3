//! MCP API module
//!
//! This module mounts the official `rmcp` Streamable HTTP service and MCP audit events.

use std::sync::Arc;

use axum::{routing::get, Router};
use cms_mcp::{create_mcp_http_service, McpSecurityContext};
use cms_middleware::app_state::AppState;

pub mod handlers;

use handlers::*;

/// Create the MCP router
pub fn router(state: Arc<AppState>) -> Router {
    let mcp_service =
        create_mcp_http_service(Arc::new(state.biz_context()), McpSecurityContext::system());

    Router::new()
        .route("/audit-events", get(list_mcp_audit_events_handler))
        .fallback_service(mcp_service)
        .layer(axum::middleware::from_extractor::<crate::auth::AuthExtractor>())
        .with_state(state)
}
