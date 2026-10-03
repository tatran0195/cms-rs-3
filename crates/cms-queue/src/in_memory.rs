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

    async fn process_job(&self, job: JobEnvelope) -> Result<(), AppError> {
        // In a real implementation, this would call the appropriate handler
        // based on job.job_type

        // For now, just mark as completed
        let mut jobs = self.jobs.lock().await;
        if let Some(existing) = jobs.get_mut(&job.id) {
            existing.status = JobStatus::Completed;
            existing.completed_at = Some(Utc::now());
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

        receiver
            .recv()
            .await
            .ok_or_else(|| AppError::Storage("No jobs available".to_string()))
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
        for i in 0..self.num_workers {
            let queue = Arc::new(self.clone());
            let consumer_name = format!("worker-{}", i);

            tokio::spawn(async move {
                loop {
                    match queue.consume(&consumer_name).await {
                        Ok(job) => {
                            if let Err(e) = queue.process_job(job).await {
                                tracing::error!("Error processing job: {}", e);
                            }
                            // Auto-ack for now
                            // In a real implementation, we'd have proper ack/nack
                        }
                        Err(e) => {
                            if e.to_string() != "No jobs available" {
                                tracing::error!("Error consuming job: {}", e);
                            }
                            tokio::time::sleep(Duration::from_secs(1)).await;
                        }
                    }
                }
            });
        }

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

        // Give the consumer time to process
        tokio::time::sleep(Duration::from_millis(10)).await;

        // Get the job
        let retrieved = queue.get_job(job_id).await.unwrap();
        assert!(retrieved.is_some());
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
