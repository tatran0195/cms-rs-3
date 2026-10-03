use std::sync::Arc;

use axum::{extract::Extension, routing::get, Router};

use crate::{
    handlers::{
        apple_touch_icon_handler, asset_handler, css_handler, favicon_16_handler,
        favicon_32_handler, favicon_handler, font_handler, image_handler, js_handler,
        manifest_handler, pgp_key_handler, robots_txt_handler, root_handler, security_txt_handler,
        sitemap_xml_handler, wildcard_handler,
    },
    host_resolution::HostResolver,
    SitesAppState,
};

/// Derive the site base host from config, falling back to `"cms.app"`.
///
/// Prefers the operator's `site.self_host`, then `site.marketing_host`, then the
/// historical default — so self-hosted operators and branded deployments don't
/// need to bake `cms.app` into the binary.
pub fn site_host(state: &Arc<SitesAppState>) -> String {
    let site = &state.config.site;
    site.self_host
        .clone()
        .or_else(|| site.marketing_host.clone())
        .map(|h| {
            h.trim_start_matches("https://")
                .trim_start_matches("http://")
                .to_string()
        })
        .unwrap_or_else(|| "cms.app".to_string())
}

/// Create the full router with all site routes
pub fn create_router(state: Arc<SitesAppState>) -> Router {
    let host_resolver = Arc::new(HostResolver::with_generation(
        state.biz_context.pool.clone(),
        site_host(&state),
        state.host_resolution_generation.clone(),
    ));

    Router::new()
        // Main site handler - resolves host and serves appropriate content
        .route("/", get(root_handler))
        .route("/{*path}", get(wildcard_handler))
        // SEO files
        .route("/robots.txt", get(robots_txt_handler))
        .route("/sitemap.xml", get(sitemap_xml_handler))
        .route("/.well-known/security.txt", get(security_txt_handler))
        .route("/.well-known/pgp-key.txt", get(pgp_key_handler))
        // Static assets for published sites / SPA
        .route("/assets/{*path}", get(asset_handler))
        .route("/css/{*path}", get(css_handler))
        .route("/js/{*path}", get(js_handler))
        .route("/fonts/{*path}", get(font_handler))
        .route("/images/{*path}", get(image_handler))
        // Favicon
        .route("/favicon.ico", get(favicon_handler))
        .route("/favicon-32x32.png", get(favicon_32_handler))
        .route("/favicon-16x16.png", get(favicon_16_handler))
        .route("/apple-touch-icon.png", get(apple_touch_icon_handler))
        // Manifest
        .route("/site.webmanifest", get(manifest_handler))
        .layer(Extension(host_resolver))
        .with_state(state)
}
