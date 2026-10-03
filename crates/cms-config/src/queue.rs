use serde::Deserialize;

/// Queue configuration
#[derive(Debug, Clone, Deserialize)]
pub struct QueueConfig {
    /// Queue backend: "memory" or "redis"
    #[serde(default = "default_queue_backend")]
    pub backend: String,

    /// Redis URL (for "redis" backend)
    #[serde(default)]
    pub redis_url: Option<String>,

    /// Number of worker threads for in-memory queue
    #[serde(default = "default_queue_workers")]
    pub workers: usize,

    /// Maximum retry attempts
    #[serde(default = "default_max_retries")]
    pub max_retries: usize,
}

fn default_queue_backend() -> String {
    "postgres".to_string()
}
fn default_queue_workers() -> usize {
    4
}
fn default_max_retries() -> usize {
    3
}

impl Default for QueueConfig {
    fn default() -> Self {
        Self {
            backend: default_queue_backend(),
            redis_url: None,
            workers: default_queue_workers(),
            max_retries: default_max_retries(),
        }
    }
}
