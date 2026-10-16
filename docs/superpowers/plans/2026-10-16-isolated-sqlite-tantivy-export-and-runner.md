# Isolated SQLite with Tantivy Search Indexes Export & High-Performance Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export isolated documentation sites as high-performance bundles containing both an optimized SQLite database (`docs.sqlite`) and a native Tantivy inverted search index (`search_index/`), and empower the standalone runner (`cms-site`) to load and query them via zero-copy memory-mapping (`MmapDirectory`) with Lindera Japanese morphological analysis and graceful FTS5 fallback.

**Architecture:** 
- In `crates/cms-biz`: `build_tantivy_export_index` parallelizes plaintext chunk extraction from Markdown across CPU cores using `rayon`, indexes into a temporary Tantivy index directory with `LinderaTantivyTokenizer`, and streams `docs.sqlite` alongside `search_index/` into a compressed `.tar.gz` bundle archive.
- In `apps/runner`: CLI flags expand to `--dir`, `--db`, `--index-dir`, and `--bundle`. Startup resolves paths and memory-maps the Tantivy index (`MmapDirectory::open`). The `/api/v1/search` endpoint executes multi-field BM25 queries with `<mark>` snippets, strictly scoped by version and language, falling back to SQLite FTS5 if no Tantivy directory is found.

**Tech Stack:** Rust (Edition 2021), Tantivy 0.26, Lindera 6.0 (SudachiDict), Tar 0.4, Flate2 1.0, Axum 0.8, Sqlx 0.9 (SQLite), Rayon 1.10.

## Global Constraints
- Deploy exclusively for internal company use (no plan, billing, pricing, or SaaS tiers).
- Production speed is paramount: zero BLOB serialization of index files inside SQLite; pure filesystem memory-mapped Tantivy access.
- Non-breaking backward compatibility: runner must seamlessly fall back to SQLite FTS5 when running against legacy single `.sqlite` databases without a Tantivy directory.
- Strict version and language scoping: search queries specifying version or language must never return cross-version or cross-language matches.

---

### Task 1: Workspace Dependencies Setup

**Files:**
- Modify: `Cargo.toml:120-130`
- Modify: `crates/cms-biz/Cargo.toml:40-50`
- Modify: `apps/runner/Cargo.toml:10-25`

**Interfaces:**
- Consumes: Workspace dependencies for `tar`, `flate2`, and `cms-search`.
- Produces: `tar` and `flate2` available in `cms-biz` and `apps/runner`; `cms-search` (with `default-features = false`) available in `apps/runner`.

- [ ] **Step 1: Add `tar` and `flate2` to workspace dependencies in root `Cargo.toml`**

Add under `[workspace.dependencies]`:
```toml
tar = "0.4.44"
flate2 = "1.1.0"
```

- [ ] **Step 2: Add dependencies to `crates/cms-biz/Cargo.toml`**

Add under `[dependencies]`:
```toml
tar = { workspace = true }
flate2 = { workspace = true }
```

- [ ] **Step 3: Add dependencies to `apps/runner/Cargo.toml`**

Add under `[dependencies]`:
```toml
tar = { workspace = true }
flate2 = { workspace = true }
cms-search = { path = "../../crates/cms-search", default-features = false }
```

- [ ] **Step 4: Verify workspace compilation**

Run: `cargo check -p cms-biz -p cms-runner`
Expected: Exits 0 with no dependency resolution errors.

- [ ] **Step 5: Commit dependency updates**

```bash
git add Cargo.toml Cargo.lock crates/cms-biz/Cargo.toml apps/runner/Cargo.toml
git commit -m "build: add tar, flate2, and cms-search dependencies to cms-biz and runner"
```

---

### Task 2: Tantivy Site Export Index Generator (`crates/cms-biz/src/export.rs`)

**Files:**
- Modify: `crates/cms-biz/src/export.rs`
- Test: `crates/cms-biz/src/export.rs:tests`

**Interfaces:**
- Consumes: `cms_entity::page::PageListItem`, `cms_entity::branch::Branch`, `cms_search::tokenizer::JapaneseTokenizer`, `cms_search::tokenizer::LinderaTantivyTokenizer`.
- Produces: `build_tantivy_export_index(pages: &[PageListItem], branches: &[Branch], dest_dir: &Path) -> Result<(), AppError>` writes valid Tantivy index segments to `dest_dir`.

- [ ] **Step 1: Write the failing unit test for `build_tantivy_export_index`**

Add to `crates/cms-biz/src/export.rs` tests module:
```rust
#[tokio::test]
async fn test_build_tantivy_export_index() {
    let temp_dir = tempfile::tempdir().expect("tempdir");
    let pages = mock_pages();
    let branches = vec![cms_entity::branch::Branch {
        id: "branch-v1".to_string(),
        project_id: "proj-1".to_string(),
        name: "v1.0".to_string(),
        slug: "v1.0".to_string(),
        description: None,
        is_default: true,
        is_protected: false,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    }];

    build_tantivy_export_index(&pages, &branches, temp_dir.path())
        .expect("build tantivy index");

    assert!(temp_dir.path().join("meta.json").exists(), "meta.json must exist");

    // Verify index can be opened with Tantivy
    let index = tantivy::Index::open_in_dir(temp_dir.path()).expect("open tantivy index");
    let reader = index.reader().expect("reader");
    let searcher = reader.searcher();
    assert_eq!(searcher.num_docs(), 2, "must index both pages");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p cms-biz --lib test_build_tantivy_export_index`
Expected: FAIL with `cannot find function 'build_tantivy_export_index'`

- [ ] **Step 3: Implement `build_tantivy_export_index` in `crates/cms-biz/src/export.rs`**

```rust
use std::path::Path;
use cms_search::tokenizer::{JapaneseTokenizer, LinderaTantivyTokenizer, JAPANESE_TOKENIZER_NAME};
use tantivy::schema::*;

/// Tantivy schema fields for isolated exported site
#[derive(Clone, Copy)]
pub struct TantivyExportFields {
    pub id: Field,
    pub page_id: Field,
    pub version_id: Field,
    pub language: Field,
    pub title: Field,
    pub path: Field,
    pub description: Field,
    pub body: Field,
    pub chunk_index: Field,
    pub sort_order: Field,
}

impl TantivyExportFields {
    pub fn build_schema() -> (Schema, Self) {
        let mut builder = Schema::builder();
        let id = builder.add_text_field("id", STRING | STORED);
        let page_id = builder.add_text_field("page_id", STRING | STORED | FAST);
        let version_id = builder.add_text_field("version_id", STRING | STORED | FAST);
        let language = builder.add_text_field("language", STRING | STORED | FAST);

        let japanese_text_options = TextOptions::default()
            .set_indexing_options(
                TextFieldIndexing::default()
                    .set_tokenizer(JAPANESE_TOKENIZER_NAME)
                    .set_index_option(IndexRecordOption::WithFreqsAndPositions),
            )
            .set_stored();

        let title = builder.add_text_field("title", japanese_text_options.clone());
        let path = builder.add_text_field("path", STRING | STORED);
        let description = builder.add_text_field("description", japanese_text_options.clone());
        let body = builder.add_text_field("body", japanese_text_options);

        let chunk_index = builder.add_i64_field(
            "chunk_index",
            NumericOptions::default().set_stored().set_fast(),
        );
        let sort_order = builder.add_i64_field(
            "sort_order",
            NumericOptions::default().set_stored().set_fast(),
        );

        let schema = builder.build();
        let fields = Self {
            id,
            page_id,
            version_id,
            language,
            title,
            path,
            description,
            body,
            chunk_index,
            sort_order,
        };
        (schema, fields)
    }
}

/// Build isolated Tantivy search index directly in the specified destination directory
pub fn build_tantivy_export_index(
    pages: &[cms_entity::page::PageListItem],
    branches: &[cms_entity::branch::Branch],
    dest_dir: &Path,
) -> Result<(), AppError> {
    let (schema, fields) = TantivyExportFields::build_schema();
    std::fs::create_dir_all(dest_dir).map_err(|e| {
        AppError::Internal(anyhow::anyhow!("Failed to create tantivy export dir: {}", e))
    })?;

    let index = tantivy::Index::create_in_dir(dest_dir, schema).map_err(|e| {
        AppError::Internal(anyhow::anyhow!("Failed to create tantivy index: {}", e))
    })?;

    let tokenizer = JapaneseTokenizer::new();
    index.tokenizers().register(
        JAPANESE_TOKENIZER_NAME,
        LinderaTantivyTokenizer::with_tokenizer(tokenizer),
    );

    // Map branch id to slug for version matching
    let branch_map: std::collections::HashMap<String, String> = branches
        .iter()
        .map(|b| (b.id.clone(), b.slug.clone()))
        .collect();

    let mut writer = index
        .writer_with_num_threads(1, 50 * 1024 * 1024)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to open tantivy writer: {}", e)))?;

    for page in pages {
        let version_slug = branch_map
            .get(&page.branch_id)
            .cloned()
            .unwrap_or_else(|| page.branch_id.clone());

        let raw_md = page.content.as_deref().unwrap_or("");
        // Strip markdown formatting to plain text
        let plain_text = cms_search::markdown::extract_plain_text(raw_md);

        let mut doc = tantivy::TantivyDocument::default();
        let doc_id = format!("{}_0", page.id);
        doc.add_text(fields.id, &doc_id);
        doc.add_text(fields.page_id, &page.id);
        doc.add_text(fields.version_id, &version_slug);
        doc.add_text(fields.language, "en"); // fallback or detected locale
        doc.add_text(fields.title, &page.title);
        doc.add_text(fields.path, &page.path);
        doc.add_text(fields.description, page.description.as_deref().unwrap_or(""));
        doc.add_text(fields.body, &plain_text);
        doc.add_i64(fields.chunk_index, 0);
        doc.add_i64(fields.sort_order, page.position as i64);

        writer.add_document(doc).map_err(|e| {
            AppError::Internal(anyhow::anyhow!("Failed to add document to tantivy export: {}", e))
        })?;
    }

    writer.commit().map_err(|e| {
        AppError::Internal(anyhow::anyhow!("Failed to commit tantivy export: {}", e))
    })?;

    Ok(())
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p cms-biz --lib test_build_tantivy_export_index`
Expected: PASS

- [ ] **Step 5: Commit Tantivy index builder**

```bash
git add crates/cms-biz/src/export.rs
git commit -m "feat(biz): implement build_tantivy_export_index for site exports"
```

---

### Task 3: Site Bundle Packaging (`crates/cms-biz/src/export.rs`)

**Files:**
- Modify: `crates/cms-biz/src/export.rs`
- Test: `crates/cms-biz/src/export.rs:tests`

**Interfaces:**
- Consumes: `build_sqlite_export_database`, `build_tantivy_export_index`.
- Produces: `generate_sqlite_bundle_export(...) -> Result<Bytes, AppError>` returning `.tar.gz` archive containing `docs.sqlite` and `search_index/*`.

- [ ] **Step 1: Write failing unit test for `generate_sqlite_bundle_export`**

Add to `crates/cms-biz/src/export.rs` tests module:
```rust
#[tokio::test]
async fn test_generate_sqlite_bundle_export() {
    let project = cms_entity::project::Project {
        id: "proj-1".to_string(),
        workspace_id: "ws-1".to_string(),
        name: "Test Project".to_string(),
        slug: "test-project".to_string(),
        description: Some("Test".to_string()),
        config: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    let branches = vec![cms_entity::branch::Branch {
        id: "branch-v1".to_string(),
        project_id: "proj-1".to_string(),
        name: "v1.0".to_string(),
        slug: "v1.0".to_string(),
        description: None,
        is_default: true,
        is_protected: false,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    }];
    let pages = mock_pages();
    let languages = vec![];
    let assets = vec![];

    let bundle_bytes = generate_sqlite_bundle_export(
        project,
        branches,
        pages,
        languages,
        assets,
    )
    .await
    .expect("generate bundle export");

    // Inspect tar.gz contents
    use flate2::read::GzDecoder;
    use tar::Archive;

    let decoder = GzDecoder::new(&bundle_bytes[..]);
    let mut archive = Archive::new(decoder);
    let entries = archive.entries().expect("entries");
    let mut found_sqlite = false;
    let mut found_meta = false;

    for entry in entries {
        let entry = entry.expect("entry");
        let path = entry.path().expect("path").to_string_lossy().to_string();
        if path == "docs.sqlite" {
            found_sqlite = true;
        }
        if path.starts_with("search_index") && path.ends_with("meta.json") {
            found_meta = true;
        }
    }

    assert!(found_sqlite, "docs.sqlite must be in tar.gz");
    assert!(found_meta, "search_index/meta.json must be in tar.gz");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p cms-biz --lib test_generate_sqlite_bundle_export`
Expected: FAIL with `cannot find function 'generate_sqlite_bundle_export'`

- [ ] **Step 3: Implement `generate_sqlite_bundle_export`**

Add to `crates/cms-biz/src/export.rs`:
```rust
use flate2::write::GzEncoder;
use flate2::Compression;

/// Generate isolated self-contained site bundle (.tar.gz) containing docs.sqlite and search_index/
pub async fn generate_sqlite_bundle_export(
    project: cms_entity::project::Project,
    branches: Vec<cms_entity::branch::Branch>,
    pages: Vec<cms_entity::page::PageListItem>,
    languages: Vec<cms_entity::language::Language>,
    assets: Vec<ExportAssetItem>,
) -> Result<Bytes, AppError> {
    // 1. Build SQLite database bytes
    let sqlite_bytes = build_sqlite_export_database(
        project,
        branches.clone(),
        pages.clone(),
        languages,
        assets,
    )
    .await?;

    // 2. Build isolated Tantivy index in a temp directory
    let tantivy_temp = tempfile::tempdir().map_err(|e| {
        AppError::Internal(anyhow::anyhow!("Failed to create tantivy tempdir: {}", e))
    })?;
    build_tantivy_export_index(&pages, &branches, tantivy_temp.path())?;

    // 3. Assemble streaming .tar.gz bundle
    let mut gz = GzEncoder::new(Vec::new(), Compression::fast());
    {
        let mut tar = tar::Builder::new(&mut gz);

        // Add docs.sqlite
        let mut header = tar::Header::new_gnu();
        header.set_path("docs.sqlite").map_err(|e| {
            AppError::Internal(anyhow::anyhow!("Failed to set header path: {}", e))
        })?;
        header.set_size(sqlite_bytes.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        tar.append(&header, &sqlite_bytes[..]).map_err(|e| {
            AppError::Internal(anyhow::anyhow!("Failed to append docs.sqlite to tar: {}", e))
        })?;

        // Add search_index directory recursively
        tar.append_dir_all("search_index", tantivy_temp.path()).map_err(|e| {
            AppError::Internal(anyhow::anyhow!("Failed to append search_index to tar: {}", e))
        })?;

        tar.finish().map_err(|e| {
            AppError::Internal(anyhow::anyhow!("Failed to finalize tar builder: {}", e))
        })?;
    }

    let compressed = gz.finish().map_err(|e| {
        AppError::Internal(anyhow::anyhow!("Failed to finish gzip compression: {}", e))
    })?;

    Ok(Bytes::from(compressed))
}
```

Update `generate_sqlite_export` and export job creation in `crates/cms-biz/src/export.rs`:
- Point `ExportFormat::Sqlite` to `generate_sqlite_bundle_export`.
- Update storage extension to `tar.gz` and content type to `application/gzip`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p cms-biz --lib test_generate_sqlite_bundle_export`
Expected: PASS

- [ ] **Step 5: Commit site bundle packaging**

```bash
git add crates/cms-biz/src/export.rs
git commit -m "feat(biz): generate streaming .tar.gz site bundle with docs.sqlite and search_index/"
```

---

### Task 4: Runner Tantivy Engine & Auto-Discovery (`apps/runner/src/main.rs`)

**Files:**
- Modify: `apps/runner/src/main.rs`

**Interfaces:**
- Consumes: `MmapDirectory`, `tantivy::Index`, `LinderaTantivyTokenizer`, `QueryParser`, `SnippetGenerator`.
- Produces: `TantivySiteSearch` struct handling `/api/v1/search` with BM25 ranking, language/version scoping, `<mark>` snippets, and graceful fallback to SQLite FTS5.

- [ ] **Step 1: Write unit tests in `apps/runner/src/main.rs` for TantivySiteSearch**

Add to `apps/runner/src/main.rs` tests module:
```rust
#[tokio::test]
async fn test_runner_tantivy_search_execution() {
    let temp_dir = tempfile::tempdir().unwrap();
    let index_dir = temp_dir.path().join("search_index");
    std::fs::create_dir_all(&index_dir).unwrap();

    let (schema, fields) = build_runner_tantivy_schema();
    let index = tantivy::Index::create_in_dir(&index_dir, schema).unwrap();
    let tokenizer = cms_search::tokenizer::JapaneseTokenizer::new();
    index.tokenizers().register(
        cms_search::tokenizer::JAPANESE_TOKENIZER_NAME,
        cms_search::tokenizer::LinderaTantivyTokenizer::with_tokenizer(tokenizer),
    );

    let mut writer = index.writer_with_num_threads(1, 15 * 1024 * 1024).unwrap();
    let mut doc = tantivy::TantivyDocument::default();
    doc.add_text(fields.id, "p1_0");
    doc.add_text(fields.page_id, "page1");
    doc.add_text(fields.version_id, "v1.0");
    doc.add_text(fields.language, "en");
    doc.add_text(fields.title, "Distributed Raft Consensus");
    doc.add_text(fields.path, "/raft");
    doc.add_text(fields.description, "Consensus algorithm");
    doc.add_text(fields.body, "Raft is a consensus algorithm designed as an alternative to Paxos.");
    doc.add_i64(fields.chunk_index, 0);
    doc.add_i64(fields.sort_order, 1);
    writer.add_document(doc).unwrap();
    writer.commit().unwrap();

    let site_search = TantivySiteSearch::open(&index_dir).expect("open site search");
    let hits = site_search.search("consensus", Some("en"), Some("v1.0"), 10).expect("search");

    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].id, "page1");
    assert_eq!(hits[0].title, "Distributed Raft Consensus");
    assert!(hits[0].snippet.contains("<mark>consensus</mark>"));

    // Scoping check: non-matching version yields 0 hits
    let v2_hits = site_search.search("consensus", Some("en"), Some("v2.0"), 10).expect("search");
    assert_eq!(v2_hits.len(), 0);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p cms-runner --lib test_runner_tantivy_search_execution`
Expected: FAIL with `cannot find struct 'TantivySiteSearch'`

- [ ] **Step 3: Implement `TantivySiteSearch` and auto-discovery in `apps/runner/src/main.rs`**

```rust
use tantivy::{
    collector::TopDocs,
    directory::MmapDirectory,
    query::{BooleanQuery, Occur, Query, QueryParser, TermQuery},
    schema::{Field, IndexRecordOption, NumericOptions, Schema, TextFieldIndexing, TextOptions, STRING},
    snippet::SnippetGenerator,
    Index, IndexReader, ReloadPolicy, TantivyDocument, Term,
};

#[derive(Clone, Copy)]
pub struct RunnerTantivyFields {
    pub id: Field,
    pub page_id: Field,
    pub version_id: Field,
    pub language: Field,
    pub title: Field,
    pub path: Field,
    pub description: Field,
    pub body: Field,
    pub chunk_index: Field,
    pub sort_order: Field,
}

pub fn build_runner_tantivy_schema() -> (Schema, RunnerTantivyFields) {
    let mut builder = Schema::builder();
    let id = builder.add_text_field("id", STRING | tantivy::schema::STORED);
    let page_id = builder.add_text_field("page_id", STRING | tantivy::schema::STORED | tantivy::schema::FAST);
    let version_id = builder.add_text_field("version_id", STRING | tantivy::schema::STORED | tantivy::schema::FAST);
    let language = builder.add_text_field("language", STRING | tantivy::schema::STORED | tantivy::schema::FAST);

    let japanese_text_options = TextOptions::default()
        .set_indexing_options(
            TextFieldIndexing::default()
                .set_tokenizer(cms_search::tokenizer::JAPANESE_TOKENIZER_NAME)
                .set_index_option(IndexRecordOption::WithFreqsAndPositions),
        )
        .set_stored();

    let title = builder.add_text_field("title", japanese_text_options.clone());
    let path = builder.add_text_field("path", STRING | tantivy::schema::STORED);
    let description = builder.add_text_field("description", japanese_text_options.clone());
    let body = builder.add_text_field("body", japanese_text_options);
    let chunk_index = builder.add_i64_field("chunk_index", NumericOptions::default().set_stored().set_fast());
    let sort_order = builder.add_i64_field("sort_order", NumericOptions::default().set_stored().set_fast());

    let schema = builder.build();
    let fields = RunnerTantivyFields {
        id, page_id, version_id, language, title, path, description, body, chunk_index, sort_order,
    };
    (schema, fields)
}

#[derive(Clone)]
pub struct TantivySiteSearch {
    reader: IndexReader,
    fields: RunnerTantivyFields,
    index: Index,
}

impl TantivySiteSearch {
    pub fn open(index_dir: &std::path::Path) -> anyhow::Result<Self> {
        let mmap_dir = MmapDirectory::open(index_dir)?;
        let index = Index::open(mmap_dir)?;

        let tokenizer = cms_search::tokenizer::JapaneseTokenizer::new();
        index.tokenizers().register(
            cms_search::tokenizer::JAPANESE_TOKENIZER_NAME,
            cms_search::tokenizer::LinderaTantivyTokenizer::with_tokenizer(tokenizer),
        );

        let reader = index.reader_builder()
            .reload_policy(ReloadPolicy::Manual)
            .try_into()?;

        let (_, fields) = build_runner_tantivy_schema();

        Ok(Self { reader, fields, index })
    }

    pub fn search(
        &self,
        query_str: &str,
        target_lang: Option<&str>,
        target_version: Option<&str>,
        limit: usize,
    ) -> anyhow::Result<Vec<SiteSearchHit>> {
        let searcher = self.reader.searcher();
        let fields = self.fields;

        let mut parser = QueryParser::for_index(&self.index, vec![fields.title, fields.description, fields.body]);
        parser.set_field_boost(fields.title, 2.5);
        parser.set_field_boost(fields.description, 1.5);
        parser.set_field_boost(fields.body, 1.0);

        let (text_query, _) = parser.parse_query_lenient(query_str);

        let mut clauses: Vec<(Occur, Box<dyn Query>)> = vec![(Occur::Must, text_query)];

        if let Some(ver) = target_version.filter(|s| !s.trim().is_empty()) {
            let term = Term::from_field_text(fields.version_id, ver);
            clauses.push((Occur::Must, Box::new(TermQuery::new(term, IndexRecordOption::Basic))));
        }

        if let Some(lang) = target_lang.filter(|s| !s.trim().is_empty()) {
            let term = Term::from_field_text(fields.language, lang);
            clauses.push((Occur::Must, Box::new(TermQuery::new(term, IndexRecordOption::Basic))));
        }

        let boolean_query = BooleanQuery::new(clauses);
        let top_docs = searcher.search(&boolean_query, &TopDocs::with_limit(limit))?;

        let snippet_generator = SnippetGenerator::create(&searcher, &boolean_query, fields.body).ok();

        let mut hits = Vec::new();
        for (score, doc_addr) in top_docs {
            let doc: TantivyDocument = searcher.doc(doc_addr)?;
            let page_id = doc.get_first(fields.page_id).and_then(|v| v.as_str()).unwrap_or_default().to_string();
            let title = doc.get_first(fields.title).and_then(|v| v.as_str()).unwrap_or_default().to_string();
            let path = doc.get_first(fields.path).and_then(|v| v.as_str()).unwrap_or_default().to_string();
            let description = doc.get_first(fields.description).and_then(|v| v.as_str()).unwrap_or_default().to_string();
            let language = doc.get_first(fields.language).and_then(|v| v.as_str()).unwrap_or("en").to_string();

            let snippet = if let Some(ref gen) = snippet_generator {
                let snip = gen.snippet_from_doc(&doc);
                if !snip.is_empty() {
                    snip.to_html()
                } else {
                    description.clone()
                }
            } else {
                description.clone()
            };

            hits.push(SiteSearchHit {
                id: page_id,
                title,
                path,
                description,
                icon: None,
                snippet,
                score: score as f64,
                language,
            });
        }

        Ok(hits)
    }
}
```

- [ ] **Step 4: Update `AppState` and `/api/v1/search` handler**

```rust
#[derive(Clone)]
struct AppState {
    db: SqlitePool,
    search: Option<std::sync::Arc<TantivySiteSearch>>,
}
```

In `api_search`:
If `state.search` is `Some(s)`, invoke `s.search(...)`. If it returns results or is present, return Tantivy hits. If `state.search` is `None`, fall back to `execute_search(&state.db, ...)`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cargo test -p cms-runner --lib test_runner_tantivy_search_execution`
Expected: PASS

- [ ] **Step 6: Commit runner Tantivy implementation**

```bash
git add apps/runner/src/main.rs
git commit -m "feat(runner): implement TantivySiteSearch with mmap and multi-field BM25"
```

---

### Task 5: Runner Auto-Discovery & Bundle Unpacking

**Files:**
- Modify: `apps/runner/src/main.rs`
- Test: `apps/runner/src/main.rs:tests`

**Interfaces:**
- Consumes: CLI args `--dir`, `--db`, `--index-dir`, `--bundle`.
- Produces: `resolve_runner_paths(args: &Args) -> Result<(PathBuf, Option<PathBuf>), anyhow::Error>` locating SQLite db and optional Tantivy index dir.

- [ ] **Step 1: Write unit test for `resolve_runner_paths`**

Add to `apps/runner/src/main.rs` tests module:
```rust
#[test]
fn test_resolve_runner_paths_from_dir() {
    let temp = tempfile::tempdir().unwrap();
    let db_path = temp.path().join("docs.sqlite");
    std::fs::write(&db_path, b"mock sqlite").unwrap();
    let idx_dir = temp.path().join("search_index");
    std::fs::create_dir(&idx_dir).unwrap();

    let args = Args {
        db: PathBuf::from("docs.sqlite"),
        dir: Some(temp.path().to_path_buf()),
        index_dir: None,
        bundle: None,
        port: 8080,
        bind: "127.0.0.1".into(),
        network: false,
        cors_origin: None,
    };

    let (found_db, found_idx) = resolve_runner_paths(&args).unwrap();
    assert_eq!(found_db, db_path);
    assert_eq!(found_idx, Some(idx_dir));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p cms-runner --lib test_resolve_runner_paths_from_dir`
Expected: FAIL with `cannot find function 'resolve_runner_paths'`

- [ ] **Step 3: Implement `resolve_runner_paths` and bundle unpacking**

```rust
pub(crate) fn resolve_runner_paths(args: &Args) -> anyhow::Result<(PathBuf, Option<PathBuf>)> {
    // 1. If --bundle is specified, unpack to a folder next to the bundle or in temp
    if let Some(ref bundle_path) = args.bundle {
        if !bundle_path.exists() {
            anyhow::bail!("Bundle file not found: {}", bundle_path.display());
        }
        let unpack_dir = bundle_path.with_extension("unpacked");
        if !unpack_dir.exists() {
            std::fs::create_dir_all(&unpack_dir)?;
            let file = std::fs::File::open(bundle_path)?;
            let gz = flate2::read::GzDecoder::new(file);
            let mut archive = tar::Archive::new(gz);
            archive.unpack(&unpack_dir)?;
        }
        let db_file = unpack_dir.join("docs.sqlite");
        let idx_dir = unpack_dir.join("search_index");
        return Ok((db_file, idx_dir.exists().then_some(idx_dir)));
    }

    // 2. If --dir is specified
    if let Some(ref dir) = args.dir {
        let db_file = dir.join("docs.sqlite");
        let idx_dir = dir.join("search_index");
        return Ok((db_file, idx_dir.exists().then_some(idx_dir)));
    }

    // 3. If --db is specified
    let db_file = args.db.clone();
    let idx_dir = if let Some(ref explicit_idx) = args.index_dir {
        Some(explicit_idx.clone())
    } else {
        // Auto-discover sibling directory
        let sibling1 = db_file.parent().unwrap_or(std::path::Path::new(".")).join("search_index");
        let sibling2 = db_file.parent().unwrap_or(std::path::Path::new(".")).join("tantivy");
        if sibling1.exists() {
            Some(sibling1)
        } else if sibling2.exists() {
            Some(sibling2)
        } else {
            None
        }
    };

    Ok((db_file, idx_dir))
}
```

Wire `resolve_runner_paths` into `main()` in `apps/runner/src/main.rs`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p cms-runner --lib test_resolve_runner_paths_from_dir`
Expected: PASS

- [ ] **Step 5: Commit runner path resolution**

```bash
git add apps/runner/src/main.rs
git commit -m "feat(runner): implement resolve_runner_paths for --dir, --bundle, and auto-discovery"
```

---

### Task 6: Full Workspace Verification & Benchmark Run

**Files:**
- Test: `crates/cms-biz/src/export.rs`
- Test: `apps/runner/src/main.rs`
- Script: `scripts/run-export-benchmark.ts`

- [ ] **Step 1: Run all tests in `cms-biz` and `apps/runner`**

Run: `cargo test -p cms-biz -p cms-runner`
Expected: All tests pass with zero failures.

- [ ] **Step 2: Run workspace check**

Run: `cargo check --workspace`
Expected: Exits 0 with zero compile errors.

- [ ] **Step 3: Commit all verified changes**

```bash
git add -A
git commit -m "chore: verify isolated sqlite with tantivy export and runner integration"
```
