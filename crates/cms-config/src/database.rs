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

    /// Whether to automatically run database migrations on server startup
    #[serde(default = "default_true")]
    pub auto_migrate: bool,
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
fn default_true() -> bool {
    true
}

impl Default for DatabaseConfig {
    fn default() -> Self {
        Self {
            url: default_database_url(),
            max_pool_size: default_max_pool_size(),
            connection_timeout: default_conn_timeout(),
            ssl: false,
            auto_migrate: true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_database_config_default_auto_migrate() {
        let db_config = DatabaseConfig::default();
        assert!(db_config.auto_migrate, "auto_migrate should default to true");
    }
}

