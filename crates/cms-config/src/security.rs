use serde::Deserialize;

/// Rate limiting configuration
#[derive(Debug, Clone, Deserialize)]
pub struct RateLimitConfig {
    /// Whether rate limiting is enabled
    #[serde(default = "default_rate_limit_enabled")]
    pub enabled: bool,

    /// Requests per second limit
    #[serde(default = "default_rate_limit_rps")]
    pub requests_per_second: u32,

    /// Burst capacity
    #[serde(default = "default_rate_limit_burst")]
    pub burst_size: u32,

    /// Maximum number of tracked clients
    #[serde(default = "default_rate_limit_max_clients")]
    pub max_tracked_clients: usize,

    /// Client TTL in seconds
    #[serde(default = "default_rate_limit_ttl")]
    pub client_ttl_secs: u64,
}

fn default_rate_limit_enabled() -> bool {
    true
}
fn default_rate_limit_rps() -> u32 {
    100
}
fn default_rate_limit_burst() -> u32 {
    200
}
fn default_rate_limit_max_clients() -> usize {
    10_000
}
fn default_rate_limit_ttl() -> u64 {
    300
} // 5 minutes

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            enabled: default_rate_limit_enabled(),
            requests_per_second: default_rate_limit_rps(),
            burst_size: default_rate_limit_burst(),
            max_tracked_clients: default_rate_limit_max_clients(),
            client_ttl_secs: default_rate_limit_ttl(),
        }
    }
}

/// Security headers configuration
#[derive(Debug, Clone, Deserialize)]
pub struct SecurityHeadersConfig {
    /// Enable HSTS
    #[serde(default = "default_security_headers_hsts")]
    pub enable_hsts: bool,

    /// HSTS max age in seconds
    #[serde(default = "default_security_headers_hsts_max_age")]
    pub hsts_max_age: u32,

    /// Include subdomains in HSTS
    #[serde(default = "default_security_headers_hsts_include_subdomains")]
    pub hsts_include_subdomains: bool,

    /// Enable X-Content-Type-Options
    #[serde(default = "default_security_headers_x_content_type")]
    pub enable_x_content_type_options: bool,

    /// Enable X-Frame-Options
    #[serde(default = "default_security_headers_x_frame")]
    pub enable_x_frame_options: bool,

    /// X-Frame-Options value
    #[serde(default = "default_security_headers_x_frame_options")]
    pub x_frame_options: String,

    /// Enable X-XSS-Protection
    #[serde(default = "default_security_headers_x_xss")]
    pub enable_x_xss_protection: bool,

    /// Enable Content-Security-Policy
    #[serde(default = "default_security_headers_csp")]
    pub enable_csp: bool,

    /// CSP directive string
    #[serde(default = "default_security_headers_csp_value")]
    pub csp: String,

    /// Enable Referrer-Policy
    #[serde(default = "default_security_headers_referrer")]
    pub enable_referrer_policy: bool,

    /// Referrer-Policy value
    #[serde(default = "default_security_headers_referrer_policy")]
    pub referrer_policy: String,

    /// Enable Permissions-Policy
    #[serde(default = "default_security_headers_permissions")]
    pub enable_permissions_policy: bool,

    /// Permissions-Policy value
    #[serde(default = "default_security_headers_permissions_value")]
    pub permissions_policy: String,
}

fn default_security_headers_hsts() -> bool {
    true
}
fn default_security_headers_hsts_max_age() -> u32 {
    31536000
} // 1 year
fn default_security_headers_hsts_include_subdomains() -> bool {
    true
}
fn default_security_headers_x_content_type() -> bool {
    true
}
fn default_security_headers_x_frame() -> bool {
    true
}
fn default_security_headers_x_frame_options() -> String {
    "DENY".to_string()
}
fn default_security_headers_x_xss() -> bool {
    true
}
fn default_security_headers_csp() -> bool {
    true
}
fn default_security_headers_csp_value() -> String {
    "default-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';".to_string()
}
fn default_security_headers_referrer() -> bool {
    true
}
fn default_security_headers_referrer_policy() -> String {
    "strict-origin-when-cross-origin".to_string()
}
fn default_security_headers_permissions() -> bool {
    true
}
fn default_security_headers_permissions_value() -> String {
    "geolocation=(), microphone=(), camera=(), payment=()".to_string()
}

impl Default for SecurityHeadersConfig {
    fn default() -> Self {
        Self {
            enable_hsts: default_security_headers_hsts(),
            hsts_max_age: default_security_headers_hsts_max_age(),
            hsts_include_subdomains: default_security_headers_hsts_include_subdomains(),
            enable_x_content_type_options: default_security_headers_x_content_type(),
            enable_x_frame_options: default_security_headers_x_frame(),
            x_frame_options: default_security_headers_x_frame_options(),
            enable_x_xss_protection: default_security_headers_x_xss(),
            enable_csp: default_security_headers_csp(),
            csp: default_security_headers_csp_value(),
            enable_referrer_policy: default_security_headers_referrer(),
            referrer_policy: default_security_headers_referrer_policy(),
            enable_permissions_policy: default_security_headers_permissions(),
            permissions_policy: default_security_headers_permissions_value(),
        }
    }
}

/// Admin origin configuration
#[derive(Debug, Clone, Deserialize)]
pub struct AdminOriginConfig {
    /// Allowed admin origins
    #[serde(default = "default_admin_origin_origins")]
    pub allowed_origins: Vec<String>,

    /// Whether to enforce origin checking
    #[serde(default = "default_admin_origin_enforce")]
    pub enforce: bool,

    /// Whether to allow localhost for development
    #[serde(default = "default_admin_origin_localhost")]
    pub allow_localhost: bool,
}

fn default_admin_origin_origins() -> Vec<String> {
    vec![
        "https://admin.cms.com".to_string(),
        "https://app.cms.com".to_string(),
        "https://cms.com".to_string(),
    ]
}

fn default_admin_origin_enforce() -> bool {
    true
}
fn default_admin_origin_localhost() -> bool {
    true
}

impl Default for AdminOriginConfig {
    fn default() -> Self {
        Self {
            allowed_origins: default_admin_origin_origins(),
            enforce: default_admin_origin_enforce(),
            allow_localhost: default_admin_origin_localhost(),
        }
    }
}
