use serde::Deserialize;

/// Database configuration
#[derive(Debug, Clone, Deserialize)]
pub struct DatabaseConfig {
    /// PostgreSQL connection URL
    #[serde(default = "default_database_url")]
    pub url: String,

    /// Maximum pool size
    #[serde(default = "default_max_pool_size")]
    pub max_pool_size: u32,

    /// Connection timeout in seconds
    #[serde(default = "default_conn_timeout")]
    pub connection_timeout: u64,

    /// Whether to enable SSL
    #[serde(default)]
    pub ssl: bool,
}

fn default_database_url() -> String {
    "postgres://postgres:postgres@localhost:5432/cms".to_string()
}
fn default_max_pool_size() -> u32 {
    20
}
fn default_conn_timeout() -> u64 {
    30
}

impl Default for DatabaseConfig {
    fn default() -> Self {
        Self {
            url: default_database_url(),
            max_pool_size: default_max_pool_size(),
            connection_timeout: default_conn_timeout(),
            ssl: false,
        }
    }
}
