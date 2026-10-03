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

    async fn rag_answer(&self, _project_id: &str, _question: &str) -> Result<RagAnswer, AppError> {
        Ok(RagAnswer {
            answer: "This is a placeholder answer".to_string(),
            confidence: 0.0,
            sources: Vec::new(),
        })
    }
}
