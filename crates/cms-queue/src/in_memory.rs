use std::{sync::Arc, time::Duration};

use async_trait::async_trait;
use chrono::Utc;
use cms_error::AppError;

use crate::{
    traits::JobQueue,
    types::{JobEnvelope, JobId, JobStatus, JobType},
};

/// In-memory job queue implementation
pub struct MemoryJobQueue {
    sender: tokio::sync::mpsc::Sender<JobEnvelope>,
    receiver: Arc<tokio::sync::Mutex<tokio::sync::mpsc::Receiver<JobEnvelope>>>,
    jobs: Arc<tokio::sync::Mutex<std::collections::HashMap<JobId, JobEnvelope>>>,
    num_workers: usize,
}

impl MemoryJobQueue {
    pub fn new(num_workers: usize) -> Self {
        let (sender, receiver) = tokio::sync::mpsc::channel::<JobEnvelope>(1000);

        Self {
            sender,
            receiver: Arc::new(tokio::sync::Mutex::new(receiver)),
            jobs: Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new())),
            num_workers,
        }
    }

    /// In-memory test fake: do not mark complete without executing a handler.
    /// Handlers or test callers must explicitly acknowledge or reject via ack/nack.
    pub async fn process_job(&self, job: JobEnvelope) -> Result<(), AppError> {
        let mut jobs = self.jobs.lock().await;
        if let Some(existing) = jobs.get_mut(&job.id) {
            existing.status = JobStatus::Processing;
            existing.started_at = Some(Utc::now());
        }
        Ok(())
    }
}

#[async_trait]
impl JobQueue for MemoryJobQueue {
    async fn enqueue(&self, job: JobEnvelope) -> Result<JobId, AppError> {
        let job_id = job.id.clone();

        // Store the job
        let mut jobs = self.jobs.lock().await;
        jobs.insert(job_id.clone(), job.clone());

        // Send to channel
        self.sender
            .send(job)
            .await
            .map_err(|e| AppError::Storage(format!("Failed to enqueue job: {}", e)))?;

        Ok(job_id)
    }

    async fn enqueue_delayed(&self, job: JobEnvelope, delay: Duration) -> Result<JobId, AppError> {
        let job_id = job.id.clone();

        // Store the job
        let mut jobs = self.jobs.lock().await;
        jobs.insert(job_id.clone(), job.clone());

        // Spawn a task to send after delay
        let sender = self.sender.clone();
        tokio::spawn(async move {
            tokio::time::sleep(delay).await;
            sender.send(job).await.ok();
        });

        Ok(job_id)
    }

    async fn enqueue_repeatable(
        &self,
        job: JobEnvelope,
        _schedule: String,
    ) -> Result<JobId, AppError> {
        // For in-memory, repeatable jobs are treated as one-time
        self.enqueue(job).await
    }

    async fn consume(&self, _consumer_name: &str) -> Result<JobEnvelope, AppError> {
        let mut receiver = self.receiver.lock().await;

        let mut job = receiver
            .recv()
            .await
            .ok_or_else(|| AppError::Storage("No jobs available".to_string()))?;

        let mut jobs = self.jobs.lock().await;
        if let Some(existing) = jobs.get_mut(&job.id) {
            existing.status = JobStatus::Processing;
            existing.started_at = Some(Utc::now());
            job = existing.clone();
        }

        Ok(job)
    }

    async fn ack(&self, job_id: &JobId) -> Result<(), AppError> {
        let mut jobs = self.jobs.lock().await;
        if let Some(job) = jobs.get_mut(job_id) {
            job.status = JobStatus::Completed;
            job.completed_at = Some(Utc::now());
        }
        Ok(())
    }

    async fn nack(&self, job_id: &JobId, error_message: &str) -> Result<(), AppError> {
        let mut jobs = self.jobs.lock().await;
        if let Some(job) = jobs.get_mut(job_id) {
            job.status = JobStatus::Failed;
            job.error_message = Some(error_message.to_string());
            job.completed_at = Some(Utc::now());
        }
        Ok(())
    }

    async fn get_job(&self, job_id: JobId) -> Result<Option<JobEnvelope>, AppError> {
        let jobs = self.jobs.lock().await;
        Ok(jobs.get(&job_id).cloned())
    }

    async fn list_jobs(
        &self,
        status: Option<JobStatus>,
        job_type: Option<JobType>,
        limit: Option<usize>,
        offset: Option<usize>,
    ) -> Result<Vec<JobEnvelope>, AppError> {
        let jobs = self.jobs.lock().await;

        let mut result: Vec<JobEnvelope> = jobs.values().cloned().collect();

        // Apply filters
        if let Some(status) = status {
            result.retain(|j| j.status == status);
        }
        if let Some(job_type) = job_type {
            result.retain(|j| j.job_type == job_type);
        }

        // Apply pagination
        let limit = limit.unwrap_or(100);
        let offset = offset.unwrap_or(0);

        result = result.into_iter().skip(offset).take(limit).collect();

        Ok(result)
    }

    async fn retry_job(&self, job_id: JobId) -> Result<(), AppError> {
        let mut jobs = self.jobs.lock().await;
        if let Some(job) = jobs.get_mut(&job_id) {
            job.status = JobStatus::Pending;
            job.retry_count += 1;
            job.started_at = None;
            job.completed_at = None;
            job.error_message = None;

            // Re-queue
            let sender = self.sender.clone();
            let job_clone = job.clone();
            tokio::spawn(async move {
                sender.send(job_clone).await.ok();
            });
        }
        Ok(())
    }

    async fn delete_job(&self, job_id: JobId) -> Result<bool, AppError> {
        let mut jobs = self.jobs.lock().await;
        Ok(jobs.remove(&job_id).is_some())
    }

    async fn start_consumers(&self) -> Result<(), AppError> {
        // In-memory test fake: job processing loop is driven by cms-worker or test harnesses
        // calling consume() and ack()/nack(). Do not automatically mark jobs completed.
        Ok(())
    }
}

impl Clone for MemoryJobQueue {
    fn clone(&self) -> Self {
        Self {
            sender: self.sender.clone(),
            receiver: self.receiver.clone(),
            jobs: self.jobs.clone(),
            num_workers: self.num_workers,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_memory_queue_enqueue_and_consume() {
        let queue = MemoryJobQueue::new(1);
        let queue = Arc::new(queue);

        let job = JobEnvelope::new(JobType::Analytics, serde_json::json!({}));
        let job_id = queue.enqueue(job.clone()).await.unwrap();

        assert_eq!(job_id, job.id);

        let consumed = queue.consume("test-worker").await.unwrap();
        assert_eq!(consumed.id, job_id);
        assert_eq!(consumed.status, JobStatus::Processing);

        queue.ack(&consumed.id).await.unwrap();

        let retrieved = queue.get_job(job_id).await.unwrap();
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().status, JobStatus::Completed);
    }

    #[tokio::test]
    async fn test_memory_queue_nack_marks_failed() {
        let queue = MemoryJobQueue::new(1);
        let queue = Arc::new(queue);

        let job = JobEnvelope::new(JobType::Analytics, serde_json::json!({}));
        let job_id = queue.enqueue(job.clone()).await.unwrap();

        let consumed = queue.consume("test-worker").await.unwrap();
        queue.nack(&consumed.id, "synthetic failure").await.unwrap();

        let dead_letters = queue.list_dead_letter_jobs(None, None).await.unwrap();
        assert_eq!(dead_letters.len(), 1);
        assert_eq!(dead_letters[0].id, job_id);
        assert_eq!(dead_letters[0].status, JobStatus::Failed);
        assert_eq!(
            dead_letters[0].error_message.as_deref(),
            Some("synthetic failure")
        );
    }

    #[tokio::test]
    async fn test_memory_queue_list_jobs() {
        let queue = MemoryJobQueue::new(1);
        let queue = Arc::new(queue);

        // Enqueue multiple jobs
        for i in 0..5 {
            let job = JobEnvelope::new(JobType::Analytics, serde_json::json!({ "index": i }));
            queue.enqueue(job).await.unwrap();
        }

        let jobs = queue.list_jobs(None, None, None, None).await.unwrap();
        assert_eq!(jobs.len(), 5);
    }
}
