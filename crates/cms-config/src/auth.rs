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

impl Default for AuthConfig {
    fn default() -> Self {
        Self {
            session_secret: default_session_secret(),
            session_expiration_hours: default_session_expiration(),
            jwt_secret: default_jwt_secret(),
            jwt_expiration_hours: default_jwt_expiration(),
            api_key_prefix: default_api_key_prefix(),
            system_admin_emails: Vec::new(),
            oauth: None,
        }
    }
}

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
