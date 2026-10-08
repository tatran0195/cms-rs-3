use serde::Deserialize;

/// Authentication configuration
#[derive(Debug, Clone, Deserialize)]
pub struct AuthConfig {
    /// Session secret key
    #[serde(default = "default_session_secret")]
    pub session_secret: String,

    /// Session expiration in hours
    #[serde(default = "default_session_expiration")]
    pub session_expiration_hours: i64,

    /// JWT secret for reader tokens
    #[serde(default = "default_jwt_secret")]
    pub jwt_secret: String,

    /// JWT expiration in hours
    #[serde(default = "default_jwt_expiration")]
    pub jwt_expiration_hours: i64,

    /// API key prefix for hashing
    #[serde(default = "default_api_key_prefix")]
    pub api_key_prefix: String,

    /// Operator accounts allowed to use platform-wide admin APIs (comma-separated
    /// through environment configuration, or an array in TOML).
    #[serde(default)]
    pub system_admin_emails: Vec<String>,

    /// Whether session cookies require HTTPS (Secure attribute).
    #[serde(default = "default_session_cookie_secure")]
    pub session_cookie_secure: bool,

    /// SameSite policy for session cookies ("Lax", "Strict", or "None").
    #[serde(default = "default_session_cookie_same_site")]
    pub session_cookie_same_site: String,

    /// OAuth providers configuration
    #[serde(default)]
    pub oauth: Option<OAuthConfig>,
}

fn default_session_secret() -> String {
    "dev_session_secret_change_in_production".to_string()
}
fn default_jwt_secret() -> String {
    "dev_jwt_secret_change_in_production".to_string()
}
fn default_session_expiration() -> i64 {
    24 * 7
} // 7 days
fn default_jwt_expiration() -> i64 {
    24 * 30
} // 30 days
fn default_api_key_prefix() -> String {
    "cms_api_key".to_string()
}
fn default_session_cookie_secure() -> bool {
    false
}
fn default_session_cookie_same_site() -> String {
    "Lax".to_string()
}

impl Default for AuthConfig {
    fn default() -> Self {
        Self {
            session_secret: default_session_secret(),
            session_expiration_hours: default_session_expiration(),
            jwt_secret: default_jwt_secret(),
            jwt_expiration_hours: default_jwt_expiration(),
            api_key_prefix: default_api_key_prefix(),
            system_admin_emails: Vec::new(),
            session_cookie_secure: default_session_cookie_secure(),
            session_cookie_same_site: default_session_cookie_same_site(),
            oauth: None,
        }
    }
}

impl AuthConfig {
    /// Check whether session cookies should have the Secure flag.
    pub fn is_cookie_secure(&self, is_production: bool, https: bool) -> bool {
        self.session_cookie_secure || is_production || https
    }

    /// Build a Set-Cookie header value string for the session token.
    pub fn session_cookie_value(
        &self,
        token: &str,
        max_age_secs: i64,
        is_production: bool,
        https: bool,
    ) -> String {
        let secure_suffix = if self.is_cookie_secure(is_production, https) {
            "; Secure"
        } else {
            ""
        };
        let same_site = match self.session_cookie_same_site.to_lowercase().as_str() {
            "strict" => "Strict",
            "none" => "None",
            _ => "Lax",
        };
        format!(
            "{SESSION_COOKIE_NAME}={token}; Path=/; HttpOnly; \
             SameSite={same_site}{secure_suffix}; Max-Age={max_age_secs}"
        )
    }

    /// Build a Set-Cookie header value string to clear the session cookie.
    pub fn clear_session_cookie_value(&self, is_production: bool, https: bool) -> String {
        let secure_suffix = if self.is_cookie_secure(is_production, https) {
            "; Secure"
        } else {
            ""
        };
        let same_site = match self.session_cookie_same_site.to_lowercase().as_str() {
            "strict" => "Strict",
            "none" => "None",
            _ => "Lax",
        };
        format!(
            "{SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; \
             SameSite={same_site}{secure_suffix}"
        )
    }
}

pub const SESSION_COOKIE_NAME: &str = "cms_session";

/// OAuth configuration
#[derive(Debug, Clone, Deserialize)]
pub struct OAuthConfig {
    /// GitHub OAuth configuration
    #[serde(default)]
    pub github: Option<OAuthProviderConfig>,

    /// Google OAuth configuration
    #[serde(default)]
    pub google: Option<OAuthProviderConfig>,
}

/// OAuth provider configuration
#[derive(Debug, Clone, Deserialize)]
pub struct OAuthProviderConfig {
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_auth_config_defaults() {
        let auth = AuthConfig::default();
        assert_eq!(
            auth.session_secret,
            "dev_session_secret_change_in_production"
        );
        assert_eq!(auth.jwt_secret, "dev_jwt_secret_change_in_production");
        assert_eq!(auth.session_cookie_same_site, "Lax");
        assert!(!auth.session_cookie_secure);
    }

    #[test]
    fn test_session_cookie_name_is_cms_session() {
        assert_eq!(SESSION_COOKIE_NAME, "cms_session");
    }

    #[test]
    fn test_session_cookie_value_formatting() {
        let mut auth = AuthConfig::default();
        // Dev mode without secure:
        let cookie = auth.session_cookie_value("test-token", 3600, false, false);
        assert_eq!(
            cookie,
            "cms_session=test-token; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600"
        );

        // Production mode automatically enables Secure:
        let prod_cookie = auth.session_cookie_value("test-token", 3600, true, false);
        assert_eq!(
            prod_cookie,
            "cms_session=test-token; Path=/; HttpOnly; SameSite=Lax; Secure; \
             Max-Age=3600"
        );

        // Explicit Strict SameSite:
        auth.session_cookie_same_site = "Strict".to_string();
        auth.session_cookie_secure = true;
        let strict_cookie = auth.session_cookie_value("test-token", 3600, false, false);
        assert_eq!(
            strict_cookie,
            "cms_session=test-token; Path=/; HttpOnly; SameSite=Strict; Secure; \
             Max-Age=3600"
        );

        // Clear session cookie:
        let clear_cookie = auth.clear_session_cookie_value(true, false);
        assert_eq!(
            clear_cookie,
            "cms_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict; Secure"
        );
    }
}
