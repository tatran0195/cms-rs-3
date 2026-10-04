use async_trait::async_trait;
use cms_entity::{
    page::Page,
    search::{RagAnswer, SearchHit, SearchOptions},
};
use cms_error::AppError;

use crate::{tokenizer::JapaneseTokenizer, traits::SearchEngine};

/// Qdrant-based search engine (optional)
pub struct QdrantSearchEngine {
    client: qdrant_client::Qdrant,
    tokenizer: JapaneseTokenizer,
}

impl QdrantSearchEngine {
    pub async fn new(host: String, port: u16, api_key: Option<String>) -> Result<Self, AppError> {
        use qdrant_client::Qdrant;

        let mut builder = Qdrant::from_url(&format!("http://{}:{}", host, port));
        if let Some(key) = api_key {
            builder = builder.api_key(key);
        }

        let client = builder
            .build()
            .map_err(|e| AppError::SearchUnavailable(e.to_string()))?;
        let tokenizer = JapaneseTokenizer::new();

        Ok(Self { client, tokenizer })
    }
}

#[async_trait]
impl SearchEngine for QdrantSearchEngine {
    async fn hybrid_query(
        &self,
        _project_id: &str,
        query: &str,
        _opts: SearchOptions,
    ) -> Result<Vec<SearchHit>, AppError> {
        let _tokens = self.tokenizer.tokenize(query);
        Ok(Vec::new())
    }

    async fn index_page(&self, _page: &Page) -> Result<(), AppError> {
        Ok(())
    }

    async fn remove_page(&self, _page_id: &str) -> Result<(), AppError> {
        Ok(())
    }

    async fn rag_answer(&self, project_id: &str, question: &str) -> Result<RagAnswer, AppError> {
        let hits = self
            .hybrid_query(
                project_id,
                question,
                SearchOptions {
                    limit: 5,
                    min_score: 0.0,
                    fts_weight: 0.5,
                },
            )
            .await?;

        if hits.is_empty() {
            return Ok(RagAnswer {
                answer: format!("No relevant documentation found for '{}'.", question),
                confidence: 0.0,
                sources: Vec::new(),
            });
        }

        let context = hits
            .iter()
            .map(|h| format!("### {}\n{}", h.title, h.chunk_text))
            .collect::<Vec<_>>()
            .join("\n\n");
        let answer = format!("Based on documentation in {}:\n\n{}", project_id, context);

        let confidence = hits
            .first()
            .map(|h| (h.score / 2.0).min(1.0))
            .unwrap_or(0.5);

        Ok(RagAnswer {
            answer,
            confidence,
            sources: hits,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_qdrant_rag_answer_empty_returns_not_found() {
        let engine = QdrantSearchEngine::new("localhost".to_string(), 6333, None)
            .await
            .unwrap();

        let ans = engine.rag_answer("proj_1", "how to install").await.unwrap();
        assert_eq!(
            ans.answer,
            "No relevant documentation found for 'how to install'."
        );
        assert_eq!(ans.confidence, 0.0);
        assert!(ans.sources.is_empty());
    }
}
