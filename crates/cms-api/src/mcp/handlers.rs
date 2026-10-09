//! MCP handlers
//!
//! This module contains telemetry and audit event handlers for MCP operations.

use std::sync::Arc;

use axum::{
    extract::{Query, State},
    Json,
};
use cms_biz::mcp::McpService;
use cms_entity::{
    common::PaginatedResponse,
    mcp::{ListMcpAuditEventsQuery, McpAuditEventResponse},
};
use cms_error::AppError;
use cms_middleware::app_state::AppState;

use crate::auth::AuthExtractor;

/// List MCP audit events
///
/// Returns a paginated list of MCP audit events filtered by various criteria.
#[utoipa::path(
    get,
    path = "/mcp/audit-events",
    tag = "mcp",
    security(
        ("bearerAuth" = []),
        ("apiKeyAuth" = []),
        ("cookieAuth" = []),
    ),
    params(
        ("project_id", Query, description = "Filter by project ID"),
        ("user_id", Query, description = "Filter by user ID"),
        ("operation", Query, description = "Filter by operation type"),
        ("start_date", Query, description = "Filter by start date"),
        ("end_date", Query, description = "Filter by end date"),
        ("limit", Query, description = "Number of items per page"),
        ("offset", Query, description = "Pagination offset"),
    ),
    responses(
        (status = 200, description = "List of MCP audit events", body = PaginatedResponse<McpAuditEventResponse>),
        (status = 401, description = "Unauthorized"),
        (status = 400, description = "Bad request"),
    )
)]
pub async fn list_mcp_audit_events_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Query(query): Query<ListMcpAuditEventsQuery>,
) -> Result<Json<PaginatedResponse<McpAuditEventResponse>>, AppError> {
    let result = McpService::list_audit_events(
        &state.biz_context,
        &auth.user.id,
        query.project_id.as_deref(),
        query.user_id.as_deref(),
        query.operation.as_deref(),
        query.limit,
        query.offset,
    )
    .await?;

    Ok(Json(result))
}
