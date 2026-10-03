use serde::Deserialize;

/// Storage configuration
#[derive(Debug, Clone, Deserialize)]
pub struct StorageConfig {
    /// Storage backend type: "local" or "s3"
    #[serde(default = "default_storage_backend")]
    pub backend: String,

    /// Local storage root directory (for "local" backend)
    #[serde(default)]
    pub local_root: Option<String>,

    /// S3 endpoint URL
    #[serde(default)]
    pub s3_endpoint: Option<String>,

    /// S3 region
    #[serde(default)]
    pub s3_region: Option<String>,

    /// S3 bucket name
    #[serde(default)]
    pub s3_bucket: Option<String>,

    /// S3 access key
    #[serde(default)]
    pub s3_access_key: Option<String>,

    /// S3 secret key
    #[serde(default)]
    pub s3_secret_key: Option<String>,

    /// Whether to use path-style addressing
    #[serde(default)]
    pub s3_path_style: bool,
}

fn default_storage_backend() -> String {
    "local".to_string()
}

impl Default for StorageConfig {
    fn default() -> Self {
        Self {
            backend: default_storage_backend(),
            local_root: None,
            s3_endpoint: None,
            s3_region: None,
            s3_bucket: None,
            s3_access_key: None,
            s3_secret_key: None,
            s3_path_style: false,
        }
    }
}
