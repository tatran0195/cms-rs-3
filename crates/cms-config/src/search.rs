use serde::Deserialize;

/// Search configuration
#[derive(Debug, Clone, Deserialize)]
pub struct SearchConfig {
    /// Search backend. Only "tantivy" (embedded, per-project isolated) is supported.
    #[serde(default = "default_search_backend")]
    pub backend: String,

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

    // ── Vector / embedding settings ──────────────────────────────────

    /// Embedding model name for vector search.
    /// Supported: "multilingual-e5-small" (384-dim, default),
    ///            "multilingual-e5-base"  (768-dim, better quality)
    #[serde(default = "default_embedding_model")]
    pub embedding_model: String,

    /// Enable vector/semantic search alongside FTS (default: true)
    #[serde(default = "default_vector_search_enabled")]
    pub vector_search_enabled: bool,

    /// Default search mode: "hybrid" | "keyword" | "semantic"
    #[serde(default = "default_search_mode")]
    pub default_search_mode: String,

    /// Directory for cached ONNX embedding models (defaults to "./data/models")
    #[serde(default = "default_model_cache_dir")]
    pub model_cache_dir: String,

    // ── RAG configuration ────────────────────────────────────────────

    /// RAG (Retrieval Augmented Generation) configuration
    #[serde(default)]
    pub rag: RagConfig,
}

/// RAG (Retrieval Augmented Generation) configuration for LLM-powered answers
#[derive(Debug, Clone, Deserialize)]
pub struct RagConfig {
    /// Enable RAG answers (default: false)
    #[serde(default)]
    pub enabled: bool,

    /// LLM provider: "gemini" | "openai" | "ollama"
    #[serde(default = "default_rag_provider")]
    pub provider: String,

    /// API key for the LLM provider (can also be set via CMS_SEARCH__RAG__API_KEY)
    #[serde(default)]
    pub api_key: Option<String>,

    /// LLM model name (e.g. "gemini-2.5-flash", "gpt-4o-mini")
    #[serde(default = "default_rag_model")]
    pub model: String,

    /// API base URL override (for ollama or custom endpoints)
    #[serde(default)]
    pub api_base_url: Option<String>,

    /// Maximum number of context chunks to send to LLM
    #[serde(default = "default_max_context_chunks")]
    pub max_context_chunks: usize,

    /// LLM temperature (0.0–1.0)
    #[serde(default = "default_rag_temperature")]
    pub temperature: f32,
}

// ── Defaults ─────────────────────────────────────────────────────────

fn default_index_dir() -> String {
    "./data/indexes".to_string()
}
fn default_writer_memory_mb() -> usize {
    50
}

fn default_search_backend() -> String {
    "tantivy".to_string()
}
fn default_max_results() -> usize {
    50
}

fn default_embedding_model() -> String {
    "multilingual-e5-small".to_string()
}
fn default_vector_search_enabled() -> bool {
    true
}
fn default_search_mode() -> String {
    "hybrid".to_string()
}
fn default_model_cache_dir() -> String {
    "./data/models".to_string()
}

fn default_rag_provider() -> String {
    "gemini".to_string()
}
fn default_rag_model() -> String {
    "gemini-2.5-flash".to_string()
}
fn default_max_context_chunks() -> usize {
    5
}
fn default_rag_temperature() -> f32 {
    0.3
}

impl Default for SearchConfig {
    fn default() -> Self {
        Self {
            backend: default_search_backend(),
            lindera_dict_path: None,
            index_dir: default_index_dir(),
            writer_memory_mb: default_writer_memory_mb(),
            max_results: default_max_results(),
            embedding_model: default_embedding_model(),
            vector_search_enabled: default_vector_search_enabled(),
            default_search_mode: default_search_mode(),
            model_cache_dir: default_model_cache_dir(),
            rag: RagConfig::default(),
        }
    }
}

impl Default for RagConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            provider: default_rag_provider(),
            api_key: None,
            model: default_rag_model(),
            api_base_url: None,
            max_context_chunks: default_max_context_chunks(),
            temperature: default_rag_temperature(),
        }
    }
}
