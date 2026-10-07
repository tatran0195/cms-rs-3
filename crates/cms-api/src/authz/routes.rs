//! Route builders for permission catalogs and custom roles

use std::sync::Arc;
use axum::{
    routing::get,
    Router,
};
use cms_middleware::app_state::AppState;

use crate::authz::handlers::*;

/// Router for permissions catalog
pub fn permissions_router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/catalog", get(get_permission_catalog_handler))
        .with_state(state)
}

/// Router for workspace roles CRUD
pub fn workspace_roles_router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/{org_id}/roles", get(list_workspace_roles_handler).post(create_workspace_role_handler))
        .route("/{org_id}/roles/{role_id}", get(get_workspace_role_handler).patch(update_workspace_role_handler).delete(delete_workspace_role_handler))
        .route("/{org_id}/roles/{role_id}/usage", get(get_workspace_role_usage_handler))
        .with_state(state)
}

/// Router for project roles CRUD
pub fn project_roles_router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/{project_id}/roles", get(list_project_roles_handler).post(create_project_role_handler))
        .route("/{project_id}/roles/{role_id}", get(get_project_role_handler).patch(update_project_role_handler).delete(delete_project_role_handler))
        .route("/{project_id}/roles/{role_id}/usage", get(get_project_role_usage_handler))
        .with_state(state)
}
