use async_trait::async_trait;
use cms_db::PgPool;
use cms_entity::{
    page::Page,
    search::{RagAnswer, SearchHit, SearchOptions},
};
use cms_error::AppError;

use crate::{tokenizer::JapaneseTokenizer, traits::SearchEngine};

/// pgvector-based search engine (default)
pub struct PgVectorSearchEngine {
    pool: PgPool,
    tokenizer: JapaneseTokenizer,
}

impl PgVectorSearchEngine {
    pub async fn new(database_url: String) -> Result<Self, AppError> {
        let pool = cms_db::create_pool(&database_url).await?;
        let tokenizer = JapaneseTokenizer::new();

        Ok(Self { pool, tokenizer })
    }

    pub fn from_pool(pool: PgPool) -> Self {
        let tokenizer = JapaneseTokenizer::new();
        Self { pool, tokenizer }
    }
}

#[async_trait]
impl SearchEngine for PgVectorSearchEngine {
    async fn hybrid_query(
        &self,
        project_id: &str,
        query: &str,
        opts: SearchOptions,
    ) -> Result<Vec<SearchHit>, AppError> {
        let normalized = self.tokenizer.normalize(query);
        let tokens = self.tokenizer.tokenize(&normalized);

        // Fetch published pages in project matching project_id
        let default_branch =
            cms_db::branch::BranchQueries::get_default(&self.pool, project_id).await?;
        let branch_id = default_branch.map(|b| b.id).unwrap_or_default();

        let pages: Vec<(
            String,
            String,
            String,
            Option<String>,
            chrono::DateTime<chrono::Utc>,
        )> = if !branch_id.is_empty() {
            let list = cms_db::page::PageQueries::get_by_project_and_branch(
                &self.pool,
                project_id,
                &branch_id,
                None,
                Some(true),
                Some(&normalized),
                Some(opts.limit as i64),
                None,
            )
            .await?;
            list.into_iter()
                .map(|p| (p.id, p.title, p.path, None, p.updated_at))
                .collect()
        } else {
            let list = cms_db::page::PageQueries::get_by_project(&self.pool, project_id).await?;
            list.into_iter()
                .filter(|p| p.is_published)
                .map(|p| (p.id, p.title, p.path, p.description, p.updated_at))
                .collect()
        };

        let mut hits = Vec::new();
        for (id, title, path, description, updated_at) in pages {
            let mut score = 0.0f32;
            let title_lower = title.to_lowercase();
            let norm_lower = normalized.to_lowercase();

            if title_lower.contains(&norm_lower) {
                score += 1.0;
            }
            for token in &tokens {
                let t_lower = token.to_lowercase();
                if title_lower.contains(&t_lower) {
                    score += 0.3;
                }
            }

            if score >= opts.min_score {
                hits.push(SearchHit {
                    page_id: id,
                    project_id: project_id.to_string(),
                    title: title.clone(),
                    path,
                    score,
                    chunk_text: description.clone().unwrap_or_else(|| title.clone()),
                    chunk_index: 0,
                    metadata: serde_json::json!({
                        "description": description,
                        "updated_at": updated_at
                    }),
                });
            }
        }

        hits.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        if hits.len() > opts.limit {
            hits.truncate(opts.limit);
        }

        Ok(hits)
    }

    async fn index_page(&self, _page: &Page) -> Result<(), AppError> {
        // Page content is persisted in Postgres and queryable via FTS queries
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
