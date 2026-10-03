use std::time::Duration;

use async_trait::async_trait;
use bytes::Bytes;
use cms_error::AppError;

use crate::traits::{DownloadTarget, Storage, UploadTarget};

/// S3 storage implementation
pub struct S3Storage {
    client: aws_sdk_s3::Client,
    bucket: String,
    use_path_style: bool,
    endpoint: String,
}

impl S3Storage {
    /// Create a new S3Storage instance
    pub async fn new(
        endpoint: String,
        bucket: String,
        access_key: String,
        secret_key: String,
        region: String,
        use_path_style: bool,
    ) -> Self {
        use aws_config::BehaviorVersion;

        let config = aws_config::defaults(BehaviorVersion::latest())
            .endpoint_url(endpoint.clone())
            .region(aws_config::Region::new(region.clone()))
            .load()
            .await;

        // Override credentials if provided
        let config = if !access_key.is_empty() && !secret_key.is_empty() {
            aws_config::defaults(BehaviorVersion::latest())
                .endpoint_url(endpoint.clone())
                .region(aws_config::Region::new(region))
                .credentials_provider(aws_credential_types::Credentials::new(
                    &access_key,
                    &secret_key,
                    None,
                    None,
                    "loaded-from-config",
                ))
                .load()
                .await
        } else {
            config
        };

        let client = aws_sdk_s3::Client::new(&config);
        let host = endpoint.replace("http://", "").replace("https://", "");

        Self {
            client,
            bucket,
            use_path_style,
            endpoint: host,
        }
    }

    /// Get the S3 key from a storage key
    fn get_s3_key(&self, key: &str) -> String {
        // Remove leading slash if present
        key.trim_start_matches('/').to_string()
    }

    /// Get the public URL for an object
    pub fn get_public_url(&self, key: &str) -> String {
        let s3_key = self.get_s3_key(key);
        if self.use_path_style {
            format!("https://{}/{}/{}", self.endpoint, self.bucket, s3_key)
        } else {
            format!("https://{}.{}/{}", self.bucket, self.endpoint, s3_key)
        }
    }
}

#[async_trait]
impl Storage for S3Storage {
    async fn put(&self, key: &str, body: Bytes, content_type: &str) -> Result<(), AppError> {
        let s3_key = self.get_s3_key(key);

        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(&s3_key)
            .body(body.into())
            .content_type(content_type)
            .send()
            .await
            .map_err(|e| AppError::Storage(format!("S3 put failed: {}", e)))?;

        Ok(())
    }

    async fn get(&self, key: &str) -> Result<Bytes, AppError> {
        let s3_key = self.get_s3_key(key);

        let response = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(&s3_key)
            .send()
            .await
            .map_err(|e| {
                if e.to_string().contains("NoSuchKey") {
                    AppError::ObjectNotFound(key.to_string())
                } else {
                    AppError::Storage(format!("S3 get failed: {}", e))
                }
            })?;

        let bytes = response
            .body
            .collect()
            .await
            .map_err(|e| AppError::Storage(format!("Failed to collect S3 response: {}", e)))?
            .into_bytes();

        Ok(bytes)
    }

    async fn delete(&self, key: &str) -> Result<(), AppError> {
        let s3_key = self.get_s3_key(key);

        match self
            .client
            .delete_object()
            .bucket(&self.bucket)
            .key(&s3_key)
            .send()
            .await
        {
            Ok(_) => Ok(()),
            Err(e) => {
                if e.to_string().contains("NoSuchKey") {
                    Ok(())
                } else {
                    Err(AppError::Storage(format!("S3 delete failed: {}", e)))
                }
            }
        }
    }

    async fn upload_target(
        &self,
        key: &str,
        expires_in: Duration,
    ) -> Result<UploadTarget, AppError> {
        let s3_key = self.get_s3_key(key);

        let presigning_config = aws_sdk_s3::presigning::PresigningConfig::expires_in(expires_in)
            .map_err(|e| AppError::Storage(format!("Invalid expires_in: {}", e)))?;

        let response = self
            .client
            .put_object()
            .bucket(&self.bucket)
            .key(&s3_key)
            .presigned(presigning_config)
            .await
            .map_err(|e| AppError::Storage(format!("Failed to create presigned URL: {}", e)))?;

        Ok(UploadTarget::Presigned(response.uri().to_string()))
    }

    async fn download_target(
        &self,
        key: &str,
        expires_in: Duration,
    ) -> Result<DownloadTarget, AppError> {
        let s3_key = self.get_s3_key(key);

        let presigning_config = aws_sdk_s3::presigning::PresigningConfig::expires_in(expires_in)
            .map_err(|e| AppError::Storage(format!("Invalid expires_in: {}", e)))?;

        let response = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(&s3_key)
            .presigned(presigning_config)
            .await
            .map_err(|e| AppError::Storage(format!("Failed to create presigned URL: {}", e)))?;

        Ok(DownloadTarget::Presigned(response.uri().to_string()))
    }

    async fn ensure_ready(&self) -> Result<(), AppError> {
        // Check if bucket exists, create if not
        match self.client.head_bucket().bucket(&self.bucket).send().await {
            Ok(_) => Ok(()),
            Err(e) => {
                if e.to_string().contains("NotFound") || e.to_string().contains("NoSuchBucket") {
                    self.client
                        .create_bucket()
                        .bucket(&self.bucket)
                        .send()
                        .await
                        .map_err(|e| {
                            AppError::Storage(format!("Failed to create bucket: {}", e))
                        })?;
                    Ok(())
                } else {
                    Err(AppError::Storage(format!("Bucket check failed: {}", e)))
                }
            }
        }
    }

    async fn exists(&self, key: &str) -> Result<bool, AppError> {
        let s3_key = self.get_s3_key(key);

        match self
            .client
            .head_object()
            .bucket(&self.bucket)
            .key(&s3_key)
            .send()
            .await
        {
            Ok(_) => Ok(true),
            Err(e) if e.to_string().contains("NotFound") || e.to_string().contains("NoSuchKey") => {
                Ok(false)
            }
            Err(e) => Err(AppError::Storage(format!("Head object failed: {}", e))),
        }
    }

    async fn list(&self, prefix: &str) -> Result<Vec<String>, AppError> {
        let response = self
            .client
            .list_objects_v2()
            .bucket(&self.bucket)
            .prefix(prefix)
            .send()
            .await
            .map_err(|e| AppError::Storage(format!("List objects failed: {}", e)))?;

        let keys = response
            .contents()
            .iter()
            .map(|obj| obj.key().unwrap_or_default().to_string())
            .collect();

        Ok(keys)
    }
}
