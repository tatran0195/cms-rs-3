use serde::Deserialize;

/// Site serving configuration
#[derive(Debug, Clone, Deserialize)]
pub struct SiteConfig {
    /// Marketing brand host (e.g., cms.com)
    #[serde(default)]
    pub marketing_host: Option<String>,

    /// Self-hosted operator's host
    #[serde(default)]
    pub self_host: Option<String>,

    /// Custom domain edge secret (for Cloudflare Worker)
    #[serde(default)]
    pub edge_secret: Option<String>,

    /// Maximum age for SEO cache
    #[serde(default = "default_seo_cache_max_age")]
    pub seo_cache_max_age: usize,

    /// Trusted proxy IP addresses or CIDR blocks (falls back to server.trusted_proxies if empty)
    #[serde(default)]
    pub trusted_proxies: Vec<String>,
}

fn default_seo_cache_max_age() -> usize {
    300
} // 5 minutes

impl Default for SiteConfig {
    fn default() -> Self {
        Self {
            marketing_host: None,
            self_host: None,
            edge_secret: None,
            seo_cache_max_age: default_seo_cache_max_age(),
            trusted_proxies: Vec::new(),
        }
    }
}

/// Resolver settings used to prove TXT-record ownership for custom domains.
#[derive(Debug, Clone, Deserialize)]
pub struct DomainVerificationConfig {
    /// DNS-over-HTTPS JSON endpoint; must use HTTPS.
    #[serde(default = "default_dns_resolver_url")]
    pub resolver_url: String,

    /// Per-check HTTP timeout, clamped to 1–15 seconds.
    #[serde(default = "default_dns_resolver_timeout_seconds")]
    pub timeout_seconds: u64,
}

fn default_dns_resolver_url() -> String {
    "https://cloudflare-dns.com/dns-query".to_string()
}

fn default_dns_resolver_timeout_seconds() -> u64 {
    5
}

impl Default for DomainVerificationConfig {
    fn default() -> Self {
        Self {
            resolver_url: default_dns_resolver_url(),
            timeout_seconds: default_dns_resolver_timeout_seconds(),
        }
    }
}

/// Optional secret shared with a trusted TLS-terminating reverse proxy. When
/// present, a successful HTTPS request for a verified custom domain can update
/// its operational TLS status without exposing or storing private key material.
#[derive(Debug, Clone, Deserialize, Default)]
pub struct DomainTlsConfig {
    #[serde(default)]
    pub proxy_secret: Option<String>,
}
