//! Admin origin isolation middleware
//!
//! This module provides middleware to enforce admin origin isolation.
//! This prevents CSRF attacks by ensuring admin requests come from trusted origins.
//!
//! # Security Notes
//!
//! - **DO NOT** trust the Referer header for security decisions (CSRF vulnerability)
//! - Only the Origin header is used for validation
//! - Origin normalization is applied (lowercase, trailing slash removal)
//! - All origins must be explicitly allowed in configuration
//!
//! # Deployment Considerations
//!
//! For single-machine AWS Windows deployment, this provides basic CSRF protection.
//! For enhanced security in production, consider:
//! - Adding CSRF tokens to admin forms
//! - Using SameSite cookies
//! - Implementing double-submit cookie pattern

use std::{collections::HashSet, sync::Arc};

use axum::{
    http::{header, request::Parts, StatusCode},
    response::{IntoResponse, Response},
};

/// Admin origin configuration with validation
#[derive(Debug, Clone)]
pub struct AdminOriginConfig {
    /// Allowed admin origins (normalized: lowercase, no trailing slash)
    pub allowed_origins: HashSet<String>,
    /// Whether to enforce origin checking (disable for testing only)
    pub enforce: bool,
    /// Whether to allow localhost for development
    pub allow_localhost: bool,
}

impl Default for AdminOriginConfig {
    fn default() -> Self {
        let mut origins = HashSet::new();
        origins.insert("https://admin.cms.com".to_string());
        origins.insert("https://app.cms.com".to_string());
        origins.insert("https://cms.com".to_string());

        Self {
            allowed_origins: origins,
            enforce: true,
            allow_localhost: true,
        }
    }
}

impl AdminOriginConfig {
    /// Validate configuration
    pub fn validate(&self) -> Result<(), String> {
        // Validate all origins are valid URLs
        for origin in &self.allowed_origins {
            if origin.is_empty() {
                return Err("Allowed origins cannot be empty".to_string());
            }

            // Validate origin format: scheme://host[:port]
            // Must start with http:// or https://
            if !origin.starts_with("http://") && !origin.starts_with("https://") {
                return Err(format!(
                    "Invalid origin format: {}. Must start with http:// or https://",
                    origin
                ));
            }

            // Must not contain path or query
            let without_scheme = origin.split("://").nth(1).unwrap_or("");
            if without_scheme.contains('/')
                || without_scheme.contains('?')
                || without_scheme.contains('#')
            {
                return Err(format!(
                    "Invalid origin: {}. Must not contain path, query, or fragment",
                    origin
                ));
            }
        }

        Ok(())
    }

    /// Add an allowed origin (automatically normalized)
    pub fn add_origin(&mut self, origin: String) -> Result<(), String> {
        let normalized = normalize_origin(&origin)?;
        self.allowed_origins.insert(normalized);
        Ok(())
    }

    /// Check if an origin is allowed
    ///
    /// # Security
    /// - Only validates against explicitly allowed origins
    /// - Does NOT trust Referer header (CSRF vulnerability)
    /// - Normalizes origins before comparison
    pub fn is_origin_allowed(&self, origin: &str) -> bool {
        if !self.enforce {
            return true;
        }

        let normalized_origin = match normalize_origin(origin) {
            Ok(o) => o,
            Err(_) => return false,
        };

        // Allow localhost for development
        if self.allow_localhost && is_localhost_origin(&normalized_origin) {
            return true;
        }

        self.allowed_origins.contains(&normalized_origin)
    }
}

/// Normalize an origin string for consistent comparison
///
/// - Converts to lowercase
/// - Removes trailing slash
/// - Removes default ports (80 for http, 443 for https)
///
/// # Examples
/// - `https://Example.com:443/` -> `https://example.com`
/// - `http://localhost:8080` -> `http://localhost:8080` (non-default port kept)
pub fn normalize_origin(origin: &str) -> Result<String, String> {
    if origin.is_empty() {
        return Err("Origin cannot be empty".to_string());
    }

    let origin_lower = origin.to_lowercase();

    // Remove trailing slash
    let origin_trimmed = origin_lower.trim_end_matches('/');

    // Parse scheme and host
    let (scheme, host_port) = match origin_trimmed.split_once("://") {
        Some((scheme, host_port)) => (scheme, host_port),
        None => {
            return Err(format!(
                "Invalid origin: missing scheme: {}",
                origin_trimmed
            ))
        }
    };

    // Remove default ports
    let host = if let Some((host, port)) = host_port.split_once(':') {
        match (scheme, port) {
            ("http", "80") | ("https", "443") => host.to_string(),
            _ => format!("{}:{}", host, port),
        }
    } else {
        host_port.to_string()
    };

    Ok(format!("{}://{}", scheme, host))
}

/// Check if an origin is localhost
fn is_localhost_origin(origin: &str) -> bool {
    // Check for localhost
    if origin.contains("localhost") {
        return true;
    }

    // Check for 127.0.0.1
    if origin.contains("127.0.0.1") {
        return true;
    }

    // Check for ::1 (IPv6 localhost)
    if origin.contains("::1") {
        return true;
    }

    // Check for 0.0.0.0
    if origin.contains("0.0.0.0") {
        return true;
    }

    false
}

/// Admin origin validation result
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AdminOriginValidation {
    /// The validated origin (normalized)
    pub origin: Option<String>,
    /// Whether the origin is allowed
    pub is_allowed: bool,
}

/// Admin origin extractor
///
/// Extracts and validates the Origin header from the request.
///
/// # Security
/// - Only uses the Origin header (not Referer)
/// - Returns Forbidden if origin is not allowed
/// - Does not trust Referer header to prevent CSRF
#[derive(Debug, Clone)]
pub struct AdminOriginExtractor {
    config: Arc<AdminOriginConfig>,
}

impl AdminOriginExtractor {
    pub fn new(config: Arc<AdminOriginConfig>) -> Self {
        Self { config }
    }

    pub fn config(&self) -> &Arc<AdminOriginConfig> {
        &self.config
    }
}

impl From<&cms_config::AdminOriginConfig> for AdminOriginConfig {
    fn from(config: &cms_config::AdminOriginConfig) -> Self {
        let mut origins = HashSet::new();
        for origin in &config.allowed_origins {
            if let Ok(normalized) = normalize_origin(origin) {
                origins.insert(normalized);
            } else if !origin.is_empty() {
                origins.insert(origin.to_lowercase().trim_end_matches('/').to_string());
            }
        }
        Self {
            allowed_origins: origins,
            enforce: config.enforce,
            allow_localhost: config.allow_localhost,
        }
    }
}

impl From<cms_config::AdminOriginConfig> for AdminOriginConfig {
    fn from(config: cms_config::AdminOriginConfig) -> Self {
        Self::from(&config)
    }
}

/// Admin origin validation
///
/// Validates the Origin header against allowed origins.
///
/// # Security
/// - **DOES NOT** use Referer header (CSRF vulnerability)
/// - Only Origin header is checked
/// - Origin is normalized before validation
/// - Machine clients (Bearer / API-key without cookies) are preserved
/// - Safe methods (GET, HEAD, OPTIONS) do not trigger CSRF rejection
pub async fn validate_admin_origin(
    parts: &mut Parts,
    config: &AdminOriginConfig,
) -> Result<AdminOriginValidation, StatusCode> {
    // Safe HTTP methods do not execute state-changing CSRF mutations
    if parts.method == axum::http::Method::GET
        || parts.method == axum::http::Method::HEAD
        || parts.method == axum::http::Method::OPTIONS
    {
        return Ok(AdminOriginValidation {
            origin: None,
            is_allowed: true,
        });
    }

    // Get Origin header ONLY - do NOT use Referer
    // Referer header can be spoofed and is not reliable for security decisions
    let origin = parts
        .headers
        .get(header::ORIGIN)
        .and_then(|h| h.to_str().ok())
        .map(|s| s.to_string());

    let final_origin = origin.as_ref().and_then(|o| {
        // Try to normalize the origin
        normalize_origin(o).ok()
    });

    if let Some(ref o) = final_origin {
        let is_allowed = config.is_origin_allowed(o);
        if !is_allowed && config.enforce {
            return Err(StatusCode::FORBIDDEN);
        }
        return Ok(AdminOriginValidation {
            origin: final_origin,
            is_allowed,
        });
    }

    // No Origin header was provided
    // Preserve machine clients (Bearer token or X-Api-Key without cookie)
    let has_bearer_or_api_key = parts.headers.contains_key(header::AUTHORIZATION)
        || parts.headers.contains_key("x-api-key");
    let has_cookie = parts.headers.contains_key(header::COOKIE);

    if has_bearer_or_api_key && !has_cookie {
        return Ok(AdminOriginValidation {
            origin: None,
            is_allowed: true,
        });
    }

    // In development/test mode (allow_localhost = true), allow missing Origin for test harnesses / CLI
    if config.allow_localhost {
        return Ok(AdminOriginValidation {
            origin: None,
            is_allowed: true,
        });
    }

    // In production with enforcement enabled, cookie mutations require an allowed Origin header
    if config.enforce {
        Err(StatusCode::FORBIDDEN)
    } else {
        Ok(AdminOriginValidation {
            origin: None,
            is_allowed: false,
        })
    }
}

/// Admin origin middleware layer
#[derive(Debug, Clone)]
pub struct AdminOriginLayer {
    config: Arc<AdminOriginConfig>,
}

impl AdminOriginLayer {
    pub fn new(config: AdminOriginConfig) -> Result<Self, String> {
        config.validate()?;
        Ok(Self {
            config: Arc::new(config),
        })
    }

    pub fn with_arc(config: Arc<AdminOriginConfig>) -> Self {
        Self { config }
    }

    /// Get the configuration
    pub fn config(&self) -> Arc<AdminOriginConfig> {
        self.config.clone()
    }
}

impl<S> tower::Layer<S> for AdminOriginLayer {
    type Service = AdminOriginService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        AdminOriginService {
            inner,
            config: self.config.clone(),
        }
    }
}

/// Admin origin service
#[derive(Debug, Clone)]
pub struct AdminOriginService<S> {
    inner: S,
    config: Arc<AdminOriginConfig>,
}

impl<S, ReqBody> tower::Service<axum::http::Request<ReqBody>> for AdminOriginService<S>
where
    S: tower::Service<axum::http::Request<ReqBody>, Response = axum::response::Response>
        + Clone
        + Send
        + 'static,
    S::Future: Send + 'static,
    ReqBody: Send + 'static,
{
    type Response = axum::response::Response;
    type Error = S::Error;
    type Future = std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<Self::Response, Self::Error>> + Send>,
    >;

    fn poll_ready(
        &mut self,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: axum::http::Request<ReqBody>) -> Self::Future {
        let mut inner = self.inner.clone();
        let config = self.config.clone();

        Box::pin(async move {
            let (mut parts, body) = req.into_parts();
            match validate_admin_origin(&mut parts, &config).await {
                Ok(_) => {
                    let req = axum::http::Request::from_parts(parts, body);
                    inner.call(req).await
                }
                Err(_) => Ok(AdminOriginRejection.into_response()),
            }
        })
    }
}

/// Admin origin rejection
#[derive(Debug, Clone)]
pub struct AdminOriginRejection;

impl IntoResponse for AdminOriginRejection {
    fn into_response(self) -> Response {
        (
            StatusCode::FORBIDDEN,
            [(
                header::CONTENT_TYPE,
                header::HeaderValue::from_static("text/plain"),
            )],
            "Admin origin validation failed: Origin header is required and must be an allowed \
             origin",
        )
            .into_response()
    }
}

impl<S> axum::extract::FromRequestParts<S> for AdminOriginValidation
where
    S: Send + Sync,
{
    type Rejection = (StatusCode, &'static str);

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let config = parts
            .extensions
            .get::<Arc<AdminOriginConfig>>()
            .cloned()
            .unwrap_or_else(|| Arc::new(AdminOriginConfig::default()));

        validate_admin_origin(parts, &config)
            .await
            .map_err(|status| (status, "Admin origin validation failed"))
    }
}

/// Extract origin from request parts (for use in handlers)
///
/// Returns the normalized origin if present and valid, or None
pub fn extract_origin_from_request(parts: &Parts) -> Option<String> {
    parts
        .headers
        .get(header::ORIGIN)
        .and_then(|h| h.to_str().ok())
        .and_then(|s| normalize_origin(s).ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_origin() {
        // Basic normalization
        assert_eq!(
            normalize_origin("https://Example.com").unwrap(),
            "https://example.com"
        );

        // Remove trailing slash
        assert_eq!(
            normalize_origin("https://example.com/").unwrap(),
            "https://example.com"
        );

        // Remove default https port
        assert_eq!(
            normalize_origin("https://example.com:443").unwrap(),
            "https://example.com"
        );

        // Remove default http port
        assert_eq!(
            normalize_origin("http://example.com:80").unwrap(),
            "http://example.com"
        );

        // Keep non-default port
        assert_eq!(
            normalize_origin("http://example.com:8080").unwrap(),
            "http://example.com:8080"
        );

        // Localhost
        assert_eq!(
            normalize_origin("http://localhost:3000").unwrap(),
            "http://localhost:3000"
        );

        // IPv6 localhost
        assert_eq!(
            normalize_origin("http://[::1]:3000").unwrap(),
            "http://[::1]:3000"
        );
    }

    #[test]
    fn test_is_localhost_origin() {
        assert!(is_localhost_origin("http://localhost"));
        assert!(is_localhost_origin("http://localhost:3000"));
        assert!(is_localhost_origin("https://127.0.0.1"));
        assert!(is_localhost_origin("http://127.0.0.1:8080"));
        assert!(is_localhost_origin("http://[::1]"));
        assert!(is_localhost_origin("http://0.0.0.0:3000"));

        assert!(!is_localhost_origin("https://example.com"));
    }

    #[test]
    fn test_admin_origin_config_validation() {
        // Valid config
        let config = AdminOriginConfig::default();
        assert!(config.validate().is_ok());

        // Invalid: origin with path
        let mut config = AdminOriginConfig::default();
        config
            .allowed_origins
            .insert("https://example.com/path".to_string());
        assert!(config.validate().is_err());

        // Invalid: origin without scheme
        let mut config = AdminOriginConfig::default();
        config.allowed_origins.insert("example.com".to_string());
        assert!(config.validate().is_err());

        // Invalid: empty origin
        let mut config = AdminOriginConfig::default();
        config.allowed_origins.insert(String::new());
        assert!(config.validate().is_err());
    }

    #[test]
    fn test_admin_origin_config_is_allowed() {
        let config = AdminOriginConfig {
            allowed_origins: {
                let mut set = HashSet::new();
                set.insert("https://admin.cms.com".to_string());
                set
            },
            enforce: true,
            allow_localhost: false,
        };

        assert!(config.is_origin_allowed("https://admin.cms.com"));
        assert!(config.is_origin_allowed("https://ADMIN.CMS.COM")); // Case insensitive
        assert!(config.is_origin_allowed("https://admin.cms.com/")); // Trailing slash

        assert!(!config.is_origin_allowed("https://evil.com"));
        assert!(!config.is_origin_allowed("https://admin.cms.com.evil.com"));
    }

    #[test]
    fn test_admin_origin_config_localhost() {
        let config = AdminOriginConfig {
            allowed_origins: HashSet::new(),
            enforce: true,
            allow_localhost: true,
        };

        assert!(config.is_origin_allowed("http://localhost:3000"));
        assert!(config.is_origin_allowed("http://127.0.0.1:8080"));

        assert!(!config.is_origin_allowed("https://example.com"));
    }

    #[test]
    fn test_admin_origin_config_disabled() {
        let config = AdminOriginConfig {
            allowed_origins: HashSet::new(),
            enforce: false,
            allow_localhost: false,
        };

        // When enforce is false, all origins are allowed
        assert!(config.is_origin_allowed("https://any-origin.com"));
    }

    #[tokio::test]
    async fn test_validate_admin_origin_safe_methods() {
        let config = AdminOriginConfig {
            allowed_origins: HashSet::new(),
            enforce: true,
            allow_localhost: false,
        };

        let req = axum::http::Request::builder()
            .method("GET")
            .uri("/admin/stats")
            .body(())
            .unwrap();
        let (mut parts, _) = req.into_parts();
        assert!(validate_admin_origin(&mut parts, &config).await.is_ok());
    }

    #[tokio::test]
    async fn test_validate_admin_origin_allowed_mutation() {
        let mut origins = HashSet::new();
        origins.insert("https://admin.cms.com".to_string());
        let config = AdminOriginConfig {
            allowed_origins: origins,
            enforce: true,
            allow_localhost: false,
        };

        let req = axum::http::Request::builder()
            .method("POST")
            .uri("/admin/users/1/suspend")
            .header("origin", "https://admin.cms.com")
            .body(())
            .unwrap();
        let (mut parts, _) = req.into_parts();
        let res = validate_admin_origin(&mut parts, &config).await;
        assert!(res.is_ok());
        assert!(res.unwrap().is_allowed);
    }

    #[tokio::test]
    async fn test_validate_admin_origin_rejected_evil_origin() {
        let mut origins = HashSet::new();
        origins.insert("https://admin.cms.com".to_string());
        let config = AdminOriginConfig {
            allowed_origins: origins,
            enforce: true,
            allow_localhost: false,
        };

        let req = axum::http::Request::builder()
            .method("POST")
            .uri("/admin/users/1/suspend")
            .header("origin", "https://evil.com")
            .body(())
            .unwrap();
        let (mut parts, _) = req.into_parts();
        let res = validate_admin_origin(&mut parts, &config).await;
        assert_eq!(res, Err(StatusCode::FORBIDDEN));
    }

    #[tokio::test]
    async fn test_validate_admin_origin_bearer_preserved() {
        let config = AdminOriginConfig {
            allowed_origins: HashSet::new(),
            enforce: true,
            allow_localhost: false,
        };

        let req = axum::http::Request::builder()
            .method("POST")
            .uri("/admin/users/1/suspend")
            .header("authorization", "Bearer test-token")
            .body(())
            .unwrap();
        let (mut parts, _) = req.into_parts();
        let res = validate_admin_origin(&mut parts, &config).await;
        assert!(res.is_ok());
    }

    #[tokio::test]
    async fn test_validate_admin_origin_cookie_production_rejected_without_origin() {
        let config = AdminOriginConfig {
            allowed_origins: HashSet::new(),
            enforce: true,
            allow_localhost: false,
        };

        let req = axum::http::Request::builder()
            .method("POST")
            .uri("/admin/users/1/suspend")
            .header("cookie", "cms_session=test")
            .body(())
            .unwrap();
        let (mut parts, _) = req.into_parts();
        let res = validate_admin_origin(&mut parts, &config).await;
        assert_eq!(res, Err(StatusCode::FORBIDDEN));
    }

    #[tokio::test]
    async fn test_validate_admin_origin_cookie_dev_allowed_without_origin() {
        let config = AdminOriginConfig {
            allowed_origins: HashSet::new(),
            enforce: true,
            allow_localhost: true,
        };

        let req = axum::http::Request::builder()
            .method("POST")
            .uri("/admin/users/1/suspend")
            .header("cookie", "cms_session=test")
            .body(())
            .unwrap();
        let (mut parts, _) = req.into_parts();
        let res = validate_admin_origin(&mut parts, &config).await;
        assert!(res.is_ok());
    }

    #[tokio::test]
    async fn test_admin_origin_layer_middleware() {
        use axum::{routing::post, Router};
        use tower::ServiceExt;

        let mut origins = HashSet::new();
        origins.insert("https://admin.cms.com".to_string());
        let config = AdminOriginConfig {
            allowed_origins: origins,
            enforce: true,
            allow_localhost: false,
        };
        let layer = AdminOriginLayer::new(config).unwrap();

        let app = Router::new()
            .route("/admin/action", post(|| async { "ok" }))
            .layer(layer);

        // Evil origin -> 403 Forbidden
        let evil_req = axum::http::Request::builder()
            .method("POST")
            .uri("/admin/action")
            .header("origin", "https://evil.com")
            .body(axum::body::Body::empty())
            .unwrap();
        let evil_res = app.clone().oneshot(evil_req).await.unwrap();
        assert_eq!(evil_res.status(), StatusCode::FORBIDDEN);

        // Allowed origin -> 200 OK
        let ok_req = axum::http::Request::builder()
            .method("POST")
            .uri("/admin/action")
            .header("origin", "https://admin.cms.com")
            .body(axum::body::Body::empty())
            .unwrap();
        let ok_res = app.oneshot(ok_req).await.unwrap();
        assert_eq!(ok_res.status(), StatusCode::OK);
    }
}
