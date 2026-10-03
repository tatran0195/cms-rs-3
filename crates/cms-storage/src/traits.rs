use std::time::Duration;

use async_trait::async_trait;
use bytes::Bytes;
use cms_error::AppError;

/// Upload target for file uploads
#[derive(Debug, Clone)]
pub enum UploadTarget {
    /// S3 backend: the browser PUTs directly to this presigned URL
    Presigned(String),
    /// Local backend: the browser PUTs to this server endpoint instead
    ServerMediated(String),
}

/// Download target for file downloads
#[derive(Debug, Clone)]
pub enum DownloadTarget {
    /// S3 backend: direct download URL
    Presigned(String),
    /// Local backend: download through the server
    ServerMediated(String),
}

/// The Storage trait defines the interface for object storage
#[async_trait]
pub trait Storage: Send + Sync {
    /// Put an object into storage
    async fn put(&self, key: &str, body: Bytes, content_type: &str) -> Result<(), AppError>;

    /// Get an object from storage
    async fn get(&self, key: &str) -> Result<Bytes, AppError>;

    /// Delete an object from storage
    async fn delete(&self, key: &str) -> Result<(), AppError>;

    /// Get an upload target (presigned URL or server endpoint)
    async fn upload_target(
        &self,
        key: &str,
        expires_in: Duration,
    ) -> Result<UploadTarget, AppError>;

    /// Get a download target (presigned URL or server endpoint)
    async fn download_target(
        &self,
        key: &str,
        expires_in: Duration,
    ) -> Result<DownloadTarget, AppError>;

    /// Ensure the storage backend is ready (create buckets/directories)
    async fn ensure_ready(&self) -> Result<(), AppError>;

    /// Check if an object exists
    async fn exists(&self, key: &str) -> Result<bool, AppError>;

    /// List objects with a given prefix
    async fn list(&self, prefix: &str) -> Result<Vec<String>, AppError>;
}
