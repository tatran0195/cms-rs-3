#![allow(clippy::useless_conversion)]
#![allow(clippy::unnecessary_unwrap)]
#![allow(clippy::too_many_arguments)]

//! CMS Database Layer
//!
//! This crate provides hand-written SQLx queries organized by domain
//!
//! Each domain has its own module with query functions that return
//! either row structs from cms-entity or Result<T, AppError>.

pub mod analytics;
pub mod asset;
pub mod audit;
pub mod auth;
pub mod authz;
pub mod branch;
pub mod comment;
pub mod deployment;
pub mod domain;
pub mod export;
pub mod git;
pub mod integration;
pub mod language;
pub mod mcp;
pub mod notification;
pub mod openapi;
pub mod page;
pub mod platform_event;
pub mod project;
pub mod reader_access;
pub mod search_index;
pub mod setup;
pub mod theme;
pub mod workspace;

use cms_error::AppError;
pub use setup::SetupQueries;
pub use sqlx;
use sqlx::postgres::PgPoolOptions;
pub use workspace::WorkspaceQueries;

/// Database connection pool type
pub type PgPool = sqlx::PgPool;

/// Create a new database connection pool
pub async fn create_pool(database_url: &str) -> Result<PgPool, AppError> {
    let pool = PgPoolOptions::new()
        .max_connections(50)
        .min_connections(5)
        .acquire_timeout(std::time::Duration::from_secs(15))
        .idle_timeout(std::time::Duration::from_secs(600))
        .max_lifetime(std::time::Duration::from_secs(1800))
        .test_before_acquire(true)
        .connect(database_url)
        .await
        .map_err(|e| {
            tracing::error!("Database connection failed: {}", e);
            AppError::DatabaseConnectionFailed
        })?;

    Ok(pool)
}

pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("../../migrations");

pub fn migrator() -> &'static sqlx::migrate::Migrator {
    &MIGRATOR
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct MigrationStatusItem {
    pub version: i64,
    pub description: String,
    pub applied: bool,
    pub checksum: Option<Vec<u8>>,
}

/// Run database migrations
///
/// This uses SQLx's migration runner with embedded migrations.
pub async fn run_migrations(pool: &PgPool) -> Result<(), AppError> {
    MIGRATOR
        .run(pool)
        .await
        .map_err(|e| {
            tracing::error!("Migration failed: {}", e);
            AppError::Database(e.into())
        })?;

    Ok(())
}

/// Revert database migrations down to a specified target version, or the last applied migration
pub async fn revert_migration(pool: &PgPool, target_version: Option<i64>) -> Result<(), AppError> {
    let target = match target_version {
        Some(v) => v,
        None => {
            let status = get_migration_status(pool).await?;
            let applied: Vec<_> = status.into_iter().filter(|m| m.applied).collect();
            if applied.len() <= 1 {
                0
            } else {
                applied[applied.len() - 2].version
            }
        }
    };

    MIGRATOR
        .undo(pool, target)
        .await
        .map_err(|e| {
            tracing::error!("Migration revert failed: {}", e);
            AppError::Database(e.into())
        })?;

    Ok(())
}

/// Get the status of all embedded migrations compared against the database
pub async fn get_migration_status(pool: &PgPool) -> Result<Vec<MigrationStatusItem>, AppError> {
    let applied_versions: std::collections::HashSet<i64> = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT version FROM _sqlx_migrations
        ORDER BY version ASC
        "#,
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default()
    .into_iter()
    .collect();

    let mut items = Vec::new();
    for migration in MIGRATOR.iter() {
        let is_applied = applied_versions.contains(&migration.version);
        items.push(MigrationStatusItem {
            version: migration.version,
            description: migration.description.to_string(),
            applied: is_applied,
            checksum: Some(migration.checksum.to_vec()),
        });
    }

    Ok(items)
}

/// Test database connection
pub async fn test_connection(pool: &PgPool) -> Result<(), AppError> {
    sqlx::query("SELECT 1")
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_migrator_instance_and_status() {
        let m = migrator();
        assert!(m.iter().count() > 0, "Migrator should embed migration files");

        let Ok(url) = std::env::var("CMS_DATABASE__URL").or_else(|_| std::env::var("DATABASE_URL")) else {
            return;
        };
        if let Ok(pool) = create_pool(&url).await {
            if test_connection(&pool).await.is_err() {
                return;
            }
            let status = get_migration_status(&pool).await;
            assert!(status.is_ok(), "Getting migration status should succeed: {:?}", status.err());
            let list = status.unwrap();
            assert!(!list.is_empty(), "Should return list of migrations");
        }
    }

    #[tokio::test]
    async fn test_run_migrations() {
        let Ok(url) = std::env::var("CMS_DATABASE__URL").or_else(|_| std::env::var("DATABASE_URL"))
        else {
            return;
        };
        if let Ok(pool) = create_pool(&url).await {
            if test_connection(&pool).await.is_err() {
                return;
            }
            let res = run_migrations(&pool).await;
            assert!(res.is_ok(), "Migration should succeed: {:?}", res.err());
        }
    }

    #[tokio::test]
    async fn test_query_count() {
        let Ok(url) = std::env::var("CMS_DATABASE__URL").or_else(|_| std::env::var("DATABASE_URL"))
        else {
            return;
        };
        if let Ok(pool) = create_pool(&url).await {
            if test_connection(&pool).await.is_err() {
                return;
            }
            let res = crate::notification::NotificationQueries::count_unread_by_user(
                &pool,
                "nonexistent-user",
            )
            .await;
            assert!(
                res.is_ok(),
                "Notification count should succeed: {:?}",
                res.err()
            );

            let mem_res =
                crate::authz::ProjectMemberQueries::list_by_project(&pool, "nonexistent-project")
                    .await;
            assert!(
                mem_res.is_ok(),
                "ProjectMember list should succeed: {:?}",
                mem_res.err()
            );
        }
    }
}
