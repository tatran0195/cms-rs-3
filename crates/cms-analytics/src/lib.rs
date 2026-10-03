//! CMS Analytics
//!
//! This crate provides analytics storage with:
//! - Postgres as default backend (delegates to cms_db::analytics)
//! - SQLite / Embedded backend for local analytics
//! - ClickHouse as optional backend

use std::sync::Arc;

use cms_config::AnalyticsConfig;
use cms_db::PgPool;
use cms_error::AppError;

#[cfg(feature = "clickhouse")]
pub mod clickhouse;
pub mod postgres;
pub mod sqlite;
pub mod traits;

#[cfg(feature = "clickhouse")]
pub use clickhouse::ClickHouseAnalyticsStore;
pub use postgres::PostgresAnalyticsStore;
pub use sqlite::SqliteAnalyticsStore;
pub use traits::AnalyticsStore;

/// Create an AnalyticsStore implementation based on configuration.
///
/// The `pool` argument is required for the Postgres backend. Pass the
/// application's PgPool here.
pub async fn create_analytics_store(
    config: &AnalyticsConfig,
    pool: PgPool,
) -> Result<Arc<dyn AnalyticsStore>, AppError> {
    match config.backend.as_str() {
        "postgres" => {
            let store = PostgresAnalyticsStore::new(pool);
            Ok(Arc::new(store))
        }
        "sqlite" | "embedded" => {
            let store = SqliteAnalyticsStore::new(&config.sqlite_path)?;
            Ok(Arc::new(store))
        }
        "clickhouse" => {
            #[cfg(feature = "clickhouse")]
            {
                let store = ClickHouseAnalyticsStore::new(
                    config.clickhouse_host.clone().unwrap_or_default(),
                    config.clickhouse_port,
                    config.clickhouse_database.clone().unwrap_or_default(),
                    config.clickhouse_username.clone(),
                    config.clickhouse_password.clone(),
                )
                .await?;
                Ok(Arc::new(store))
            }
            #[cfg(not(feature = "clickhouse"))]
            {
                Err(AppError::Storage(
                    "ClickHouse backend requires the 'clickhouse' feature".to_string(),
                ))
            }
        }
        _ => Err(AppError::Storage(format!(
            "Unknown analytics backend: {}",
            config.backend
        ))),
    }
}
