//! Host resolution
//!
//! This module handles resolving request hosts to projects and deployments,
//! with trusted proxy enforcement, host syntax validation, and configurable
//! canonical domains.

use std::{
    collections::HashMap,
    net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, RwLock,
    },
    time::{Duration, Instant},
};

use axum::{
    extract::{ConnectInfo, FromRequestParts},
    http::{header, request::Parts, HeaderMap},
};
use cms_db::{deployment::DeploymentQueries, domain::DomainQueries, project::ProjectQueries};
use cms_entity::common::Id;
use cms_error::AppError;
use ipnet::IpNet;
use sqlx::PgPool;

const HOST_CACHE_MAX_ENTRIES: usize = 4096;

/// Extractor for remote client IP address from Axum connection info or request extensions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct ClientIp(pub Option<IpAddr>);

impl<S> FromRequestParts<S> for ClientIp
where
    S: Send + Sync,
{
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        if let Some(ci) = parts.extensions.get::<ConnectInfo<SocketAddr>>() {
            return Ok(ClientIp(Some(ci.0.ip())));
        }
        if let Some(addr) = parts.extensions.get::<SocketAddr>() {
            return Ok(ClientIp(Some(addr.ip())));
        }
        if let Some(ip) = parts.extensions.get::<IpAddr>() {
            return Ok(ClientIp(Some(*ip)));
        }
        Ok(ClientIp(None))
    }
}

/// Parse a list of IP address strings or CIDR notation blocks into `ipnet::IpNet`.
pub fn parse_trusted_proxies(proxies: &[String]) -> Vec<IpNet> {
    proxies
        .iter()
        .filter_map(|s| {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                None
            } else if trimmed.contains('/') {
                trimmed.parse::<IpNet>().ok()
            } else {
                trimmed.parse::<IpAddr>().map(IpNet::from).ok()
            }
        })
        .collect()
}

/// Validate and sanitize host header value.
///
/// Follows RFC 1123 / RFC 3986 rules:
/// - Rejects slashes, control characters, query/hash/at delimiters, and whitespace.
/// - Strips valid optional port (:1..65535).
/// - Validates IPv6 bracketed hosts ([::1]) or IPv4 addresses.
/// - Validates domain name labels (alphanumeric and hyphens, 1-63 chars per label, <= 253 total).
/// - Returns lowercased host without port on success, or None on invalid syntax.
pub fn sanitize_and_validate_host(candidate: &str) -> Option<String> {
    if candidate.chars().any(|c| c.is_control() || c == '\0') {
        return None;
    }
    let trimmed = candidate.trim();
    if trimmed.is_empty() || trimmed.len() > 253 {
        return None;
    }

    // Reject control chars, whitespace, slashes, and URL syntax chars
    if trimmed.chars().any(|c| {
        c.is_control()
            || c.is_whitespace()
            || c == '/'
            || c == '\\'
            || c == '?'
            || c == '#'
            || c == '@'
            || !c.is_ascii()
    }) {
        return None;
    }

    // Handle bracketed IPv6: [::1] or [::1]:port
    if trimmed.starts_with('[') {
        let close = trimmed.find(']')?;
        let ip_str = &trimmed[1..close];
        let rest = &trimmed[close + 1..];
        if !rest.is_empty() {
            let port_str = rest.strip_prefix(':')?;
            let port: u16 = port_str.parse().ok()?;
            if port == 0 {
                return None;
            }
        }
        let ipv6: Ipv6Addr = ip_str.parse().ok()?;
        return Some(format!("[{}]", ipv6));
    }

    // Handle host:port or host
    let host_part = if let Some((h, p)) = trimmed.split_once(':') {
        // Must not contain another colon (only bracketed IPv6 may have colons)
        if p.contains(':') {
            return None;
        }
        let port: u16 = p.parse().ok()?;
        if port == 0 {
            return None;
        }
        h
    } else {
        trimmed
    };

    if host_part.is_empty() || host_part.len() > 253 {
        return None;
    }

    // Check if it's an IPv4 address
    if let Ok(ipv4) = host_part.parse::<Ipv4Addr>() {
        return Some(ipv4.to_string());
    }

    // Must be valid DNS domain name
    if host_part.starts_with('.') || host_part.ends_with('.') {
        return None;
    }

    let labels: Vec<&str> = host_part.split('.').collect();
    for label in labels {
        if label.is_empty() || label.len() > 63 {
            return None;
        }
        if label.starts_with('-') || label.ends_with('-') {
            return None;
        }
        if !label.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
            return None;
        }
    }

    Some(host_part.to_ascii_lowercase())
}

/// Host resolution result
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HostResolutionResult {
    pub project_id: Id,
    pub deployment_id: Option<Id>,
    pub domain_id: Option<Id>,
    pub is_custom_domain: bool,
    pub hostname: String,
}

/// Cache entry for host resolution
#[derive(Debug, Clone)]
struct HostCacheEntry {
    pub result: Option<HostResolutionResult>,
    pub expires_at: Instant,
    pub generation: u64,
}

/// Host resolver with caching, trusted proxy enforcement, and canonical origin scoping.
pub struct HostResolver {
    pool: PgPool,
    default_host: String,
    canonical_domains: Vec<String>,
    trusted_proxies: Vec<IpNet>,
    cache: RwLock<HashMap<String, HostCacheEntry>>,
    cache_ttl: Duration,
    generation: Arc<AtomicU64>,
}

impl HostResolver {
    pub fn new(pool: PgPool, default_host: String) -> Self {
        Self::with_generation(pool, default_host, Arc::new(AtomicU64::new(0)))
    }

    /// Construct a resolver whose cache is invalidated by the shared app-state
    /// generation counter whenever a domain is created, changed, or verified.
    pub fn with_generation(pool: PgPool, default_host: String, generation: Arc<AtomicU64>) -> Self {
        let bare_default = default_host
            .trim_start_matches("https://")
            .trim_start_matches("http://");
        let bare_default = bare_default.split(':').next().unwrap_or(bare_default);
        let canonical_domains = if !bare_default.is_empty()
            && bare_default != "localhost"
            && bare_default != "127.0.0.1"
            && bare_default != "0.0.0.0"
        {
            vec![bare_default.to_ascii_lowercase()]
        } else {
            Vec::new()
        };

        Self::with_options(
            pool,
            default_host,
            generation,
            canonical_domains,
            Vec::new(),
        )
    }

    /// Full constructor supporting explicit canonical domains and trusted proxy networks.
    pub fn with_options(
        pool: PgPool,
        default_host: String,
        generation: Arc<AtomicU64>,
        canonical_domains: Vec<String>,
        trusted_proxies: Vec<String>,
    ) -> Self {
        let normalized_canonical = canonical_domains
            .into_iter()
            .filter_map(|d| {
                let clean = d.trim_start_matches("https://").trim_start_matches("http://");
                let bare = clean.split(':').next().unwrap_or(clean);
                sanitize_and_validate_host(bare)
            })
            .collect();

        Self {
            pool,
            default_host,
            canonical_domains: normalized_canonical,
            trusted_proxies: parse_trusted_proxies(&trusted_proxies),
            cache: RwLock::new(HashMap::new()),
            cache_ttl: Duration::from_secs(30),
            generation,
        }
    }

    pub fn with_canonical_domains(mut self, domains: Vec<String>) -> Self {
        self.canonical_domains = domains
            .into_iter()
            .filter_map(|d| {
                let clean = d.trim_start_matches("https://").trim_start_matches("http://");
                let bare = clean.split(':').next().unwrap_or(clean);
                sanitize_and_validate_host(bare)
            })
            .collect();
        self
    }

    pub fn with_trusted_proxies(mut self, proxies: Vec<String>) -> Self {
        self.trusted_proxies = parse_trusted_proxies(&proxies);
        self
    }

    /// Returns true if the client IP is in the configured trusted proxy networks.
    pub fn is_trusted_proxy(&self, client_ip: Option<IpAddr>) -> bool {
        let Some(ip) = client_ip else {
            return false;
        };
        self.trusted_proxies.iter().any(|net| net.contains(&ip))
    }

    /// Resolve host to project, inspecting client IP for proxy trust.
    pub async fn resolve(
        &self,
        headers: &HeaderMap,
        client_ip: Option<IpAddr>,
    ) -> Result<Option<HostResolutionResult>, AppError> {
        let host = self.get_host(headers, client_ip)?;
        let generation = self.generation.load(Ordering::Acquire);

        if let Some(cached) = self.cached_result(&host, generation) {
            if self.generation.load(Ordering::Acquire) == generation {
                return Ok(cached);
            }
        }

        let result = self.resolve_from_database(&host).await?;

        if self.generation.load(Ordering::Acquire) == generation {
            let now = Instant::now();
            let mut cache = self.cache.write().unwrap();
            cache.retain(|_, entry| entry.generation == generation && entry.expires_at > now);
            if cache.len() >= HOST_CACHE_MAX_ENTRIES {
                if let Some(oldest_host) = cache
                    .iter()
                    .min_by_key(|(_, entry)| entry.expires_at)
                    .map(|(host, _)| host.clone())
                {
                    cache.remove(&oldest_host);
                }
            }
            cache.insert(
                host,
                HostCacheEntry {
                    result: result.clone(),
                    expires_at: now + self.cache_ttl,
                    generation,
                },
            );
        }

        Ok(result)
    }

    /// Resolve host to project without trusted proxy checks (untrusted caller).
    pub async fn resolve_untrusted(
        &self,
        headers: &HeaderMap,
    ) -> Result<Option<HostResolutionResult>, AppError> {
        self.resolve(headers, None).await
    }

    fn cached_result(&self, host: &str, generation: u64) -> Option<Option<HostResolutionResult>> {
        self.cache
            .read()
            .unwrap()
            .get(host)
            .filter(|entry| entry.generation == generation && entry.expires_at > Instant::now())
            .map(|entry| entry.result.clone())
    }

    /// Get host from headers, honoring X-Forwarded-Host ONLY when request originates
    /// from a configured trusted proxy. Validates host syntax strictly.
    pub fn get_host(&self, headers: &HeaderMap, client_ip: Option<IpAddr>) -> Result<String, AppError> {
        // Accept X-Forwarded-Host only from configured trusted proxies
        if self.is_trusted_proxy(client_ip) {
            if let Some(forwarded_host) = headers.get("X-Forwarded-Host") {
                if let Ok(host_raw) = forwarded_host.to_str() {
                    let candidate = host_raw.split(',').next().unwrap_or("").trim();
                    if let Some(valid_host) = sanitize_and_validate_host(candidate) {
                        return Ok(valid_host);
                    }
                }
            }
        }

        // Get from Host header
        if let Some(host) = headers.get(header::HOST) {
            if let Ok(host_str) = host.to_str() {
                let candidate = host_str.split(',').next().unwrap_or("").trim();
                if let Some(valid_host) = sanitize_and_validate_host(candidate) {
                    return Ok(valid_host);
                }
            }
        }

        // Fall back to default host (sanitized)
        let bare = self
            .default_host
            .trim_start_matches("https://")
            .trim_start_matches("http://");
        let bare = bare.split(':').next().unwrap_or(bare);
        Ok(sanitize_and_validate_host(bare).unwrap_or_else(|| self.default_host.clone()))
    }

    /// Resolve host from database
    async fn resolve_from_database(
        &self,
        host: &str,
    ) -> Result<Option<HostResolutionResult>, AppError> {
        // Localhost and loopback IPs always serve the SPA dashboard
        if host == "localhost"
            || host == "127.0.0.1"
            || host == "[::1]"
            || host == "::1"
            || host == "0.0.0.0"
        {
            return Ok(None);
        }

        // Try to find domain by hostname in verified custom domains
        if let Some(domain) = DomainQueries::get_verified_by_hostname(&self.pool, host).await? {
            if let Some(deployment) =
                DeploymentQueries::get_by_id(&self.pool, &domain.deployment_id).await?
            {
                if let Some(project) =
                    ProjectQueries::get_by_id(&self.pool, &deployment.project_id).await?
                {
                    return Ok(Some(HostResolutionResult {
                        project_id: project.id,
                        deployment_id: Some(deployment.id),
                        domain_id: Some(domain.id),
                        is_custom_domain: true,
                        hostname: domain.hostname,
                    }));
                }
            }
        }

        // If no custom domain found, check if it's a subdomain of a configured canonical domain.
        if let Some(project_slug) = self.extract_subdomain(host) {
            if let Some(project) =
                ProjectQueries::get_by_slug_global(&self.pool, &project_slug).await?
            {
                return Ok(Some(HostResolutionResult {
                    project_id: project.id,
                    deployment_id: None,
                    domain_id: None,
                    is_custom_domain: false,
                    hostname: host.to_string(),
                }));
            }
        }

        Ok(None)
    }

    /// Extract project slug from subdomain of a configured canonical domain.
    ///
    /// Requires canonical origins from config. Hardcoded .cms.com/.cms.app/.cms.dev
    /// are not accepted.
    pub fn extract_subdomain(&self, host: &str) -> Option<String> {
        let host_without_port = host.strip_suffix(':').unwrap_or(host);
        let host_clean = host_without_port.split(':').next().unwrap_or(host_without_port);

        for canonical in &self.canonical_domains {
            let bare_canonical = canonical
                .trim_start_matches("https://")
                .trim_start_matches("http://");
            let bare_canonical = bare_canonical.split(':').next().unwrap_or(bare_canonical);
            if bare_canonical.is_empty() {
                continue;
            }

            // If the host is the apex canonical domain itself, it has no project subdomain
            if host_clean.eq_ignore_ascii_case(bare_canonical) {
                return None;
            }

            // Check if host ends with .<canonical>
            let suffix = format!(".{}", bare_canonical);
            if host_clean.ends_with(&suffix) {
                let prefix = &host_clean[..host_clean.len() - suffix.len()];
                if !prefix.is_empty() {
                    let slug = prefix.split('.').next().unwrap_or(prefix);
                    if !slug.is_empty() {
                        return Some(slug.to_string());
                    }
                }
            }
        }

        None
    }

    /// Clear cache
    pub fn clear_cache(&self) {
        self.cache.write().unwrap().clear();
    }

    /// Get the number of unexpired entries in the current cache generation.
    pub fn cache_size(&self) -> usize {
        let generation = self.generation.load(Ordering::Acquire);
        let now = Instant::now();
        self.cache
            .read()
            .unwrap()
            .values()
            .filter(|entry| entry.generation == generation && entry.expires_at > now)
            .count()
    }
}

/// Default host resolver with canonical origin
pub fn create_host_resolver(pool: PgPool, canonical_domain: String) -> HostResolver {
    HostResolver::new(pool, canonical_domain)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_host_syntax_validation() {
        assert_eq!(
            sanitize_and_validate_host("example.com"),
            Some("example.com".to_string())
        );
        assert_eq!(
            sanitize_and_validate_host("MY-PROJECT.example.com:8080"),
            Some("my-project.example.com".to_string())
        );
        assert_eq!(
            sanitize_and_validate_host("[::1]:3000"),
            Some("[::1]".to_string())
        );
        assert_eq!(
            sanitize_and_validate_host("127.0.0.1:3000"),
            Some("127.0.0.1".to_string())
        );
        assert_eq!(
            sanitize_and_validate_host("10.0.0.1"),
            Some("10.0.0.1".to_string())
        );

        // Path traversal / URL delimiters rejected
        assert_eq!(sanitize_and_validate_host("evil.com/path"), None);
        assert_eq!(sanitize_and_validate_host("evil.com\\path"), None);
        assert_eq!(sanitize_and_validate_host("evil.com?param=1"), None);
        assert_eq!(sanitize_and_validate_host("evil.com#hash"), None);
        assert_eq!(sanitize_and_validate_host("user@evil.com"), None);
        assert_eq!(sanitize_and_validate_host("evil.com:invalid"), None);
        assert_eq!(sanitize_and_validate_host("evil.com:0"), None);

        // Control characters / script tags rejected
        assert_eq!(sanitize_and_validate_host("<script>evil.com"), None);
        assert_eq!(sanitize_and_validate_host("evil.com\0"), None);
        assert_eq!(sanitize_and_validate_host("evil.com\r\n"), None);

        // Invalid domain labels rejected
        assert_eq!(sanitize_and_validate_host("-badlabel.com"), None);
        assert_eq!(sanitize_and_validate_host("badlabel-.com"), None);
        assert_eq!(sanitize_and_validate_host(".badlabel.com"), None);
        assert_eq!(sanitize_and_validate_host("badlabel.com."), None);
        assert_eq!(sanitize_and_validate_host("bad..label.com"), None);
        assert_eq!(sanitize_and_validate_host(""), None);
    }

    #[tokio::test]
    async fn test_trusted_proxy_forwarded_host_resolution() {
        let resolver = HostResolver::with_options(
            sqlx::PgPool::connect_lazy("postgres://user:pass@localhost/db").unwrap(),
            "fallback.example.com".to_string(),
            Arc::new(AtomicU64::new(0)),
            vec!["example.com".to_string()],
            vec!["127.0.0.1".to_string(), "10.0.0.0/8".to_string()],
        );

        let mut headers = HeaderMap::new();
        headers.insert(header::HOST, "direct.example.com".parse().unwrap());
        headers.insert("X-Forwarded-Host", "spoofed.example.com".parse().unwrap());

        // Untrusted caller IP (public internet): X-Forwarded-Host is IGNORED
        let untrusted_ip: IpAddr = "198.51.100.1".parse().unwrap();
        assert_eq!(
            resolver.get_host(&headers, Some(untrusted_ip)).unwrap(),
            "direct.example.com"
        );

        // No caller IP (None): X-Forwarded-Host is IGNORED
        assert_eq!(
            resolver.get_host(&headers, None).unwrap(),
            "direct.example.com"
        );

        // Trusted single IP (127.0.0.1): X-Forwarded-Host is ACCEPTED
        let trusted_single: IpAddr = "127.0.0.1".parse().unwrap();
        assert_eq!(
            resolver.get_host(&headers, Some(trusted_single)).unwrap(),
            "spoofed.example.com"
        );

        // Trusted CIDR range (10.1.2.3 in 10.0.0.0/8): X-Forwarded-Host is ACCEPTED
        let trusted_cidr: IpAddr = "10.1.2.3".parse().unwrap();
        assert_eq!(
            resolver.get_host(&headers, Some(trusted_cidr)).unwrap(),
            "spoofed.example.com"
        );

        // Trusted proxy sending malformed X-Forwarded-Host: rejected by validator, falls back to Host
        headers.insert("X-Forwarded-Host", "evil.com/traversal".parse().unwrap());
        assert_eq!(
            resolver.get_host(&headers, Some(trusted_single)).unwrap(),
            "direct.example.com"
        );
    }

    #[tokio::test]
    async fn test_extract_subdomain_canonical_only() {
        let resolver = HostResolver::with_options(
            sqlx::PgPool::connect_lazy("postgres://user:pass@localhost/db").unwrap(),
            "docs.mycompany.internal".to_string(),
            Arc::new(AtomicU64::new(0)),
            vec!["mycompany.internal".to_string()],
            Vec::new(),
        );

        // Configured canonical domain works
        assert_eq!(
            resolver.extract_subdomain("myproject.mycompany.internal"),
            Some("myproject".to_string())
        );

        // Apex canonical domain returns None (serves SPA dashboard)
        assert_eq!(resolver.extract_subdomain("mycompany.internal"), None);
        assert_eq!(resolver.extract_subdomain("localhost:3000"), None);

        // Hardcoded legacy domains .cms.app, .cms.com, .cms.dev are NOT accepted
        assert_eq!(resolver.extract_subdomain("myproject.cms.app"), None);
        assert_eq!(resolver.extract_subdomain("myproject.cms.com"), None);
        assert_eq!(resolver.extract_subdomain("myproject.cms.dev"), None);
    }

    #[tokio::test]
    async fn shared_generation_invalidates_positive_and_negative_cache_entries() {
        let generation = Arc::new(AtomicU64::new(7));
        let resolver = HostResolver::with_generation(
            sqlx::PgPool::connect_lazy("postgres://user:pass@localhost/db").unwrap(),
            "example.com".to_string(),
            generation.clone(),
        );
        let resolved = HostResolutionResult {
            project_id: "project-1".to_string(),
            deployment_id: Some("deployment-1".to_string()),
            domain_id: Some("domain-1".to_string()),
            is_custom_domain: true,
            hostname: "docs.example.com".to_string(),
        };
        let now = Instant::now();
        {
            let mut cache = resolver.cache.write().unwrap();
            cache.insert(
                "docs.example.com".to_string(),
                HostCacheEntry {
                    result: Some(resolved.clone()),
                    expires_at: now + Duration::from_secs(10),
                    generation: 7,
                },
            );
            cache.insert(
                "missing.example.com".to_string(),
                HostCacheEntry {
                    result: None,
                    expires_at: now + Duration::from_secs(10),
                    generation: 7,
                },
            );
        }

        assert_eq!(
            resolver.cached_result("docs.example.com", 7),
            Some(Some(resolved))
        );
        assert_eq!(resolver.cached_result("missing.example.com", 7), Some(None));
        assert_eq!(resolver.cache_size(), 2);

        generation.fetch_add(1, Ordering::AcqRel);
        assert_eq!(resolver.cached_result("docs.example.com", 8), None);
        assert_eq!(resolver.cached_result("missing.example.com", 8), None);
        assert_eq!(resolver.cache_size(), 0);
    }
}
