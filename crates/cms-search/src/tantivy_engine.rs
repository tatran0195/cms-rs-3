//! Tantivy Search Engine with isolated per-project index architecture
//!
//! Architecture:
//! - Each project's data is stored in its own isolated directory: `<base_dir>/projects/<project_id>/`
//! - Projects are completely isolated: zero write-lock contention across projects.
//! - Project search data can be deployed, scaled, migrated, or backed up independently.
//! - Japanese full-text search is powered by Lindera with embedded SudachiDict in Decompose mode.
//! - Multi-process safe: IndexWriter is acquired with retry backoff and released immediately after commit.
//! - Readers auto-reload on commit (`ReloadPolicy::OnCommitWithDelay`), keeping API and Worker in sync.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use cms_entity::{
    page::Page,
    search::{RagAnswer, SearchHit, SearchOptions},
};
use cms_error::AppError;
use parking_lot::RwLock;
use tantivy::{
    collector::TopDocs,
    directory::MmapDirectory,
    query::QueryParser,
    schema::{
        Field, IndexRecordOption, NumericOptions, Schema, TextFieldIndexing, TextOptions, Value,
        FAST, STORED, STRING,
    },
    snippet::SnippetGenerator,
    Index, IndexReader, IndexWriter, ReloadPolicy, TantivyDocument, Term,
};

use crate::{
    markdown,
    tokenizer::{JapaneseTokenizer, LinderaTantivyTokenizer, JAPANESE_TOKENIZER_NAME},
    traits::SearchEngine,
};

/// Schema fields for Tantivy project index
#[derive(Clone, Copy)]
pub struct TantivyFields {
    pub id: Field,
    pub page_id: Field,
    pub project_id: Field,
    pub branch_id: Field,
    pub language_id: Field,
    pub title: Field,
    pub path: Field,
    pub slug: Field,
    pub description: Field,
    pub body: Field,
    pub chunk_index: Field,
    pub is_published: Field,
    pub updated_at: Field,
}

impl TantivyFields {
    pub fn build_schema() -> (Schema, Self) {
        let mut builder = Schema::builder();

        let id = builder.add_text_field("id", STRING | STORED);
        let page_id = builder.add_text_field("page_id", STRING | STORED | FAST);
        let project_id = builder.add_text_field("project_id", STRING | STORED | FAST);
        let branch_id = builder.add_text_field("branch_id", STRING | STORED | FAST);
        let language_id = builder.add_text_field("language_id", STRING | STORED | FAST);

        // Japanese text options: indexed with Lindera SudachiDict tokenizer, term positions for phrase queries
        let japanese_text_options = TextOptions::default()
            .set_indexing_options(
                TextFieldIndexing::default()
                    .set_tokenizer(JAPANESE_TOKENIZER_NAME)
                    .set_index_option(IndexRecordOption::WithFreqsAndPositions),
            )
            .set_stored();

        let title = builder.add_text_field("title", japanese_text_options.clone());
        let path = builder.add_text_field("path", STRING | STORED);
        let slug = builder.add_text_field("slug", STRING | STORED);
        let description = builder.add_text_field("description", japanese_text_options.clone());
        let body = builder.add_text_field("body", japanese_text_options);

        let chunk_index = builder.add_i64_field("chunk_index", NumericOptions::default().set_stored().set_fast());
        let is_published = builder.add_u64_field("is_published", NumericOptions::default().set_stored().set_fast());
        let updated_at = builder.add_i64_field("updated_at", NumericOptions::default().set_stored().set_fast());

        let schema = builder.build();
        let fields = Self {
            id,
            page_id,
            project_id,
            branch_id,
            language_id,
            title,
            path,
            slug,
            description,
            body,
            chunk_index,
            is_published,
            updated_at,
        };

        (schema, fields)
    }
}

/// An active handle to an isolated project index
pub struct ProjectIndex {
    pub project_id: String,
    pub dir_path: PathBuf,
    pub index: Index,
    pub reader: IndexReader,
    pub fields: TantivyFields,
    write_gate: tokio::sync::Mutex<()>,
}

impl ProjectIndex {
    /// Open or create an isolated index for a specific project
    pub fn open_or_create(
        base_dir: &Path,
        project_id: &str,
        tokenizer: &JapaneseTokenizer,
    ) -> Result<Self, AppError> {
        let dir_path = base_dir.join("projects").join(project_id);
        std::fs::create_dir_all(&dir_path).map_err(|e| {
            AppError::IndexingError(format!(
                "Failed to create project index directory at '{}': {}",
                dir_path.display(),
                e
            ))
        })?;

        let (schema, fields) = TantivyFields::build_schema();
        let mmap_dir = MmapDirectory::open(&dir_path).map_err(|e| {
            AppError::IndexingError(format!(
                "Failed to open index directory at '{}': {}",
                dir_path.display(),
                e
            ))
        })?;

        let mut index = Index::open_or_create(mmap_dir, schema).map_err(|e| {
            AppError::IndexingError(format!(
                "Failed to initialize Tantivy index for project '{}': {}",
                project_id, e
            ))
        })?;

        // Register Japanese Lindera SudachiDict tokenizer
        index.tokenizers().register(
            JAPANESE_TOKENIZER_NAME,
            LinderaTantivyTokenizer::with_tokenizer(tokenizer.clone()),
        );

        let reader = index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()
            .map_err(|e| {
                AppError::SearchError(format!(
                    "Failed to open index reader for project '{}': {}",
                    project_id, e
                ))
            })?;

        Ok(Self {
            project_id: project_id.to_string(),
            dir_path,
            index,
            reader,
            fields,
            write_gate: tokio::sync::Mutex::new(()),
        })
    }

    /// Execute a write operation with multi-process lock retry and immediate commit
    pub async fn with_writer<F, R>(&self, memory_budget_bytes: usize, f: F) -> Result<R, AppError>
    where
        F: FnOnce(&mut IndexWriter) -> Result<R, AppError>,
    {
        let _guard = self.write_gate.lock().await;

        // Acquire writer with retry backoff in case another process (e.g. background worker) holds lock
        let mut attempts = 0;
        let mut writer: IndexWriter = loop {
            match self.index.writer_with_num_threads(1, memory_budget_bytes) {
                Ok(w) => break w,
                Err(tantivy::TantivyError::LockFailure(e, _)) => {
                    attempts += 1;
                    if attempts > 6 {
                        return Err(AppError::IndexingError(format!(
                            "Project '{}' index is locked by another process: {}",
                            self.project_id, e
                        )));
                    }
                    tokio::time::sleep(Duration::from_millis(50 * (1 << attempts.min(5)))).await;
                }
                Err(e) => {
                    return Err(AppError::IndexingError(format!(
                        "Failed to open writer for project '{}': {}",
                        self.project_id, e
                    )));
                }
            }
        };

        let result = f(&mut writer)?;

        writer.commit().map_err(|e| {
            AppError::IndexingError(format!(
                "Failed to commit index changes for project '{}': {}",
                self.project_id, e
            ))
        })?;

        // Explicitly reload reader for immediate same-process consistency
        let _ = self.reader.reload();

        Ok(result)
    }
}

/// Tantivy search engine managing isolated per-project indexes
pub struct TantivySearchEngine {
    base_dir: PathBuf,
    writer_memory_budget_bytes: usize,
    tokenizer: JapaneseTokenizer,
    projects: Arc<RwLock<HashMap<String, Arc<ProjectIndex>>>>,
}

impl TantivySearchEngine {
    /// Create a new Tantivy search engine with base index directory and optional dictionary path
    pub fn new<P: AsRef<Path>>(
        base_dir: P,
        writer_memory_mb: usize,
        lindera_dict_path: Option<&str>,
    ) -> Result<Self, AppError> {
        let base_dir = base_dir.as_ref().to_path_buf();
        std::fs::create_dir_all(base_dir.join("projects")).map_err(|e| {
            AppError::IndexingError(format!(
                "Failed to initialize search indexes root directory at '{}': {}",
                base_dir.display(),
                e
            ))
        })?;

        let tokenizer = JapaneseTokenizer::with_dict_path(lindera_dict_path);
        let writer_memory_budget_bytes = writer_memory_mb.max(15) * 1024 * 1024;

        Ok(Self {
            base_dir,
            writer_memory_budget_bytes,
            tokenizer,
            projects: Arc::new(RwLock::new(HashMap::new())),
        })
    }

    /// Access the Japanese morphological tokenizer
    pub fn tokenizer(&self) -> &JapaneseTokenizer {
        &self.tokenizer
    }

    /// Root directory storing all project indexes
    pub fn base_dir(&self) -> &Path {
        &self.base_dir
    }

    /// Path to a specific project's isolated index directory
    pub fn project_index_path(&self, project_id: &str) -> PathBuf {
        self.base_dir.join("projects").join(project_id)
    }

    /// List all project IDs currently having an index on disk
    pub fn list_projects(&self) -> Vec<String> {
        let projects_dir = self.base_dir.join("projects");
        let mut results = Vec::new();
        if let Ok(entries) = std::fs::read_dir(projects_dir) {
            for entry in entries.flatten() {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_dir() {
                        if let Some(name) = entry.file_name().to_str() {
                            results.push(name.to_string());
                        }
                    }
                }
            }
        }
        results
    }

    /// Delete a project's isolated index directory on disk and evict from cache
    pub fn delete_project_index(&self, project_id: &str) -> Result<(), AppError> {
        {
            let mut write = self.projects.write();
            write.remove(project_id);
        }
        let project_dir = self.project_index_path(project_id);
        if project_dir.exists() {
            std::fs::remove_dir_all(&project_dir).map_err(|e| {
                AppError::IndexingError(format!(
                    "Failed to delete project index directory at '{}': {}",
                    project_dir.display(),
                    e
                ))
            })?;
        }
        Ok(())
    }

    /// Get or create the isolated index handle for a project
    fn get_or_create_project_index(&self, project_id: &str) -> Result<Arc<ProjectIndex>, AppError> {
        {
            let read = self.projects.read();
            if let Some(idx) = read.get(project_id) {
                return Ok(idx.clone());
            }
        }

        let mut write = self.projects.write();
        if let Some(idx) = write.get(project_id) {
            return Ok(idx.clone());
        }

        let project_idx = Arc::new(ProjectIndex::open_or_create(
            &self.base_dir,
            project_id,
            &self.tokenizer,
        )?);

        write.insert(project_id.to_string(), project_idx.clone());
        Ok(project_idx)
    }
}

#[async_trait]
impl SearchEngine for TantivySearchEngine {
    async fn hybrid_query(
        &self,
        project_id: &str,
        query: &str,
        opts: SearchOptions,
    ) -> Result<Vec<SearchHit>, AppError> {
        let query_str = query.trim();
        if query_str.is_empty() {
            return Ok(Vec::new());
        }

        let project_dir = self.project_index_path(project_id);
        if !project_dir.exists() {
            return Ok(Vec::new());
        }

        let project_idx = self.get_or_create_project_index(project_id)?;
        let searcher = project_idx.reader.searcher();
        let fields = project_idx.fields;

        // Build query parser with Japanese tokenizer and relevance boosting
        let mut query_parser = QueryParser::for_index(
            &project_idx.index,
            vec![fields.title, fields.description, fields.body],
        );
        query_parser.set_field_boost(fields.title, 2.5);
        query_parser.set_field_boost(fields.description, 1.5);
        query_parser.set_field_boost(fields.body, 1.0);

        let (parsed_query, _) = query_parser.parse_query_lenient(query_str);

        // Fetch top docs
        let fetch_limit = (opts.limit * 3).max(10);
        let top_docs = searcher
            .search(&*parsed_query, &TopDocs::with_limit(fetch_limit).order_by_score())
            .map_err(|e| {
                AppError::SearchError(format!(
                    "Tantivy search error for project '{}': {}",
                    project_id, e
                ))
            })?;

        if top_docs.is_empty() {
            return Ok(Vec::new());
        }

        // Prepare snippet generator for body field
        let snippet_generator = SnippetGenerator::create(&searcher, &*parsed_query, fields.body).ok();

        let mut hits: Vec<SearchHit> = Vec::new();
        let mut seen_pages: HashMap<String, usize> = HashMap::new();

        for (score, doc_address) in top_docs {
            if score < opts.min_score {
                continue;
            }

            let doc: TantivyDocument = match searcher.doc(doc_address) {
                Ok(d) => d,
                Err(_) => continue,
            };

            let page_id = match doc.get_first(fields.page_id).and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => continue,
            };

            let title = doc
                .get_first(fields.title)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let path = doc
                .get_first(fields.path)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let description = doc
                .get_first(fields.description)
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let body = doc
                .get_first(fields.body)
                .and_then(|v| v.as_str())
                .unwrap_or("");

            let chunk_index = doc
                .get_first(fields.chunk_index)
                .and_then(|v| v.as_i64())
                .unwrap_or(0) as i32;

            let updated_at_secs = doc
                .get_first(fields.updated_at)
                .and_then(|v| v.as_i64())
                .unwrap_or(0);

            // Generate contextual snippet with highlighted matched terms
            let chunk_text = if let Some(ref generator) = snippet_generator {
                let snippet = generator.snippet_from_doc(&doc);
                if !snippet.is_empty() {
                    snippet.to_html()
                } else if !body.is_empty() {
                    body.chars().take(240).collect::<String>()
                } else {
                    description.clone().unwrap_or_else(|| title.clone())
                }
            } else if !body.is_empty() {
                body.chars().take(240).collect::<String>()
            } else {
                description.clone().unwrap_or_else(|| title.clone())
            };

            let hit = SearchHit {
                page_id: page_id.clone(),
                project_id: project_id.to_string(),
                title,
                path,
                score,
                chunk_text,
                chunk_index,
                metadata: serde_json::json!({
                    "description": description,
                    "updated_at": updated_at_secs
                }),
            };

            // Deduplicate chunks per page (retain highest-scoring chunk)
            if let Some(&existing_idx) = seen_pages.get(&page_id) {
                if score > hits[existing_idx].score {
                    hits[existing_idx] = hit;
                }
            } else {
                seen_pages.insert(page_id, hits.len());
                hits.push(hit);
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

    async fn index_page(&self, page: &Page) -> Result<(), AppError> {
        let project_idx = self.get_or_create_project_index(&page.project_id)?;
        let fields = project_idx.fields;
        let memory_budget = self.writer_memory_budget_bytes;

        project_idx
            .with_writer(memory_budget, |writer| {
                // Delete existing document(s) for this page (atomic upsert)
                let term = Term::from_field_text(fields.page_id, &page.id);
                writer.delete_term(term);

                if !page.is_published || !page.is_indexed {
                    return Ok(());
                }

                // Chunk page content using markdown parser
                let chunks = markdown::extract_chunks(&page.content);
                let effective_chunks = if chunks.is_empty() {
                    vec![markdown::DocumentChunk {
                        chunk_index: 0,
                        heading: None,
                        text: page.description.clone().unwrap_or_else(|| page.title.clone()),
                    }]
                } else {
                    chunks
                };

                for chunk in effective_chunks {
                    let mut doc = TantivyDocument::new();
                    doc.add_text(fields.id, format!("{}:{}", page.id, chunk.chunk_index));
                    doc.add_text(fields.page_id, &page.id);
                    doc.add_text(fields.project_id, &page.project_id);
                    doc.add_text(fields.branch_id, &page.branch_id);
                    doc.add_text(fields.language_id, page.language_id.as_deref().unwrap_or(""));
                    doc.add_text(fields.title, &page.title);
                    doc.add_text(fields.path, &page.path);
                    doc.add_text(fields.slug, &page.slug);
                    doc.add_text(fields.description, page.description.as_deref().unwrap_or(""));
                    doc.add_text(fields.body, &chunk.text);
                    doc.add_i64(fields.chunk_index, chunk.chunk_index as i64);
                    doc.add_u64(fields.is_published, if page.is_published { 1 } else { 0 });
                    doc.add_i64(fields.updated_at, page.updated_at.timestamp());

                    writer.add_document(doc).map_err(|e| {
                        AppError::IndexingError(format!(
                            "Failed to add document to index for page '{}': {}",
                            page.id, e
                        ))
                    })?;
                }

                Ok(())
            })
            .await?;

        Ok(())
    }

    async fn remove_page_from_project(
        &self,
        project_id: &str,
        page_id: &str,
    ) -> Result<(), AppError> {
        let project_dir = self.project_index_path(project_id);
        if !project_dir.exists() {
            return Ok(());
        }

        let project_idx = self.get_or_create_project_index(project_id)?;
        let fields = project_idx.fields;
        let memory_budget = self.writer_memory_budget_bytes;

        project_idx
            .with_writer(memory_budget, |writer| {
                let term = Term::from_field_text(fields.page_id, page_id);
                writer.delete_term(term);
                Ok(())
            })
            .await?;

        Ok(())
    }

    async fn remove_page(&self, page_id: &str) -> Result<(), AppError> {
        // When project_id is not passed, remove page from all active project indexes on disk
        let projects = self.list_projects();
        for proj in projects {
            let _ = self.remove_page_from_project(&proj, page_id).await;
        }
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
                answer: format!("'{}' に関する関連ドキュメントが見つかりませんでした。", question),
                confidence: 0.0,
                sources: Vec::new(),
            });
        }

        let context = hits
            .iter()
            .map(|h| format!("### {} ({})\n{}", h.title, h.path, h.chunk_text))
            .collect::<Vec<_>>()
            .join("\n\n");

        let answer = format!("プロジェクト '{}' のドキュメントに基づく回答:\n\n{}", project_id, context);

        let confidence = hits
            .first()
            .map(|h| (h.score / 2.0).clamp(0.1, 1.0))
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
    use chrono::Utc;
    use tempfile::TempDir;

    fn make_test_page(id: &str, project_id: &str, title: &str, content: &str) -> Page {
        Page {
            id: id.to_string(),
            project_id: project_id.to_string(),
            branch_id: "main".to_string(),
            language_id: Some("ja".to_string()),
            parent_id: None,
            kind: "PAGE".to_string(),
            path: format!("/docs/{}", id),
            slug: id.to_string(),
            title: title.to_string(),
            description: Some(format!("{} の説明文", title)),
            content: content.to_string(),
            icon: None,
            config: None,
            translation_key: None,
            position: 0,
            is_published: true,
            is_indexed: true,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    #[tokio::test]
    async fn test_isolated_project_indexing_and_search() {
        let temp_dir = TempDir::new().unwrap();
        let engine = TantivySearchEngine::new(temp_dir.path(), 20, None).unwrap();

        let page1 = make_test_page(
            "p1",
            "project_alpha",
            "関西国際空港の利用案内",
            "# 概要\n関西国際空港へのアクセス方法とターミナル案内です。\n\n## 鉄道アクセス\nJRと南海電鉄をご利用いただけます。",
        );

        let page2 = make_test_page(
            "p2",
            "project_beta",
            "Linuxサーバの導入ガイド",
            "# サーバ構築\nUbuntu Linuxサーバの初期セットアップとセキュリティ設定を行います。",
        );

        // Index in project_alpha
        engine.index_page(&page1).await.expect("index page 1");
        // Index in project_beta
        engine.index_page(&page2).await.expect("index page 2");

        // Verify isolation: project_alpha has project_alpha index folder
        let alpha_path = engine.project_index_path("project_alpha");
        let beta_path = engine.project_index_path("project_beta");
        assert!(alpha_path.exists());
        assert!(beta_path.exists());

        // Searching project_alpha for "空港" should find page 1
        let hits_alpha = engine
            .hybrid_query(
                "project_alpha",
                "空港",
                SearchOptions {
                    limit: 10,
                    min_score: 0.0,
                    fts_weight: 0.5,
                },
            )
            .await
            .expect("search alpha");

        assert_eq!(hits_alpha.len(), 1);
        assert_eq!(hits_alpha[0].page_id, "p1");
        assert!(hits_alpha[0].title.contains("関西国際空港"));

        // Searching project_beta for "空港" must return 0 hits (complete project isolation!)
        let hits_beta_empty = engine
            .hybrid_query(
                "project_beta",
                "空港",
                SearchOptions {
                    limit: 10,
                    min_score: 0.0,
                    fts_weight: 0.5,
                },
            )
            .await
            .expect("search beta for airport");
        assert_eq!(hits_beta_empty.len(), 0);

        // Searching project_beta for "サーバー" should match "サーバ" due to SudachiDict normalization
        let hits_beta = engine
            .hybrid_query(
                "project_beta",
                "サーバー",
                SearchOptions {
                    limit: 10,
                    min_score: 0.0,
                    fts_weight: 0.5,
                },
            )
            .await
            .expect("search beta for server");

        assert_eq!(hits_beta.len(), 1);
        assert_eq!(hits_beta[0].page_id, "p2");

        // Test remove_page_from_project
        engine
            .remove_page_from_project("project_alpha", "p1")
            .await
            .expect("remove p1");

        let hits_after_remove = engine
            .hybrid_query(
                "project_alpha",
                "空港",
                SearchOptions {
                    limit: 10,
                    min_score: 0.0,
                    fts_weight: 0.5,
                },
            )
            .await
            .expect("search after remove");
        assert_eq!(hits_after_remove.len(), 0);
    }
}
