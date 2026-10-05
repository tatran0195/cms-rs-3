//! CMS Sites
//!
//! This crate handles serving published documentation sites and marketing pages.
//! It provides host resolution, Markdown to HTML rendering, SEO/machine files,
//! and security headers for published sites.
//!
//! This replaces the functionality in `apps/app/src/server.ts` from the original
//! TypeScript monorepo.

use std::sync::Arc;

use axum::Router;
use cms_middleware::app_state::AppState;

pub mod handlers;
pub mod host_resolution;
pub mod markdown_renderer;
pub mod mime;
pub mod routes;
pub mod security;
pub mod seo;
pub mod spa;
pub mod static_files;

pub use mime::get_mime_type;
pub use routes::create_router;
pub use spa::{serve_spa_file, validate_frontend_assets};

/// AppState for sites - this will be provided by the binary crate
pub type SitesAppState = AppState;

/// Create the sites router
pub fn create_sites_router(state: Arc<SitesAppState>) -> Router {
    create_router(state)
}

/// Alias for create_sites_router (for compatibility with main.rs)
pub fn sites_router(state: Arc<SitesAppState>) -> Router {
    create_sites_router(state)
}
