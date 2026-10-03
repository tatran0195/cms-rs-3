use serde::Deserialize;

/// Search configuration
#[derive(Debug, Clone, Deserialize)]
pub struct SearchConfig {
    /// Vector store backend: "pgvector" or "qdrant"
    #[serde(default = "default_search_backend")]
    pub backend: String,

    /// PostgreSQL connection URL for pgvector
    #[serde(default)]
    pub pgvector_url: Option<String>,

    /// Qdrant host
    #[serde(default)]
    pub qdrant_host: Option<String>,

    /// Qdrant port
    #[serde(default = "default_qdrant_port")]
    pub qdrant_port: u16,

    /// Qdrant API key
    #[serde(default)]
    pub qdrant_api_key: Option<String>,

    /// Lindera dictionary path (for Japanese tokenization)
    #[serde(default)]
    pub lindera_dict_path: Option<String>,

    /// Tantivy isolated indexes root directory (defaults to "./data/indexes")
    #[serde(default = "default_index_dir")]
    pub index_dir: String,

    /// Writer memory budget in megabytes (defaults to 50MB)
    #[serde(default = "default_writer_memory_mb")]
    pub writer_memory_mb: usize,

    /// Maximum number of search results
    #[serde(default = "default_max_results")]
    pub max_results: usize,
}

fn default_index_dir() -> String {
    "./data/indexes".to_string()
}
fn default_writer_memory_mb() -> usize {
    50
}

fn default_search_backend() -> String {
    "pgvector".to_string()
}
fn default_qdrant_port() -> u16 {
    6333
}
fn default_max_results() -> usize {
    50
}

impl Default for SearchConfig {
    fn default() -> Self {
        Self {
            backend: default_search_backend(),
            pgvector_url: None,
            qdrant_host: None,
            qdrant_port: default_qdrant_port(),
            qdrant_api_key: None,
            lindera_dict_path: None,
            index_dir: default_index_dir(),
            writer_memory_mb: default_writer_memory_mb(),
            max_results: default_max_results(),
        }
    }
}
