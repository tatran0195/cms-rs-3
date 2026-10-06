//! Admin handlers
//!
//! This module contains the actual implementation of admin handlers.

use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    Json,
};
use cms_biz::org::OrgService;
use cms_entity::{
    common::{Id, PaginatedResponse},
    org::OrganizationResponse,
};
use cms_error::AppError;
use cms_middleware::app_state::AppState;

use crate::auth::AuthExtractor;

/// List all organizations (admin only)
///
/// Returns a paginated list of all organizations in the system.
/// Requires admin privileges.
#[utoipa::path(
    get,
    path = "/admin/organizations",
    tag = "admin",
    security(
        ("bearerAuth" = ["admin"]),
        ("apiKeyAuth" = ["admin"]),
        ("cookieAuth" = ["admin"]),
    ),
    params(
        ("page", Query, description = "Page number"),
        ("page_size", Query, description = "Number of items per page"),
    ),
    responses(
        (status = 200, description = "List of all organizations", body = PaginatedResponse<OrganizationResponse>),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Forbidden - admin privileges required"),
    )
)]
pub async fn list_all_organizations_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Query(query): Query<serde_json::Value>,
) -> Result<Json<PaginatedResponse<OrganizationResponse>>, AppError> {
    state
        .biz_context
        .authz
        .require_system_admin(&auth.user.id)
        .await?;

    let page = query.get("page").and_then(|v| v.as_u64()).unwrap_or(1);
    let page_size = query
        .get("page_size")
        .and_then(|v| v.as_u64())
        .unwrap_or(20);

    let orgs =
        OrgService::list_all_organizations(&state.biz_context, &auth.user.id, page, page_size)
            .await?;

    Ok(Json(orgs))
}

/// Get organization statistics (admin only)
///
/// Returns statistics for a specific organization.
/// Requires admin privileges.
#[utoipa::path(
    get,
    path = "/admin/organizations/{org_id}/stats",
    tag = "admin",
    security(
        ("bearerAuth" = ["admin"]),
        ("apiKeyAuth" = ["admin"]),
        ("cookieAuth" = ["admin"]),
    ),
    params(
        ("org_id", Path, description = "The ID of the organization"),
    ),
    responses(
        (status = 200, description = "Organization statistics", body = serde_json::Value),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Forbidden - admin privileges required"),
        (status = 404, description = "Organization not found"),
    )
)]
pub async fn get_organization_stats_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(org_id): Path<Id>,
) -> Result<Json<serde_json::Value>, AppError> {
    state
        .biz_context
        .authz
        .require_system_admin(&auth.user.id)
        .await?;

    let stats =
        cms_biz::analytics::AnalyticsService::get_organization_stats(&state.biz_context, &org_id)
            .await?;

    Ok(Json(serde_json::json!(stats)))
}

/// Get system statistics (admin only)
///
/// Returns overall system statistics.
/// Requires admin privileges.
#[utoipa::path(
    get,
    path = "/admin/system/stats",
    tag = "admin",
    security(
        ("bearerAuth" = ["admin"]),
        ("apiKeyAuth" = ["admin"]),
        ("cookieAuth" = ["admin"]),
    ),
    responses(
        (status = 200, description = "System statistics", body = serde_json::Value),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Forbidden - admin privileges required"),
    )
)]
pub async fn get_system_stats_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
) -> Result<Json<serde_json::Value>, AppError> {
    state
        .biz_context
        .authz
        .require_system_admin(&auth.user.id)
        .await?;

    let stats = cms_biz::analytics::AnalyticsService::get_system_stats(&state.biz_context).await?;

    Ok(Json(serde_json::json!(stats)))
}

/// Get system health (admin only)
///
/// Returns the current health status of the system.
/// Requires admin privileges.
#[utoipa::path(
    get,
    path = "/admin/system/health",
    tag = "admin",
    security(
        ("bearerAuth" = ["admin"]),
        ("apiKeyAuth" = ["admin"]),
        ("cookieAuth" = ["admin"]),
    ),
    responses(
        (status = 200, description = "System health status", body = serde_json::Value),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Forbidden - admin privileges required"),
    )
)]
pub async fn get_system_health_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
) -> Result<Json<serde_json::Value>, AppError> {
    state
        .biz_context
        .authz
        .require_system_admin(&auth.user.id)
        .await?;

    let health =
        cms_biz::platform_event::PlatformEventService::get_system_health(&state.biz_context)
            .await?;

    Ok(Json(serde_json::json!(health)))
}

/// Get Prometheus system metrics for operational scraping
#[utoipa::path(
    get,
    path = "/admin/system/metrics",
    tag = "admin",
    responses(
        (status = 200, description = "Prometheus text format metrics", body = String),
    )
)]
pub async fn get_system_metrics_handler(
    State(state): State<Arc<AppState>>,
) -> Result<(axum::http::HeaderMap, String), AppError> {
    let stats = cms_biz::analytics::AnalyticsService::get_system_stats(&state.biz_context).await?;
    let users = stats.get("users").and_then(|v| v.as_i64()).unwrap_or(0);
    let organizations = stats
        .get("organizations")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let projects = stats.get("projects").and_then(|v| v.as_i64()).unwrap_or(0);

    let active_db_connections = state.biz_context.pool.size();
    let idle_db_connections = state.biz_context.pool.num_idle();

    let mut headers = axum::http::HeaderMap::new();
    headers.insert(
        axum::http::header::CONTENT_TYPE,
        axum::http::HeaderValue::from_static("text/plain; version=0.0.4; charset=utf-8"),
    );

    let body = format!(
        "# HELP cms_users_total Total registered users\n# TYPE cms_users_total \
         gauge\ncms_users_total {}\n# HELP cms_organizations_total Total organizations\n# TYPE \
         cms_organizations_total gauge\ncms_organizations_total {}\n# HELP cms_projects_total \
         Total projects\n# TYPE cms_projects_total gauge\ncms_projects_total {}\n# HELP \
         cms_db_connections_active Number of active PostgreSQL pool connections\n# TYPE \
         cms_db_connections_active gauge\ncms_db_connections_active {}\n# HELP \
         cms_db_connections_idle Number of idle PostgreSQL pool connections\n# TYPE \
         cms_db_connections_idle gauge\ncms_db_connections_idle {}\n",
        users, organizations, projects, active_db_connections, idle_db_connections
    );

    Ok((headers, body))
}
