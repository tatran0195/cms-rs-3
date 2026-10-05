use std::sync::Arc;

use axum::{extract::Extension, routing::get, Router};

use crate::{
    handlers::{
        apple_touch_icon_handler, asset_handler, css_handler, favicon_16_handler,
        favicon_32_handler, favicon_handler, font_handler, image_handler, js_handler,
        manifest_handler, robots_txt_handler, root_handler, security_txt_handler,
        sitemap_xml_handler, wildcard_handler,
    },
    host_resolution::HostResolver,
    SitesAppState,
};

/// Derive the site base host from config.
///
/// Prefers the operator's `site.self_host`, then `site.marketing_host`,
/// falling back to `"localhost"`.
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
        .unwrap_or_else(|| "localhost".to_string())
}

/// Create the full router with all site routes
pub fn create_router(state: Arc<SitesAppState>) -> Router {
    let mut canonical_domains = Vec::new();
    if let Some(ref host) = state.config.site.self_host {
        let clean = host.trim_start_matches("https://").trim_start_matches("http://");
        let bare = clean.split(':').next().unwrap_or(clean);
        if !bare.is_empty() {
            canonical_domains.push(bare.to_string());
        }
    }
    if let Some(ref host) = state.config.site.marketing_host {
        let clean = host.trim_start_matches("https://").trim_start_matches("http://");
        let bare = clean.split(':').next().unwrap_or(clean);
        if !bare.is_empty() && !canonical_domains.contains(&bare.to_string()) {
            canonical_domains.push(bare.to_string());
        }
    }
    let default_h = site_host(&state);
    let bare_default = default_h.split(':').next().unwrap_or(&default_h);
    if !bare_default.is_empty()
        && bare_default != "localhost"
        && bare_default != "127.0.0.1"
        && !canonical_domains.contains(&bare_default.to_string())
    {
        canonical_domains.push(bare_default.to_string());
    }

    let trusted_proxies = if !state.config.site.trusted_proxies.is_empty() {
        state.config.site.trusted_proxies.clone()
    } else {
        state.config.server.trusted_proxies.clone()
    };

    let host_resolver = Arc::new(HostResolver::with_options(
        state.biz_context.pool.clone(),
        default_h,
        state.host_resolution_generation.clone(),
        canonical_domains,
        trusted_proxies,
    ));

    Router::new()
        // Main site handler - resolves host and serves appropriate content
        .route("/", get(root_handler))
        .route("/{*path}", get(wildcard_handler))
        // SEO files
        .route("/robots.txt", get(robots_txt_handler))
        .route("/sitemap.xml", get(sitemap_xml_handler))
        .route("/.well-known/security.txt", get(security_txt_handler))
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
