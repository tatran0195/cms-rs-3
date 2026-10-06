//! In-process embedding generation using fastembed-rs (ONNX Runtime)
//!
//! Provides text embedding for vector search using multilingual models.
//! Runs entirely in-process — no external API, no GPU, no Python.
//!
//! Supported models:
//! - `multilingual-e5-small` — 384 dimensions, ~117MB, best balance of speed and quality
//! - `multilingual-e5-base`  — 768 dimensions, ~470MB, higher quality for complex queries

use std::path::Path;
use std::sync::Arc;

use cms_error::AppError;
use fastembed::{EmbeddingModel, TextEmbedding, TextInitOptions};
use parking_lot::Mutex;

/// Thread-safe embedder wrapping fastembed's synchronous TextEmbedding model.
///
/// The fastembed `TextEmbedding` is `!Send + !Sync` because it holds ONNX Runtime
/// session state. We wrap it in a `Mutex` and perform embedding on a blocking
/// thread via `tokio::task::spawn_blocking`.
pub struct Embedder {
    model: Arc<Mutex<TextEmbedding>>,
    dim: usize,
    model_name: String,
}

impl Embedder {
    /// Create a new embedder with the specified model and cache directory.
    ///
    /// The model weights are downloaded on first use and cached to `cache_dir`.
    /// Subsequent calls reuse the cached model files.
    pub fn new(model_name: &str, cache_dir: &Path) -> Result<Self, AppError> {
        std::fs::create_dir_all(cache_dir).map_err(|e| {
            AppError::IndexingError(format!(
                "Failed to create model cache directory at '{}': {}",
                cache_dir.display(),
                e
            ))
        })?;

        let (embedding_model, dim) = match model_name {
            "multilingual-e5-small" => (EmbeddingModel::MultilingualE5Small, 384),
            "multilingual-e5-base" => (EmbeddingModel::MultilingualE5Base, 768),
            other => {
                return Err(AppError::IndexingError(format!(
                    "Unsupported embedding model: '{}'. Use 'multilingual-e5-small' or 'multilingual-e5-base'.",
                    other
                )))
            }
        };

        tracing::info!(
            model = model_name,
            dim = dim,
            cache = %cache_dir.display(),
            "Initializing embedding model"
        );

        let options = TextInitOptions::new(embedding_model)
            .with_cache_dir(cache_dir.to_path_buf())
            .with_show_download_progress(true);

        let model = TextEmbedding::try_new(options).map_err(|e| {
            AppError::IndexingError(format!(
                "Failed to initialize embedding model '{}': {}",
                model_name, e
            ))
        })?;

        tracing::info!(model = model_name, "Embedding model loaded successfully");

        Ok(Self {
            model: Arc::new(Mutex::new(model)),
            dim,
            model_name: model_name.to_string(),
        })
    }

    /// Embedding dimension for this model (384 or 768)
    pub fn dimension(&self) -> usize {
        self.dim
    }

    /// Model name
    pub fn model_name(&self) -> &str {
        &self.model_name
    }

    /// Embed a single text string. Returns a vector of `self.dimension()` floats.
    ///
    /// Uses `spawn_blocking` because fastembed is synchronous under the hood.
    pub async fn embed_text(&self, text: &str) -> Result<Vec<f32>, AppError> {
        let texts = vec![text.to_string()];
        let mut embeddings = self.embed_batch(&texts).await?;
        embeddings
            .pop()
            .ok_or_else(|| AppError::IndexingError("Embedding returned empty result".to_string()))
    }

    /// Embed multiple texts in a single batch (more efficient than one-by-one).
    ///
    /// For E5 models, query texts should be prefixed with "query: " and
    /// document/passage texts with "passage: " for best results.
    pub async fn embed_batch(&self, texts: &[String]) -> Result<Vec<Vec<f32>>, AppError> {
        if texts.is_empty() {
            return Ok(Vec::new());
        }

        let model = self.model.clone();
        let texts = texts.to_vec();

        tokio::task::spawn_blocking(move || {
            let mut model_guard = model.lock();
            model_guard
                .embed(texts, None)
                .map_err(|e| AppError::IndexingError(format!("Embedding generation failed: {}", e)))
        })
        .await
        .map_err(|e| AppError::IndexingError(format!("Embedding task panicked: {}", e)))?
    }

    /// Embed a query string with the "query: " prefix for E5 models.
    pub async fn embed_query(&self, query: &str) -> Result<Vec<f32>, AppError> {
        self.embed_text(&format!("query: {}", query)).await
    }

    /// Embed a document/passage string with the "passage: " prefix for E5 models.
    pub async fn embed_passage(&self, text: &str) -> Result<Vec<f32>, AppError> {
        self.embed_text(&format!("passage: {}", text)).await
    }

    /// Embed multiple passages in batch with the "passage: " prefix.
    pub async fn embed_passages(&self, texts: &[String]) -> Result<Vec<Vec<f32>>, AppError> {
        let prefixed: Vec<String> = texts.iter().map(|t| format!("passage: {}", t)).collect();
        self.embed_batch(&prefixed).await
    }
}

/// Compute cosine similarity between two vectors.
///
/// Returns a value in [-1.0, 1.0] where 1.0 means identical direction.
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    debug_assert_eq!(a.len(), b.len(), "Vector dimensions must match");

    let mut dot = 0.0f32;
    let mut norm_a = 0.0f32;
    let mut norm_b = 0.0f32;

    for i in 0..a.len() {
        dot += a[i] * b[i];
        norm_a += a[i] * a[i];
        norm_b += b[i] * b[i];
    }

    let denom = norm_a.sqrt() * norm_b.sqrt();
    if denom < f32::EPSILON {
        0.0
    } else {
        dot / denom
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine_similarity_identical() {
        let a = vec![1.0, 2.0, 3.0];
        let sim = cosine_similarity(&a, &a);
        assert!((sim - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_cosine_similarity_orthogonal() {
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![0.0, 1.0, 0.0];
        let sim = cosine_similarity(&a, &b);
        assert!(sim.abs() < 1e-6);
    }

    #[test]
    fn test_cosine_similarity_opposite() {
        let a = vec![1.0, 0.0];
        let b = vec![-1.0, 0.0];
        let sim = cosine_similarity(&a, &b);
        assert!((sim + 1.0).abs() < 1e-6);
    }
}
