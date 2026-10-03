//! CMS Search
//!
//! This crate provides search functionality with:
//! - Japanese morphological analysis (stub for now, pending lindera-core integration)
//! - Hybrid FTS + vector search
//! - pgvector (Postgres) as default backend
//! - Qdrant as optional backend
//!
//! The search is retargeted from Arabic to Japanese per the architecture decision.

use std::sync::Arc;

use cms_config::SearchConfig;
use cms_db::PgPool;
use cms_error::AppError;

pub mod pgvector;
#[cfg(feature = "qdrant")]
pub mod qdrant;
pub mod tokenizer;
pub mod traits;

pub use pgvector::PgVectorSearchEngine;
#[cfg(feature = "qdrant")]
pub use qdrant::QdrantSearchEngine;
pub use tokenizer::JapaneseTokenizer;
pub use traits::SearchEngine;

/// Create a SearchEngine implementation based on configuration and optional existing PgPool
pub async fn create_search_engine_with_pool(
    config: &SearchConfig,
    pool: PgPool,
) -> Result<Arc<dyn SearchEngine>, AppError> {
    match config.backend.as_str() {
        "pgvector" => {
            let engine = match &config.pgvector_url {
                Some(url) if !url.trim().is_empty() => {
                    PgVectorSearchEngine::new(url.clone()).await?
                }
                _ => PgVectorSearchEngine::from_pool(pool),
            };
            Ok(Arc::new(engine))
        }
        "qdrant" => {
            #[cfg(feature = "qdrant")]
            {
                let engine = QdrantSearchEngine::new(
                    config.qdrant_host.clone().unwrap_or_default(),
                    config.qdrant_port,
                    config.qdrant_api_key.clone(),
                )
                .await?;
                Ok(Arc::new(engine))
            }
            #[cfg(not(feature = "qdrant"))]
            {
                Err(AppError::SearchUnavailable(
                    "Qdrant backend requires the 'qdrant' feature".to_string(),
                ))
            }
        }
        _ => Err(AppError::SearchUnavailable(format!(
            "Unknown search backend: {}",
            config.backend
        ))),
    }
}

/// Create a SearchEngine implementation based on configuration and default database URL
pub async fn create_search_engine(
    config: &SearchConfig,
    default_db_url: &str,
) -> Result<Arc<dyn SearchEngine>, AppError> {
    match config.backend.as_str() {
        "pgvector" => {
            let url = config
                .pgvector_url
                .as_deref()
                .filter(|u| !u.trim().is_empty())
                .unwrap_or(default_db_url);
            let engine = PgVectorSearchEngine::new(url.to_string()).await?;
            Ok(Arc::new(engine))
        }
        "qdrant" => {
            #[cfg(feature = "qdrant")]
            {
                let engine = QdrantSearchEngine::new(
                    config.qdrant_host.clone().unwrap_or_default(),
                    config.qdrant_port,
                    config.qdrant_api_key.clone(),
                )
                .await?;
                Ok(Arc::new(engine))
            }
            #[cfg(not(feature = "qdrant"))]
            {
                Err(AppError::SearchUnavailable(
                    "Qdrant backend requires the 'qdrant' feature".to_string(),
                ))
            }
        }
        _ => Err(AppError::SearchUnavailable(format!(
            "Unknown search backend: {}",
            config.backend
        ))),
    }
}
