use async_trait::async_trait;
use cms_entity::{
    page::Page,
    search::{RagAnswer, SearchHit, SearchOptions},
};
use cms_error::AppError;

/// Search engine trait
#[async_trait]
pub trait SearchEngine: Send + Sync {
    /// Perform a hybrid search query
    async fn hybrid_query(
        &self,
        project_id: &str,
        query: &str,
        opts: SearchOptions,
    ) -> Result<Vec<SearchHit>, AppError>;

    /// Index a page
    async fn index_page(&self, page: &Page) -> Result<(), AppError>;

    /// Remove a page from the index
    async fn remove_page(&self, page_id: &str) -> Result<(), AppError>;

    /// Remove a page from a specific project's isolated index
    async fn remove_page_from_project(
        &self,
        project_id: &str,
        page_id: &str,
    ) -> Result<(), AppError> {
        let _ = project_id;
        self.remove_page(page_id).await
    }

    /// Get RAG answer for a question
    async fn rag_answer(&self, project_id: &str, question: &str) -> Result<RagAnswer, AppError>;
}
