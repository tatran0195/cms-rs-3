use serde::Deserialize;

/// Server configuration
#[derive(Debug, Clone, Deserialize)]
pub struct ServerConfig {
    /// Port to listen on
    #[serde(default = "default_port")]
    pub port: u16,

    /// Host to bind to
    #[serde(default = "default_host")]
    pub host: String,

    /// Whether to enable HTTPS (for direct TLS termination)
    #[serde(default)]
    pub https: bool,

    /// Path to TLS certificate (if https is true)
    #[serde(default)]
    pub tls_cert_path: Option<String>,

    /// Path to TLS key (if https is true)
    #[serde(default)]
    pub tls_key_path: Option<String>,

    /// Trusted proxy hops for X-Forwarded-For parsing
    #[serde(default = "default_trusted_proxy_hops")]
    pub trusted_proxy_hops: usize,

    /// Trusted proxy IP addresses or CIDR blocks (e.g. "127.0.0.1", "::1", "10.0.0.0/8")
    #[serde(default)]
    pub trusted_proxies: Vec<String>,
}

fn default_port() -> u16 {
    3000
}
fn default_host() -> String {
    "0.0.0.0".to_string()
}
fn default_trusted_proxy_hops() -> usize {
    1
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            port: default_port(),
            host: default_host(),
            https: false,
            tls_cert_path: None,
            tls_key_path: None,
            trusted_proxy_hops: default_trusted_proxy_hops(),
            trusted_proxies: Vec::new(),
        }
    }
}
