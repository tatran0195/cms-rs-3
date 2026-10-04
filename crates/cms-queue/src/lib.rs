//! CMS Job Queue
//!
//! This crate provides a job queue with pluggable backends:
//! - In-memory (default): jobs are processed in the same process
//! - PostgreSQL: jobs are backed by Postgres transactional queues
//! - Redis (optional): jobs are processed by a separate worker process
//!
//! The queue follows the same trait pattern as storage and search,
//! allowing the default deployment to run without any external services.

use std::sync::Arc;

use cms_config::QueueConfig;
use cms_error::AppError;

pub mod in_memory;
pub mod postgres;
#[cfg(feature = "redis")]
pub mod redis;
pub mod traits;
pub mod types;

pub use in_memory::MemoryJobQueue;
pub use postgres::PostgresJobQueue;
#[cfg(feature = "redis")]
pub use redis::RedisJobQueue;
pub use traits::JobQueue;
pub use types::*;

/// Create a JobQueue implementation based on configuration
pub async fn create_job_queue(config: &QueueConfig) -> Result<Arc<dyn JobQueue>, AppError> {
    match config.backend.as_str() {
        "memory" => {
            let queue = MemoryJobQueue::new(config.workers);
            Ok(Arc::new(queue))
        }
        "postgres" => Err(AppError::InvalidInput(
            "PostgreSQL queue creation requires the initialized database pool".to_string(),
        )),
        "redis" => {
            #[cfg(feature = "redis")]
            {
                if let Some(redis_url) = &config.redis_url {
                    let queue = RedisJobQueue::new(redis_url.clone(), config.max_retries).await?;
                    Ok(Arc::new(queue))
                } else {
                    Err(AppError::Storage("Redis URL not configured".to_string()))
                }
            }
            #[cfg(not(feature = "redis"))]
            {
                Err(AppError::Storage(
                    "Redis backend requires the 'redis' feature".to_string(),
                ))
            }
        }
        _ => Err(AppError::Storage(format!(
            "Unknown queue backend: {}",
            config.backend
        ))),
    }
}

/// Create a configured queue using the application's already-migrated PostgreSQL pool.
pub async fn create_job_queue_with_pool(
    config: &QueueConfig,
    pool: cms_db::PgPool,
) -> Result<Arc<dyn JobQueue>, AppError> {
    match config.backend.as_str() {
        "postgres" => Ok(Arc::new(PostgresJobQueue::new(pool, config.max_retries))),
        _ => create_job_queue(config).await,
    }
}

/// Start job consumers for the queue
pub async fn start_consumers(queue: Arc<dyn JobQueue>) -> Result<(), AppError> {
    queue.start_consumers().await
}
