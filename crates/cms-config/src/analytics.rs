use serde::Deserialize;

/// Analytics configuration
#[derive(Debug, Clone, Deserialize)]
pub struct AnalyticsConfig {
    /// Analytics backend: "postgres", "sqlite", "embedded", or "clickhouse"
    #[serde(default = "default_analytics_backend")]
    pub backend: String,

    /// Embedded SQLite database path (for "sqlite" / "embedded" backend)
    #[serde(default = "default_sqlite_path")]
    pub sqlite_path: String,

    /// ClickHouse host
    #[serde(default)]
    pub clickhouse_host: Option<String>,

    /// ClickHouse port
    #[serde(default = "default_clickhouse_port")]
    pub clickhouse_port: u16,

    /// ClickHouse database
    #[serde(default)]
    pub clickhouse_database: Option<String>,

    /// ClickHouse username
    #[serde(default)]
    pub clickhouse_username: Option<String>,

    /// ClickHouse password
    #[serde(default)]
    pub clickhouse_password: Option<String>,
}

fn default_analytics_backend() -> String {
    "postgres".to_string()
}
fn default_sqlite_path() -> String {
    "data/analytics.db".to_string()
}
fn default_clickhouse_port() -> u16 {
    8123
}

impl Default for AnalyticsConfig {
    fn default() -> Self {
        Self {
            backend: default_analytics_backend(),
            sqlite_path: default_sqlite_path(),
            clickhouse_host: None,
            clickhouse_port: default_clickhouse_port(),
            clickhouse_database: None,
            clickhouse_username: None,
            clickhouse_password: None,
        }
    }
}
