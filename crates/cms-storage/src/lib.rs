//! CMS Storage
//!
//! This crate provides a Storage trait with two implementations:
//! - LocalFsStorage (default): stores files on the local filesystem
//! - S3Storage (optional): stores files on S3-compatible storage
//!
//! The trait is designed so that cms-biz can be tested against a fake
//! implementation without a live storage backend.

use cms_config::StorageConfig;
use cms_error::AppError;

pub mod local;
#[cfg(feature = "s3")]
pub mod s3;
pub mod traits;

pub use local::LocalFsStorage;
#[cfg(feature = "s3")]
pub use s3::S3Storage;
pub use traits::{DownloadTarget, Storage, UploadTarget};

/// Create a Storage implementation based on configuration
pub async fn create_storage(config: &StorageConfig) -> Result<Box<dyn Storage>, AppError> {
    match config.backend.as_str() {
        "local" => {
            let root_dir = config.local_root.as_deref().unwrap_or("./storage");
            Ok(Box::new(LocalFsStorage::new(root_dir.to_string())))
        }
        "s3" => {
            #[cfg(feature = "s3")]
            {
                if let (Some(endpoint), Some(bucket), Some(access_key), Some(secret_key)) = (
                    &config.s3_endpoint,
                    &config.s3_bucket,
                    &config.s3_access_key,
                    &config.s3_secret_key,
                ) {
                    Ok(Box::new(
                        S3Storage::new(
                            endpoint.clone(),
                            bucket.clone(),
                            access_key.clone(),
                            secret_key.clone(),
                            config.s3_region.clone().unwrap_or_default(),
                            config.s3_path_style,
                        )
                        .await,
                    ))
                } else {
                    Err(AppError::StorageNotConfigured)
                }
            }
            #[cfg(not(feature = "s3"))]
            {
                Err(AppError::Storage(
                    "S3 backend requires the 's3' feature to be enabled".to_string(),
                ))
            }
        }
        _ => Err(AppError::Storage(format!(
            "Unknown storage backend: {}",
            config.backend
        ))),
    }
}
