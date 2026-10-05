use std::time::Duration;

use async_trait::async_trait;
use cms_error::AppError;

use crate::types::{JobEnvelope, JobId, JobStatus, JobType};

/// The JobQueue trait defines the interface for job queues
#[async_trait]
pub trait JobQueue: Send + Sync {
    /// Enqueue a job for immediate processing
    async fn enqueue(&self, job: JobEnvelope) -> Result<JobId, AppError>;

    /// Enqueue a job with a delay
    async fn enqueue_delayed(&self, job: JobEnvelope, delay: Duration) -> Result<JobId, AppError>;

    /// Enqueue a repeatable job (cron-like)
    async fn enqueue_repeatable(
        &self,
        job: JobEnvelope,
        schedule: String,
    ) -> Result<JobId, AppError>;

    /// Consume the next job (for worker)
    async fn consume(&self, consumer_name: &str) -> Result<JobEnvelope, AppError>;

    /// Acknowledge a job as completed
    async fn ack(&self, job_id: &JobId) -> Result<(), AppError>;

    /// Negative acknowledge (job failed, may be retried)
    async fn nack(&self, job_id: &JobId, error_message: &str) -> Result<(), AppError>;

    /// Get a job by ID
    async fn get_job(&self, job_id: JobId) -> Result<Option<JobEnvelope>, AppError>;

    /// List jobs with optional filters
    async fn list_jobs(
        &self,
        status: Option<JobStatus>,
        job_type: Option<JobType>,
        limit: Option<usize>,
        offset: Option<usize>,
    ) -> Result<Vec<JobEnvelope>, AppError>;

    /// Retry a failed job
    async fn retry_job(&self, job_id: JobId) -> Result<(), AppError>;

    /// Delete a job
    async fn delete_job(&self, job_id: JobId) -> Result<bool, AppError>;

    /// Start job consumers (for in-memory backend)
    async fn start_consumers(&self) -> Result<(), AppError>;

    /// List dead-letter (failed) jobs for observability and operator inspection
    async fn list_dead_letter_jobs(
        &self,
        limit: Option<usize>,
        offset: Option<usize>,
    ) -> Result<Vec<JobEnvelope>, AppError> {
        self.list_jobs(Some(JobStatus::Failed), None, limit, offset)
            .await
    }
}
