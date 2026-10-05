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

pub mod postgres;
pub mod sqlite;
pub mod traits;

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
        "clickhouse" => Err(AppError::Storage(
            "ClickHouse analytics backend is not supported; use 'postgres'".into(),
        )),
        _ => Err(AppError::Storage(format!(
            "Unknown analytics backend: {}",
            config.backend
        ))),
    }
}
