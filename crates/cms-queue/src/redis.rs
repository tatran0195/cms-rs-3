use std::time::Duration;

use async_trait::async_trait;
use chrono::Utc;
use cms_error::AppError;

use crate::{
    traits::JobQueue,
    types::{JobEnvelope, JobId, JobStatus, JobType},
};

/// Redis job queue implementation
pub struct RedisJobQueue {
    client: deadpool_redis::Pool,
    max_retries: usize,
}

impl RedisJobQueue {
    pub async fn new(redis_url: String, max_retries: usize) -> Result<Self, AppError> {
        let config = deadpool_redis::Config::from_url(redis_url);
        let pool = config
            .create_pool(Some(deadpool_redis::Runtime::Tokio1))
            .map_err(|e| AppError::Storage(e.to_string()))?;

        Ok(Self {
            client: pool,
            max_retries,
        })
    }
}

#[async_trait]
impl JobQueue for RedisJobQueue {
    async fn enqueue(&self, job: JobEnvelope) -> Result<JobId, AppError> {
        let job_id = job.id.clone();

        let mut conn = self
            .client
            .get()
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;
        let serialized = serde_json::to_string(&job)?;

        redis::cmd("LPUSH")
            .arg("cms:queue:pending")
            .arg(serialized)
            .query_async::<()>(&mut conn)
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;

        // Store job metadata
        let metadata = serde_json::json!({
            "status": "pending",
            "created_at": job.created_at.to_rfc3339(),
            "retry_count": 0,
        });

        redis::cmd("HSET")
            .arg(format!("cms:jobs:{}", job_id.0))
            .arg("metadata")
            .arg(metadata.to_string())
            .arg("payload")
            .arg(serde_json::to_string(&job.payload)?)
            .query_async::<()>(&mut conn)
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;

        Ok(job_id)
    }

    async fn enqueue_delayed(&self, job: JobEnvelope, delay: Duration) -> Result<JobId, AppError> {
        let job_id = job.id.clone();

        let mut conn = self
            .client
            .get()
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;
        let serialized = serde_json::to_string(&job)?;

        // Use Redis sorted set for delayed jobs
        let score = Utc::now().timestamp() + delay.as_secs() as i64;

        redis::cmd("ZADD")
            .arg("cms:queue:delayed")
            .arg(score)
            .arg(serialized)
            .query_async::<()>(&mut conn)
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;

        // Store job metadata
        let metadata = serde_json::json!({
            "status": "pending",
            "created_at": job.created_at.to_rfc3339(),
            "retry_count": 0,
            "delayed_until": score,
        });

        redis::cmd("HSET")
            .arg(format!("cms:jobs:{}", job_id.0))
            .arg("metadata")
            .arg(metadata.to_string())
            .arg("payload")
            .arg(serde_json::to_string(&job.payload)?)
            .query_async::<()>(&mut conn)
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;

        Ok(job_id)
    }

    async fn enqueue_repeatable(
        &self,
        _job: JobEnvelope,
        _schedule: String,
    ) -> Result<JobId, AppError> {
        // Repeatable jobs would use Redis sorted sets with recurring scores
        Err(AppError::NotFound(
            "Repeatable jobs not yet implemented for Redis backend".to_string(),
        ))
    }

    async fn consume(&self, _consumer_name: &str) -> Result<JobEnvelope, AppError> {
        let mut conn = self
            .client
            .get()
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;

        // Blocking pop from the queue: BLPOP returns Option<(String, String)> -> (key, element)
        let result: Option<(String, String)> = redis::cmd("BLPOP")
            .arg("cms:queue:pending")
            .arg(30) // 30 second timeout
            .query_async(&mut conn)
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;

        let (_, serialized) =
            result.ok_or_else(|| AppError::Storage("No jobs available".to_string()))?;

        let job: JobEnvelope = serde_json::from_str(&serialized)?;

        // Update job status to processing
        let metadata = serde_json::json!({
            "status": "processing",
            "started_at": Utc::now().to_rfc3339(),
        });

        redis::cmd("HSET")
            .arg(format!("cms:jobs:{}", job.id.0))
            .arg("metadata")
            .arg(metadata.to_string())
            .query_async::<()>(&mut conn)
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;

        Ok(job)
    }

    async fn ack(&self, job_id: &JobId) -> Result<(), AppError> {
        let mut conn = self
            .client
            .get()
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;

        let metadata = serde_json::json!({
            "status": "completed",
            "completed_at": Utc::now().to_rfc3339(),
        });

        redis::cmd("HSET")
            .arg(format!("cms:jobs:{}", job_id.0))
            .arg("metadata")
            .arg(metadata.to_string())
            .query_async::<()>(&mut conn)
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;

        // Remove from queue if still there
        redis::cmd("LREM")
            .arg("cms:queue:pending")
            .arg(0)
            .arg(job_id.0.clone())
            .query_async::<()>(&mut conn)
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;

        Ok(())
    }

    async fn nack(&self, job_id: &JobId, error_message: &str) -> Result<(), AppError> {
        let mut conn = self
            .client
            .get()
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;

        // Get current retry count
        let retry_count: Option<i32> = redis::cmd("HGET")
            .arg(format!("cms:jobs:{}", job_id.0))
            .arg("retry_count")
            .query_async(&mut conn)
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;

        let retry_count = retry_count.unwrap_or(0) + 1;

        if retry_count >= self.max_retries as i32 {
            // Max retries exceeded - mark as failed
            let metadata = serde_json::json!({
                "status": "failed",
                "error_message": error_message,
                "completed_at": Utc::now().to_rfc3339(),
                "retry_count": retry_count,
            });

            redis::cmd("HSET")
                .arg(format!("cms:jobs:{}", job_id.0))
                .arg("metadata")
                .arg(metadata.to_string())
                .query_async::<()>(&mut conn)
                .await
                .map_err(|e| AppError::Storage(e.to_string()))?;

            // Move to failed queue
            redis::cmd("LPUSH")
                .arg("cms:queue:failed")
                .arg(job_id.0.clone())
                .query_async::<()>(&mut conn)
                .await
                .map_err(|e| AppError::Storage(e.to_string()))?;
        } else {
            // Re-queue
            let metadata = serde_json::json!({
                "status": "retrying",
                "retry_count": retry_count,
            });

            redis::cmd("HSET")
                .arg(format!("cms:jobs:{}", job_id.0))
                .arg("metadata")
                .arg(metadata.to_string())
                .query_async::<()>(&mut conn)
                .await
                .map_err(|e| AppError::Storage(e.to_string()))?;

            redis::cmd("LPUSH")
                .arg("cms:queue:pending")
                .arg(job_id.0.clone())
                .query_async::<()>(&mut conn)
                .await
                .map_err(|e| AppError::Storage(e.to_string()))?;
        }

        Ok(())
    }

    async fn get_job(&self, job_id: JobId) -> Result<Option<JobEnvelope>, AppError> {
        let mut conn = self
            .client
            .get()
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;

        let metadata: Option<String> = redis::cmd("HGET")
            .arg(format!("cms:jobs:{}", job_id.0))
            .arg("metadata")
            .query_async(&mut conn)
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;

        let payload: Option<String> = redis::cmd("HGET")
            .arg(format!("cms:jobs:{}", job_id.0))
            .arg("payload")
            .query_async(&mut conn)
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;

        if let (Some(metadata), Some(payload)) = (metadata, payload) {
            let metadata: serde_json::Value = serde_json::from_str(&metadata)?;
            let payload: serde_json::Value = serde_json::from_str(&payload)?;

            // Note: This is a simplified reconstruction
            // In a real implementation, we'd store the full job envelope
            Ok(Some(JobEnvelope {
                id: job_id,
                job_type: JobType::Analytics, // Would need to store this
                payload,
                status: serde_json::from_value(
                    metadata.get("status").cloned().unwrap_or_default(),
                )?,
                created_at: chrono::DateTime::parse_from_rfc3339(
                    metadata
                        .get("created_at")
                        .and_then(|v| v.as_str())
                        .unwrap_or(""),
                )
                .map(|d| d.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
                started_at: metadata
                    .get("started_at")
                    .and_then(|v| v.as_str())
                    .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                    .map(|d| d.with_timezone(&Utc)),
                completed_at: metadata
                    .get("completed_at")
                    .and_then(|v| v.as_str())
                    .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                    .map(|d| d.with_timezone(&Utc)),
                error_message: metadata
                    .get("error_message")
                    .and_then(|v| v.as_str())
                    .map(String::from),
                retry_count: metadata
                    .get("retry_count")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0) as u32,
            }))
        } else {
            Ok(None)
        }
    }

    async fn list_jobs(
        &self,
        _status: Option<JobStatus>,
        _job_type: Option<JobType>,
        _limit: Option<usize>,
        _offset: Option<usize>,
    ) -> Result<Vec<JobEnvelope>, AppError> {
        // This would scan the Redis keys
        // For now, return empty
        Err(AppError::NotFound(
            "List jobs not yet implemented for Redis backend".to_string(),
        ))
    }

    async fn retry_job(&self, job_id: JobId) -> Result<(), AppError> {
        // Reset retry count and re-queue
        let mut conn = self
            .client
            .get()
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;

        let metadata = serde_json::json!({
            "status": "pending",
            "retry_count": 0,
        });

        redis::cmd("HSET")
            .arg(format!("cms:jobs:{}", job_id.0))
            .arg("metadata")
            .arg(metadata.to_string())
            .query_async::<()>(&mut conn)
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;

        redis::cmd("LPUSH")
            .arg("cms:queue:pending")
            .arg(job_id.0.clone())
            .query_async::<()>(&mut conn)
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;

        Ok(())
    }

    async fn delete_job(&self, job_id: JobId) -> Result<bool, AppError> {
        let mut conn = self
            .client
            .get()
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;

        let deleted: i32 = redis::cmd("DEL")
            .arg(format!("cms:jobs:{}", job_id.0))
            .query_async(&mut conn)
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;

        Ok(deleted > 0)
    }

    async fn start_consumers(&self) -> Result<(), AppError> {
        // For Redis, consumers are separate processes
        // This is a no-op for the in-process queue
        Ok(())
    }
}
