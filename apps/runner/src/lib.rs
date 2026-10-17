use std::{collections::HashMap, path::PathBuf, sync::Arc};

pub mod windows;
pub mod mcp;
pub mod diagnostics;
pub mod sync;

pub use sync::{run_sync, SyncArgs};

use axum::{
    extract::{Query, State},
    http::{header, StatusCode},
    response::{Html, IntoResponse, Response},
    routing::get,
    Json, Router,
};
use clap::{Parser, Subcommand};
use rust_embed::Embed;
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use tantivy::{
    collector::TopDocs,
    directory::MmapDirectory,
    query::{BooleanQuery, Occur, Query as TantivyQuery, QueryParser, TermQuery},
    schema::{
        Field, IndexRecordOption, NumericOptions, Schema, TextFieldIndexing, TextOptions, Value,
        STRING,
    },
    snippet::SnippetGenerator,
    Index, IndexReader, ReloadPolicy, TantivyDocument, Term,
};

#[derive(Embed)]
#[folder = "../../dist/reader/"]
struct EmbeddedSite;

#[derive(Parser, Debug, Clone)]
#[command(
    name = "cms-site",
    author,
    version,
    about = "Portable single-binary documentation site runner with embedded MCP server"
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Commands>,

    #[command(flatten)]
    pub serve: ServeArgs,
}

#[derive(Subcommand, Debug, Clone)]
pub enum Commands {
    /// Start the HTTP documentation server (default command)
    Serve(ServeArgs),

    /// Run diagnostic checks on SQLite database, Tantivy search index, Windows registry, and port availability
    Doctor(DoctorArgs),

    /// Automatically download and sync the latest documentation export from hosted API server
    Sync(SyncArgs),

    /// Run the embedded Model Context Protocol (MCP) server over stdio for AI agents
    Mcp(McpCliArgs),

    /// Open a documentation page or custom ID directly in your default browser
    Open(OpenArgs),

    /// Install cms-site to user PATH and register cms-doc:// protocol in Windows registry
    Install,

    /// Remove cms-site from user PATH and unregister cms-doc:// protocol in Windows registry
    Uninstall,
}

#[derive(Parser, Debug, Clone)]
pub struct ServeArgs {
    /// Path to the exported SQLite database
    #[arg(short, long, default_value = "docs.sqlite")]
    pub db: PathBuf,

    /// Path to a site export directory containing docs.sqlite and search_index/
    #[arg(long)]
    pub dir: Option<PathBuf>,

    /// Explicit path to Tantivy search index directory
    #[arg(long, visible_alias = "search-index")]
    pub index_dir: Option<PathBuf>,

    /// Path to a .tar.gz site bundle archive to unpack and run
    #[arg(long)]
    pub bundle: Option<PathBuf>,

    /// HTTP port to bind to
    #[arg(short, long, default_value_t = 8080)]
    pub port: u16,

    /// Host or IP address to bind to (defaults to 127.0.0.1 for local isolation)
    #[arg(long, visible_alias = "host", default_value = "127.0.0.1")]
    pub bind: String,

    /// Expose the server to the local network (binds to 0.0.0.0 unless --bind is explicitly set)
    #[arg(long)]
    pub network: bool,

    /// Allowed CORS origin when exposing over network (e.g. "https://docs.example.com")
    #[arg(long, visible_alias = "allowed-origin")]
    pub cors_origin: Option<String>,
}

pub type Args = ServeArgs;

#[derive(Parser, Debug, Clone)]
pub struct McpCliArgs {
    /// Path to the exported SQLite database
    #[arg(short, long, default_value = "docs.sqlite")]
    pub db: PathBuf,

    /// Path to a site export directory containing docs.sqlite and search_index/
    #[arg(long)]
    pub dir: Option<PathBuf>,

    /// Explicit path to Tantivy search index directory
    #[arg(long, visible_alias = "search-index")]
    pub index_dir: Option<PathBuf>,

    /// Path to a .tar.gz site bundle archive to unpack and run
    #[arg(long)]
    pub bundle: Option<PathBuf>,

    /// Base URL of the running documentation server for opening links
    #[arg(long, default_value = "http://localhost:8080")]
    pub server_url: String,

    /// Log level for stderr logging (error, warn, info, debug, trace)
    #[arg(long, default_value = "info")]
    pub log_level: String,
}

#[derive(Parser, Debug, Clone)]
pub struct OpenArgs {
    /// Document UUID, custom ID (e.g., 'auth-guide'), path, or 'cms-doc://<id>' URL
    pub id: String,

    /// Optional documentation version slug or ID
    #[arg(short, long)]
    pub version: Option<String>,

    /// Optional language code (e.g., 'ja', 'en')
    #[arg(short, long)]
    pub lang: Option<String>,

    /// Port of the running documentation server (default: 8080)
    #[arg(short, long, default_value_t = 8080)]
    pub port: u16,

    /// Base URL of the running documentation server
    #[arg(long, default_value = "http://localhost:8080")]
    pub server_url: String,
}

#[derive(Parser, Debug, Clone)]
pub struct DoctorArgs {
    /// Path to the exported SQLite database
    #[arg(short, long, default_value = "docs.sqlite")]
    pub db: PathBuf,

    /// Path to a site export directory containing docs.sqlite and search_index/
    #[arg(long)]
    pub dir: Option<PathBuf>,

    /// Explicit path to Tantivy search index directory
    #[arg(long, visible_alias = "search-index")]
    pub index_dir: Option<PathBuf>,

    /// Path to a .tar.gz site bundle archive to inspect
    #[arg(long)]
    pub bundle: Option<PathBuf>,

    /// Target HTTP port to check for conflicts (default: 8080)
    #[arg(short, long, default_value_t = 8080)]
    pub port: u16,
}

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

impl RunnerTantivyFields {
    pub fn build_schema() -> (Schema, Self) {
        let mut builder = Schema::builder();
        let id = builder.add_text_field("id", STRING | tantivy::schema::STORED);
        let page_id = builder.add_text_field(
            "page_id",
            STRING | tantivy::schema::STORED | tantivy::schema::FAST,
        );
        let version_id = builder.add_text_field(
            "version_id",
            STRING | tantivy::schema::STORED | tantivy::schema::FAST,
        );
        let language = builder.add_text_field(
            "language",
            STRING | tantivy::schema::STORED | tantivy::schema::FAST,
        );

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

    pub fn from_schema(schema: &Schema) -> anyhow::Result<Self> {
        let id = schema
            .get_field("id")
            .map_err(|_| anyhow::anyhow!("field 'id' missing in tantivy schema"))?;
        let page_id = schema
            .get_field("page_id")
            .map_err(|_| anyhow::anyhow!("field 'page_id' missing in tantivy schema"))?;
        let version_id = schema
            .get_field("version_id")
            .map_err(|_| anyhow::anyhow!("field 'version_id' missing in tantivy schema"))?;
        let language = schema
            .get_field("language")
            .map_err(|_| anyhow::anyhow!("field 'language' missing in tantivy schema"))?;
        let title = schema
            .get_field("title")
            .map_err(|_| anyhow::anyhow!("field 'title' missing in tantivy schema"))?;
        let path = schema
            .get_field("path")
            .map_err(|_| anyhow::anyhow!("field 'path' missing in tantivy schema"))?;
        let description = schema
            .get_field("description")
            .map_err(|_| anyhow::anyhow!("field 'description' missing in tantivy schema"))?;
        let body = schema
            .get_field("body")
            .map_err(|_| anyhow::anyhow!("field 'body' missing in tantivy schema"))?;
        let chunk_index = schema
            .get_field("chunk_index")
            .map_err(|_| anyhow::anyhow!("field 'chunk_index' missing in tantivy schema"))?;
        let sort_order = schema
            .get_field("sort_order")
            .map_err(|_| anyhow::anyhow!("field 'sort_order' missing in tantivy schema"))?;

        Ok(Self {
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
        })
    }
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

        let fields = RunnerTantivyFields::from_schema(&index.schema())?;

        let reader = index
            .reader_builder()
            .reload_policy(ReloadPolicy::Manual)
            .try_into()?;

        Ok(Self {
            reader,
            fields,
            index,
        })
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

        let mut parser = QueryParser::for_index(
            &self.index,
            vec![fields.title, fields.description, fields.body],
        );
        parser.set_field_boost(fields.title, 2.5);
        parser.set_field_boost(fields.description, 1.5);
        parser.set_field_boost(fields.body, 1.0);

        let (text_query, _) = parser.parse_query_lenient(query_str);
        let (snippet_query, _) = parser.parse_query_lenient(query_str);

        let mut clauses: Vec<(Occur, Box<dyn TantivyQuery>)> = vec![(Occur::Must, text_query)];

        if let Some(ver) = target_version.filter(|s| !s.trim().is_empty()) {
            let term = Term::from_field_text(fields.version_id, ver);
            clauses.push((Occur::Must, Box::new(TermQuery::new(term, IndexRecordOption::Basic))));
        }

        if let Some(lang) = target_lang.filter(|s| !s.trim().is_empty()) {
            let term = Term::from_field_text(fields.language, lang);
            clauses.push((Occur::Must, Box::new(TermQuery::new(term, IndexRecordOption::Basic))));
        }

        let boolean_query: Box<dyn TantivyQuery> = Box::new(BooleanQuery::new(clauses));
        let top_docs = searcher.search(
            &*boolean_query,
            &TopDocs::with_limit(limit).order_by_score(),
        )?;

        let snippet_generator =
            SnippetGenerator::create(&searcher, &*snippet_query, fields.body).ok();

        let mut hits = Vec::new();
        for (score, doc_addr) in top_docs {
            let doc: TantivyDocument = searcher.doc(doc_addr)?;
            let page_id = doc
                .get_first(fields.page_id)
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            let title = doc
                .get_first(fields.title)
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            let path = doc
                .get_first(fields.path)
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            let description = doc
                .get_first(fields.description)
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            let language = doc
                .get_first(fields.language)
                .and_then(|v| v.as_str())
                .unwrap_or("en")
                .to_string();

            let snippet = if let Some(ref gen) = snippet_generator {
                let snip = gen.snippet_from_doc(&doc);
                if !snip.is_empty() {
                    snip.to_html()
                        .replace("<b>", "<mark>")
                        .replace("</b>", "</mark>")
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

pub fn resolve_runner_paths(args: &Args) -> anyhow::Result<(PathBuf, Option<PathBuf>)> {
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
        let sibling1 = db_file
            .parent()
            .unwrap_or(std::path::Path::new("."))
            .join("search_index");
        let sibling2 = db_file
            .parent()
            .unwrap_or(std::path::Path::new("."))
            .join("tantivy");
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

#[derive(Clone)]
pub struct AppState {
    inner: Arc<tokio::sync::RwLock<InnerState>>,
    pub db_path: Option<PathBuf>,
    pub idx_dir: Option<PathBuf>,
}

#[derive(Clone)]
pub struct InnerState {
    pub db: SqlitePool,
    pub search: Option<Arc<TantivySiteSearch>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReloadStats {
    pub project_name: String,
    pub page_count: i64,
    pub schema_version: i32,
}

impl AppState {
    pub fn new(db: SqlitePool, search: Option<Arc<TantivySiteSearch>>) -> Self {
        Self {
            inner: Arc::new(tokio::sync::RwLock::new(InnerState { db, search })),
            db_path: None,
            idx_dir: None,
        }
    }

    pub fn with_paths(
        db: SqlitePool,
        search: Option<Arc<TantivySiteSearch>>,
        db_path: PathBuf,
        idx_dir: Option<PathBuf>,
    ) -> Self {
        Self {
            inner: Arc::new(tokio::sync::RwLock::new(InnerState { db, search })),
            db_path: Some(db_path),
            idx_dir,
        }
    }

    pub async fn get_db(&self) -> SqlitePool {
        self.inner.read().await.db.clone()
    }

    pub async fn get_search(&self) -> Option<Arc<TantivySiteSearch>> {
        self.inner.read().await.search.clone()
    }

    pub async fn reload(&self) -> anyhow::Result<ReloadStats> {
        let db_path = self.db_path.as_ref().ok_or_else(|| {
            anyhow::anyhow!("Cannot reload: no database path was configured for this server instance")
        })?;

        if !db_path.exists() {
            anyhow::bail!("Cannot reload: database file not found at {}", db_path.display());
        }

        let opts = sqlx::sqlite::SqliteConnectOptions::new()
            .filename(db_path)
            .read_only(true);

        let new_pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(10)
            .connect_with(opts)
            .await?;

        let meta_row = sqlx::query("SELECT schema_version, project_name FROM export_meta LIMIT 1")
            .fetch_one(&new_pool)
            .await?;
        let schema_ver: i32 = meta_row.try_get(0)?;
        if schema_ver != 1 {
            anyhow::bail!("Unsupported schema_version {} (expected 1)", schema_ver);
        }
        let project_name: String = meta_row.try_get(1).unwrap_or_else(|_| "Documentation".into());

        let page_count: i64 = sqlx::query("SELECT COUNT(*) FROM pages")
            .fetch_one(&new_pool)
            .await
            .and_then(|r| r.try_get(0))
            .unwrap_or(0);

        let new_search = if let Some(ref idx_path) = self.idx_dir {
            match TantivySiteSearch::open(idx_path) {
                Ok(s) => Some(Arc::new(s)),
                Err(e) => {
                    tracing::warn!(
                        "Failed to reload Tantivy index at {}: {}. Using SQLite FTS5.",
                        idx_path.display(),
                        e
                    );
                    None
                }
            }
        } else {
            None
        };

        {
            let mut write = self.inner.write().await;
            write.db = new_pool;
            write.search = new_search;
        }

        tracing::info!(
            "Hot reload complete: reloaded '{}' ({} pages) from {}",
            project_name,
            page_count,
            db_path.display()
        );

        Ok(ReloadStats {
            project_name,
            page_count,
            schema_version: schema_ver,
        })
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NavNode {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub path: String,
    pub icon: Option<String>,
    pub tag: Option<String>,
    pub children: Vec<NavNode>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LanguageItem {
    pub code: String,
    pub label: String,
    pub direction: String,
    pub is_default: bool,
    pub enabled: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VersionItem {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub is_default: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMetadata {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub config: Option<serde_json::Value>,
    pub primary_domain: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SiteShell {
    pub project: ProjectMetadata,
    pub nav: Vec<NavNode>,
    pub languages: Vec<LanguageItem>,
    pub versions: Vec<VersionItem>,
    pub active_language: String,
    pub active_version: String,
    pub language_config: Option<serde_json::Value>,
    pub version: i64,
    pub generated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HeadingItem {
    pub depth: u32,
    pub text: String,
    pub id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PageDetails {
    pub id: String,
    pub created_at: String,
    pub updated_at: String,
    pub title: String,
    pub description: Option<String>,
    pub excerpt: String,
    pub icon: Option<String>,
    pub path: String,
    pub content: String,
    pub headings: Vec<HeadingItem>,
    pub config: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PageLanguageItem {
    pub code: String,
    pub is_default: bool,
    pub path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BreadcrumbItem {
    pub title: String,
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AdjacentPage {
    pub title: String,
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SitePageResponse {
    pub project: ProjectMetadata,
    pub page: PageDetails,
    pub active_language: String,
    pub active_version: String,
    pub versions: Vec<VersionItem>,
    pub language_config: Option<serde_json::Value>,
    pub languages: Vec<PageLanguageItem>,
    pub breadcrumbs: Vec<BreadcrumbItem>,
    pub prev: Option<AdjacentPage>,
    pub next: Option<AdjacentPage>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ChangelogEntry {
    version: i64,
    date: Option<String>,
    title: String,
    pages: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SiteSearchHit {
    pub id: String,
    pub title: String,
    pub path: String,
    pub description: String,
    pub icon: Option<String>,
    pub snippet: String,
    pub score: f64,
    pub language: String,
}

#[derive(Debug, Deserialize)]
struct BootstrapQuery {
    lang: Option<String>,
    version: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PageQuery {
    path: Option<String>,
    lang: Option<String>,
    version: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SearchQuery {
    q: Option<String>,
    lang: Option<String>,
    version: Option<String>,
    limit: Option<usize>,
}

// ── Database Queries ─────────────────────────────────────────────────────────

pub async fn query_bootstrap(
    pool: &SqlitePool,
    target_lang: Option<&str>,
    target_version: Option<&str>,
) -> anyhow::Result<SiteShell> {
    // 1. Project metadata
    let meta_row = sqlx::query(
        "SELECT project_id, project_name, project_slug, exported_at FROM export_meta LIMIT 1",
    )
    .fetch_one(pool)
    .await?;
    let project_id: String = meta_row.try_get(0)?;
    let project_name: String = meta_row.try_get(1)?;
    let project_slug: String = meta_row.try_get(2)?;
    let exported_at: String = meta_row.try_get(3)?;

    let mut project_config = serde_json::Map::new();
    let config_rows = sqlx::query("SELECT key, value FROM project_config")
        .fetch_all(pool)
        .await?;
    for r in config_rows {
        let k: String = r.try_get(0)?;
        let v: String = r.try_get(1)?;
        if let Ok(json_val) = serde_json::from_str(&v) {
            project_config.insert(k, json_val);
        } else {
            project_config.insert(k, serde_json::Value::String(v));
        }
    }

    let description = project_config
        .get("description")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let project = ProjectMetadata {
        id: project_id,
        name: project_name,
        slug: project_slug,
        description,
        config: Some(serde_json::Value::Object(project_config)),
        primary_domain: None,
    };

    // 2. Languages
    let mut languages = Vec::new();
    let mut default_lang = "en".to_string();
    let lang_rows = sqlx::query("SELECT code, label, is_default, is_rtl FROM languages")
        .fetch_all(pool)
        .await?;
    for r in lang_rows {
        let code: String = r.try_get(0)?;
        let label: String = r.try_get(1)?;
        let is_default: i32 = r.try_get(2)?;
        let is_rtl: i32 = r.try_get(3)?;
        let is_default_bool = is_default == 1;
        if is_default_bool {
            default_lang = code.clone();
        }
        languages.push(LanguageItem {
            code,
            label,
            direction: if is_rtl == 1 {
                "RTL".to_string()
            } else {
                "LTR".to_string()
            },
            is_default: is_default_bool,
            enabled: true,
        });
    }

    let active_language = if let Some(req_lang) = target_lang {
        if languages.iter().any(|l| l.code == req_lang) {
            req_lang.to_string()
        } else {
            default_lang.clone()
        }
    } else {
        default_lang.clone()
    };

    // 3. Versions
    let mut versions = Vec::new();
    let mut default_version_id = String::new();
    let mut default_version_slug = String::new();
    let ver_rows =
        sqlx::query("SELECT id, slug, label, is_default FROM versions ORDER BY sort_order ASC")
            .fetch_all(pool)
            .await?;
    for (idx, r) in ver_rows.into_iter().enumerate() {
        let id: String = r.try_get(0)?;
        let slug: String = r.try_get(1)?;
        let name: String = r.try_get(2)?;
        let is_default: i32 = r.try_get(3)?;
        let is_default_bool = is_default == 1;
        if is_default_bool || (idx == 0 && default_version_id.is_empty()) {
            default_version_id = id.clone();
            default_version_slug = slug.clone();
        }
        versions.push(VersionItem {
            id,
            name,
            slug,
            is_default: is_default_bool,
        });
    }

    let (active_version_id, active_version_slug) =
        if let Some(req_ver) = target_version.filter(|s| !s.trim().is_empty()) {
            if let Some(v) = versions
                .iter()
                .find(|v| v.slug == req_ver || v.id == req_ver)
            {
                (v.id.clone(), v.slug.clone())
            } else {
                anyhow::bail!("Version '{}' not found", req_ver);
            }
        } else {
            (default_version_id, default_version_slug)
        };

    // 4. Navigation tree for active version
    struct RawPageNode {
        id: String,
        parent_id: Option<String>,
        kind: String,
        title: String,
        path: String,
        icon: Option<String>,
        sort_order: i32,
    }

    let mut raw_pages = Vec::new();
    let page_rows = sqlx::query(
        "SELECT id, parent_id, kind, title, path, icon, sort_order FROM pages WHERE version_id = \
         ?1 ORDER BY sort_order ASC",
    )
    .bind(&active_version_id)
    .fetch_all(pool)
    .await?;

    for r in page_rows {
        raw_pages.push(RawPageNode {
            id: r.try_get(0)?,
            parent_id: r.try_get(1)?,
            kind: r.try_get(2)?,
            title: r.try_get(3)?,
            path: r.try_get(4)?,
            icon: r.try_get(5)?,
            sort_order: r.try_get(6)?,
        });
    }

    // Assemble tree
    let mut children_map: HashMap<Option<String>, Vec<RawPageNode>> = HashMap::new();
    for p in raw_pages {
        children_map.entry(p.parent_id.clone()).or_default().push(p);
    }

    fn build_nodes(
        parent_id: Option<String>,
        map: &mut HashMap<Option<String>, Vec<RawPageNode>>,
    ) -> Vec<NavNode> {
        let mut list = map.remove(&parent_id).unwrap_or_default();
        list.sort_by_key(|n| n.sort_order);
        list.into_iter()
            .map(|node| {
                let node_id = node.id.clone();
                let children = build_nodes(Some(node_id), map);
                NavNode {
                    id: node.id,
                    kind: node.kind,
                    title: node.title,
                    path: node.path,
                    icon: node.icon,
                    tag: None,
                    children,
                }
            })
            .collect()
    }

    let nav = build_nodes(None, &mut children_map);

    Ok(SiteShell {
        project,
        nav,
        languages,
        versions,
        active_language,
        active_version: active_version_slug,
        language_config: None,
        version: 1,
        generated_at: exported_at,
    })
}

fn extract_headings(markdown: &str) -> Vec<HeadingItem> {
    let mut headings = Vec::new();
    for line in markdown.lines() {
        let trimmed = line.trim();
        let depth = if trimmed.starts_with("### ") {
            3
        } else if trimmed.starts_with("## ") {
            2
        } else if trimmed.starts_with("# ") {
            1
        } else {
            0
        };

        if depth > 0 {
            let text = trimmed.trim_start_matches('#').trim().to_string();
            let id = text
                .to_lowercase()
                .chars()
                .map(|c| if c.is_alphanumeric() { c } else { '-' })
                .collect::<String>()
                .trim_matches('-')
                .to_string();

            headings.push(HeadingItem { depth, text, id });
        }
    }
    headings
}

pub async fn query_page(
    pool: &SqlitePool,
    target_path: &str,
    target_lang: Option<&str>,
    target_version: Option<&str>,
) -> anyhow::Result<Option<SitePageResponse>> {
    let bootstrap = match query_bootstrap(pool, target_lang, target_version).await {
        Ok(b) => b,
        Err(_) => return Ok(None),
    };

    if let Some(req_lang) = target_lang.filter(|s| !s.trim().is_empty()) {
        if !bootstrap.languages.iter().any(|l| l.code == req_lang) {
            return Ok(None);
        }
    }

    if let Some(req_ver) = target_version.filter(|s| !s.trim().is_empty()) {
        if !bootstrap
            .versions
            .iter()
            .any(|v| v.slug == req_ver || v.id == req_ver)
        {
            return Ok(None);
        }
    }

    let active_lang = bootstrap.active_language.clone();

    let active_version_item = match bootstrap
        .versions
        .iter()
        .find(|v| v.slug == bootstrap.active_version || v.id == bootstrap.active_version)
    {
        Some(v) => v,
        None => return Ok(None),
    };
    let active_version_id = &active_version_item.id;
    let active_version_slug = &active_version_item.slug;

    // Normalize path
    let normalized = target_path.trim().trim_matches('/');
    let path_candidates = if normalized.is_empty() {
        vec!["/".to_string(), "".to_string()]
    } else {
        vec![format!("/{}", normalized), normalized.to_string()]
    };

    // Find page record scoped strictly to active_version_id
    struct PageRow {
        id: String,
        version_id: String,
        parent_id: Option<String>,
        path: String,
        title: String,
        icon: Option<String>,
    }

    let mut found_page: Option<PageRow> = None;
    for cand in &path_candidates {
        let row_opt = sqlx::query(
            "SELECT id, version_id, parent_id, path, title, icon FROM pages WHERE version_id = \
             ?1 AND path = ?2 LIMIT 1",
        )
        .bind(active_version_id)
        .bind(cand)
        .fetch_optional(pool)
        .await?;

        if let Some(r) = row_opt {
            found_page = Some(PageRow {
                id: r.try_get(0)?,
                version_id: r.try_get(1)?,
                parent_id: r.try_get(2)?,
                path: r.try_get(3)?,
                title: r.try_get(4)?,
                icon: r.try_get(5)?,
            });
            break;
        }
    }

    let page_row = match found_page {
        Some(p) => p,
        None => return Ok(None),
    };

    // Query content for the page specifically for active_lang (no cross-language fallback)
    let content_opt = sqlx::query(
        "SELECT markdown, description, updated_at FROM page_content WHERE page_id = ?1 AND \
         language = ?2 LIMIT 1",
    )
    .bind(&page_row.id)
    .bind(&active_lang)
    .fetch_optional(pool)
    .await?;

    let (markdown, description, updated_at): (String, Option<String>, String) = match content_opt {
        Some(r) => (
            r.try_get(0)?,
            r.try_get(1)?,
            r.try_get(2)?,
        ),
        None => return Ok(None),
    };

    let headings = extract_headings(&markdown);
    let excerpt = description
        .clone()
        .or_else(|| {
            markdown
                .lines()
                .find(|l| !l.trim().is_empty() && !l.starts_with('#'))
                .map(|l| l.trim().to_string())
        })
        .unwrap_or_default();

    // Query breadcrumbs
    let mut breadcrumbs = Vec::new();
    let mut curr_parent = page_row.parent_id.clone();
    while let Some(parent_id) = curr_parent {
        let row_opt =
            sqlx::query("SELECT title, path, parent_id FROM pages WHERE id = ?1 LIMIT 1")
                .bind(&parent_id)
                .fetch_optional(pool)
                .await?;
        if let Some(r) = row_opt {
            breadcrumbs.push(BreadcrumbItem {
                title: r.try_get(0)?,
                path: r.try_get(1)?,
            });
            curr_parent = r.try_get(2)?;
        } else {
            break;
        }
    }
    breadcrumbs.reverse();
    breadcrumbs.push(BreadcrumbItem {
        title: page_row.title.clone(),
        path: page_row.path.clone(),
    });

    // Query prev & next siblings in version
    let mut siblings = Vec::new();
    let sib_rows = sqlx::query(
        "SELECT title, path FROM pages WHERE version_id = ?1 ORDER BY sort_order ASC",
    )
    .bind(&page_row.version_id)
    .fetch_all(pool)
    .await?;

    for r in sib_rows {
        siblings.push(AdjacentPage {
            title: r.try_get(0)?,
            path: r.try_get(1)?,
        });
    }

    let mut prev = None;
    let mut next = None;
    if let Some(idx) = siblings.iter().position(|s| s.path == page_row.path) {
        if idx > 0 {
            prev = Some(siblings[idx - 1].clone());
        }
        if idx + 1 < siblings.len() {
            next = Some(siblings[idx + 1].clone());
        }
    }

    let page_languages = bootstrap
        .languages
        .iter()
        .map(|l| PageLanguageItem {
            code: l.code.clone(),
            is_default: l.is_default,
            path: Some(page_row.path.clone()),
        })
        .collect();

    Ok(Some(SitePageResponse {
        project: bootstrap.project,
        page: PageDetails {
            id: page_row.id,
            created_at: bootstrap.generated_at.clone(),
            updated_at,
            title: page_row.title,
            description,
            excerpt,
            icon: page_row.icon,
            path: page_row.path,
            content: markdown,
            headings,
            config: None,
        },
        active_language: active_lang,
        active_version: active_version_slug.clone(),
        versions: bootstrap.versions,
        language_config: None,
        languages: page_languages,
        breadcrumbs,
        prev,
        next,
    }))
}


// ── HTTP Handlers ────────────────────────────────────────────────────────────

async fn healthz() -> impl IntoResponse {
    Json(serde_json::json!({ "ok": true }))
}

async fn query_changelog(pool: &SqlitePool) -> Vec<ChangelogEntry> {
    let mut entries = Vec::new();
    if let Ok(rows) = sqlx::query(
        "SELECT slug, title, published_at FROM changelog ORDER BY published_at DESC",
    )
    .fetch_all(pool)
    .await
    {
        for (idx, r) in rows.into_iter().enumerate() {
            let title: String = r.try_get(1).unwrap_or_default();
            let date: Option<String> = r.try_get(2).ok();
            entries.push(ChangelogEntry {
                version: (idx + 1) as i64,
                date,
                title,
                pages: 1,
            });
        }
    }
    entries
}

pub async fn execute_search(
    pool: &SqlitePool,
    clean_q: &str,
    limit: usize,
    target_lang: Option<&str>,
    target_version: Option<&str>,
) -> anyhow::Result<Vec<SiteSearchHit>> {
    let fts_query = clean_q
        .split_whitespace()
        .map(|w| format!("\"{}\"*", w.replace('\"', "")))
        .filter(|w| w != "\"\"*")
        .collect::<Vec<_>>()
        .join(" ");

    if fts_query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let resolved_version_id = if let Some(req_ver) = target_version.filter(|s| !s.trim().is_empty())
    {
        let row_opt = sqlx::query("SELECT id FROM versions WHERE slug = ?1 OR id = ?1 LIMIT 1")
            .bind(req_ver)
            .fetch_optional(pool)
            .await?;
        if let Some(r) = row_opt {
            Some(r.try_get::<String, _>(0)?)
        } else {
            return Ok(Vec::new());
        }
    } else {
        None
    };

    let clean_lang = target_lang.filter(|s| !s.trim().is_empty());

    let mut builder = sqlx::QueryBuilder::<sqlx::Sqlite>::new(
        r#"
        SELECT p.id, p.title, p.path, p.icon, c.description,
               snippet(page_fts, 4, '<mark>', '</mark>', '...', 12) as snippet,
               f.language,
               f.rank
        FROM page_fts f
        JOIN pages p ON p.id = f.page_id
        LEFT JOIN page_content c ON c.page_id = p.id AND c.language = f.language
        WHERE page_fts MATCH 
        "#,
    );

    builder.push_bind(fts_query);

    if let Some(vid) = resolved_version_id {
        builder.push(" AND p.version_id = ");
        builder.push_bind(vid);
    }

    if let Some(lang) = clean_lang {
        builder.push(" AND f.language = ");
        builder.push_bind(lang.to_string());
    }

    builder.push(" ORDER BY f.rank ASC, p.sort_order ASC, p.id ASC LIMIT ");
    builder.push_bind(limit as i64);

    let rows = builder.build().fetch_all(pool).await?;

    let mut hits = Vec::new();
    for r in rows {
        let rank: f64 = r.try_get(7)?;
        let desc: Option<String> = r.try_get(4)?;
        let snippet: Option<String> = r.try_get(5)?;
        hits.push(SiteSearchHit {
            id: r.try_get(0)?,
            title: r.try_get(1)?,
            path: r.try_get(2)?,
            icon: r.try_get(3)?,
            description: desc.unwrap_or_default(),
            snippet: snippet.unwrap_or_default(),
            score: -rank,
            language: r.try_get(6)?,
        });
    }

    Ok(hits)
}

async fn query_asset_from_db(pool: &SqlitePool, clean_path: &str) -> Option<(String, Vec<u8>)> {
    let candidates = [
        clean_path.to_string(),
        format!("assets/{}", clean_path),
        format!("/{}", clean_path),
    ];

    for cand in &candidates {
        let row_opt = sqlx::query("SELECT mime_type, data FROM assets WHERE path = ?1 LIMIT 1")
            .bind(cand)
            .fetch_optional(pool)
            .await
            .ok()
            .flatten();
        if let Some(r) = row_opt {
            let mime: String = r.try_get(0).ok()?;
            let data: Vec<u8> = r.try_get(1).ok()?;
            return Some((mime, data));
        }
    }

    None
}

async fn api_bootstrap(
    State(state): State<AppState>,
    Query(query): Query<BootstrapQuery>,
) -> Response {
    let db = state.get_db().await;
    let lang = query.lang;
    let version = query.version;

    match query_bootstrap(&db, lang.as_deref(), version.as_deref()).await {
        Ok(shell) => Json(shell).into_response(),
        Err(e) => {
            tracing::warn!("Failed to query bootstrap: {}", e);
            (
                StatusCode::NOT_FOUND,
                "Site configuration or version not found",
            )
                .into_response()
        }
    }
}

async fn api_page(State(state): State<AppState>, Query(query): Query<PageQuery>) -> Response {
    let db = state.get_db().await;
    let path = query.path.unwrap_or_else(|| "/".to_string());
    let lang = query.lang;
    let version = query.version;

    match query_page(&db, &path, lang.as_deref(), version.as_deref()).await {
        Ok(Some(page)) => Json(page).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, "Page not found").into_response(),
        Err(e) => {
            tracing::error!("Failed to query page {}: {}", path, e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to load page").into_response()
        }
    }
}

async fn api_changelog(State(state): State<AppState>) -> Response {
    let db = state.get_db().await;
    let entries = query_changelog(&db).await;
    Json(entries).into_response()
}

async fn api_search(State(state): State<AppState>, Query(query): Query<SearchQuery>) -> Response {
    let raw_q = query.q.unwrap_or_default();
    let clean_q = raw_q.trim().to_string();
    if clean_q.is_empty() {
        return Json(serde_json::json!({ "hits": [] })).into_response();
    }
    let limit = query.limit.unwrap_or(20).min(50);
    let lang = query.lang;
    let version = query.version;

    let db = state.get_db().await;
    let search = state.get_search().await;

    if let Some(ref search_engine) = search {
        match search_engine.search(&clean_q, lang.as_deref(), version.as_deref(), limit) {
            Ok(hits) => return Json(serde_json::json!({ "hits": hits })).into_response(),
            Err(e) => {
                tracing::warn!("Tantivy search error ({}); falling back to SQLite FTS5", e);
            }
        }
    }

    match execute_search(&db, &clean_q, limit, lang.as_deref(), version.as_deref()).await {
        Ok(hits) => Json(serde_json::json!({ "hits": hits })).into_response(),
        Err(e) => {
            tracing::error!("Search query execution failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": "Search failed", "detail": e.to_string() })),
            )
                .into_response()
        }
    }
}

async fn api_reload(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Response {
    let host_header = headers
        .get(header::HOST)
        .and_then(|h| h.to_str().ok())
        .unwrap_or("");
    let host_name = host_header.split(':').next().unwrap_or("");

    if !is_loopback_host(host_name) {
        tracing::warn!("Blocked non-loopback reload request from host '{}'", host_header);
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({
                "error": "Forbidden: Hot reload is strictly restricted to loopback callers"
            })),
        )
            .into_response();
    }

    match state.reload().await {
        Ok(stats) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "reloaded": true,
                "stats": stats
            })),
        )
            .into_response(),
        Err(e) => {
            tracing::error!("Failed to reload site state: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": "Reload failed",
                    "detail": e.to_string()
                })),
            )
                .into_response()
        }
    }
}

async fn fast_path_redirect(
    State(state): State<AppState>,
    uri: axum::http::Uri,
    axum::extract::Path(raw_id): axum::extract::Path<String>,
) -> Response {
    let clean_id = raw_id.trim().trim_matches('/');
    if clean_id.is_empty() {
        return (StatusCode::BAD_REQUEST, "Missing identifier or path").into_response();
    }

    let db = state.get_db().await;

    // Try lookup: 1. by id, 2. by custom_id, 3. by path or slug
    let row_opt = sqlx::query(
        "SELECT id, kind, path FROM pages WHERE id = ?1 OR custom_id = ?1 OR path = ?1 OR path = ?2 OR slug = ?1 LIMIT 1",
    )
    .bind(clean_id)
    .bind(format!("/{}", clean_id))
    .fetch_optional(&db)
    .await;

    let (page_id, kind, mut target_path) = match row_opt {
        Ok(Some(row)) => {
            let id: String = row.try_get(0).unwrap_or_default();
            let kind: String = row.try_get(1).unwrap_or_default();
            let path: String = row.try_get(2).unwrap_or_default();
            (id, kind, path)
        }
        Ok(None) => {
            return (StatusCode::NOT_FOUND, "Document or group not found").into_response();
        }
        Err(e) => {
            tracing::error!("Failed to resolve fast-path ID '{}': {}", clean_id, e);
            return (StatusCode::INTERNAL_SERVER_ERROR, "Database error").into_response();
        }
    };

    // If target node is a GROUP, resolve to its first child leaf page
    if kind.eq_ignore_ascii_case("GROUP") {
        let child_opt = sqlx::query(
            "SELECT path FROM pages WHERE parent_id = ?1 AND kind = 'PAGE' ORDER BY sort_order ASC, id ASC LIMIT 1",
        )
        .bind(&page_id)
        .fetch_optional(&db)
        .await;

        match child_opt {
            Ok(Some(child_row)) => {
                if let Ok(child_path) = child_row.try_get::<String, _>(0) {
                    target_path = child_path;
                }
            }
            Ok(None) => {
                // If no direct child with kind='PAGE', try any first child (could be sub-group or document)
                if let Ok(Some(any_child)) = sqlx::query(
                    "SELECT id, kind, path FROM pages WHERE parent_id = ?1 ORDER BY sort_order ASC, id ASC LIMIT 1",
                )
                .bind(&page_id)
                .fetch_optional(&db)
                .await {
                    let child_id: String = any_child.try_get(0).unwrap_or_default();
                    let child_kind: String = any_child.try_get(1).unwrap_or_default();
                    let child_p: String = any_child.try_get(2).unwrap_or_default();
                    if child_kind.eq_ignore_ascii_case("GROUP") {
                        if let Ok(Some(leaf)) = sqlx::query(
                            "SELECT path FROM pages WHERE parent_id = ?1 AND kind = 'PAGE' ORDER BY sort_order ASC, id ASC LIMIT 1",
                        )
                        .bind(&child_id)
                        .fetch_optional(&db)
                        .await {
                            target_path = leaf.try_get(0).unwrap_or(child_p);
                        } else {
                            target_path = child_p;
                        }
                    } else {
                        target_path = child_p;
                    }
                }
            }
            Err(e) => {
                tracing::warn!("Failed to unwrap group child for '{}': {}", page_id, e);
            }
        }
    }

    // Preserve query parameters if present (e.g. ?lang=ja&version=v2)
    let redirect_url = if let Some(query) = uri.query() {
        format!("{}?{}", target_path, query)
    } else {
        target_path
    };

    (
        StatusCode::TEMPORARY_REDIRECT,
        [(header::LOCATION, redirect_url)],
    )
        .into_response()
}

async fn serve_asset(
    State(state): State<AppState>,
    axum::extract::Path(path): axum::extract::Path<String>,
) -> Response {
    let clean_path = path.trim().trim_start_matches('/');

    // 1. Check embedded files first (e.g. assets/index-DzLxQ1b4.js)
    let embedded_key = format!("assets/{}", clean_path);
    if let Some(file) = EmbeddedSite::get(&embedded_key) {
        let mime = mime_guess::from_path(&embedded_key).first_or_octet_stream();
        return (
            [
                (header::CONTENT_TYPE, mime.as_ref()),
                (header::CACHE_CONTROL, "public, max-age=31536000, immutable"),
            ],
            file.data,
        )
            .into_response();
    }

    // 2. Query SQLite assets table for uploaded images/attachments
    let db = state.get_db().await;
    match query_asset_from_db(&db, clean_path).await {
        Some((mime, data)) => (
            [
                (header::CONTENT_TYPE, mime),
                (header::CACHE_CONTROL, "public, max-age=86400".to_string()),
            ],
            data,
        )
            .into_response(),
        None => (StatusCode::NOT_FOUND, "Asset not found").into_response(),
    }
}

async fn serve_spa(State(state): State<AppState>, uri: axum::http::Uri) -> Response {
    // Check if the path directly matches a static embedded file (e.g. favicon, robots.txt)
    let req_path = uri.path().trim_start_matches('/');
    if !req_path.is_empty() {
        if let Some(file) = EmbeddedSite::get(req_path) {
            let mime = mime_guess::from_path(req_path).first_or_octet_stream();
            return ([(header::CONTENT_TYPE, mime.as_ref())], file.data).into_response();
        }
    }

    // Read index.html from embedded files
    let html_file = match EmbeddedSite::get("index.html") {
        Some(f) => f,
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Embedded index.html not found in binary",
            )
                .into_response();
        }
    };

    let raw_html = match std::str::from_utf8(&html_file.data) {
        Ok(s) => s,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Invalid UTF-8 in index.html",
            )
                .into_response()
        }
    };

    // Fast Bootstrap Injection into index.html
    let db = state.get_db().await;
    let shell = query_bootstrap(&db, None, None).await.ok();

    let injected_html = inject_bootstrap_and_meta(raw_html, shell.as_ref());
    Html(injected_html).into_response()
}

pub fn html_escape(input: &str) -> String {
    let mut out = String::with_capacity(input.len() + 16);
    for c in input.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#x27;"),
            other => out.push(other),
        }
    }
    out
}

pub fn escape_script_json(json: &str) -> String {
    let mut out = String::with_capacity(json.len() + 32);
    for c in json.chars() {
        match c {
            '<' => out.push_str(r"\u003c"),
            '>' => out.push_str(r"\u003e"),
            '&' => out.push_str(r"\u0026"),
            '\u{2028}' => out.push_str(r"\u2028"),
            '\u{2029}' => out.push_str(r"\u2029"),
            other => out.push(other),
        }
    }
    out
}

fn inject_bootstrap_script(html: &str, safe_json: &str) -> String {
    let script_tag = format!(
        r#"<script type="application/json" id="__bootstrap__">{}</script>"#,
        safe_json
    );

    // 1. Modern placeholder: <script type="application/json" id="__bootstrap__">...</script>
    if let Some(start) = html.find(r#"<script type="application/json" id="__bootstrap__">"#) {
        if let Some(end_rel) = html[start..].find("</script>") {
            let end = start + end_rel + "</script>".len();
            return format!("{}{}{}", &html[..start], script_tag, &html[end..]);
        }
    }

    // 2. Legacy placeholder: <script id="__SITE_BOOTSTRAP__">...</script>
    if let Some(start) = html.find(r#"<script id="__SITE_BOOTSTRAP__">"#) {
        if let Some(end_rel) = html[start..].find("</script>") {
            let end = start + end_rel + "</script>".len();
            return format!("{}{}{}", &html[..start], script_tag, &html[end..]);
        }
    }

    // 3. Comment placeholder
    if html.contains("<!-- __SITE_BOOTSTRAP__ -->") {
        return html.replace("<!-- __SITE_BOOTSTRAP__ -->", &script_tag);
    }

    // 4. Inject before </head>
    if let Some(pos) = html.find("</head>") {
        return format!("{}{}\n    {}", &html[..pos], script_tag, &html[pos..]);
    }

    // 5. Append as fallback
    format!("{}\n{}", html, script_tag)
}

fn inject_meta(html: &str, site_title: &str, site_desc: &str) -> String {
    let meta_tags = format!(
        "<title>{site_title}</title>\n    <meta name=\"description\" content=\"{site_desc}\" \
             />\n    <meta property=\"og:title\" content=\"{site_title}\" />\n    <meta \
             property=\"og:description\" content=\"{site_desc}\" />"
    );

    let mut working = html.to_string();

    if working.contains("<!-- __SITE_HEAD__ -->") {
        // Remove pre-existing default <title>...</title> to avoid duplicate title tags
        if let Some(start) = working.find("<title>") {
            if let Some(end_rel) = working[start..].find("</title>") {
                let end = start + end_rel + "</title>".len();
                let mut remove_end = end;
                if working[remove_end..].starts_with("\r\n") {
                    remove_end += 2;
                } else if working[remove_end..].starts_with('\n') {
                    remove_end += 1;
                }
                working.replace_range(start..remove_end, "");
            }
        }
        working.replace("<!-- __SITE_HEAD__ -->", &meta_tags)
    } else if let Some(start) = working.find("<title>") {
        if let Some(end_rel) = working[start..].find("</title>") {
            let end = start + end_rel + "</title>".len();
            format!("{}{}{}", &working[..start], meta_tags, &working[end..])
        } else {
            format!("{}\n{}", working, meta_tags)
        }
    } else if let Some(pos) = working.find("</head>") {
        format!("{}{}\n    {}", &working[..pos], meta_tags, &working[pos..])
    } else {
        format!("{}\n{}", working, meta_tags)
    }
}

pub fn inject_bootstrap_and_meta(raw_html: &str, shell: Option<&SiteShell>) -> String {
    let Some(s) = shell else {
        return raw_html.to_string();
    };

    let mut html = raw_html.to_string();

    if let Ok(raw_json) = serde_json::to_string(s) {
        let safe_json = escape_script_json(&raw_json);
        html = inject_bootstrap_script(&html, &safe_json);
    }

    let site_title = html_escape(&s.project.name);
    let site_desc = html_escape(s.project.description.as_deref().unwrap_or(""));
    inject_meta(&html, &site_title, &site_desc)
}

// ── Public Runners & Tracing ──────────────────────────────────────────────────

pub fn init_tracing(stderr_only: bool, default_level: &str) {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| format!("{},cms_site=debug", default_level).into());

    if stderr_only {
        tracing_subscriber::registry()
            .with(filter)
            .with(tracing_subscriber::fmt::layer().with_writer(std::io::stderr))
            .init();
    } else {
        tracing_subscriber::registry()
            .with(filter)
            .with(tracing_subscriber::fmt::layer())
            .init();
    }
}

pub fn parse_open_target(args: &OpenArgs) -> (String, Option<String>, Option<String>) {
    let mut raw = args.id.trim();
    if let Some(stripped) = raw.strip_prefix("cms-doc://") {
        raw = stripped;
    } else if let Some(stripped) = raw.strip_prefix("cms-doc:") {
        raw = stripped;
    }
    raw = raw.trim_matches('/');
    if let Some(stripped) = raw.strip_prefix("p/") {
        raw = stripped.trim_matches('/');
    }

    // Check if raw contains query parameters, e.g. "auth-guide?version=v2.0&lang=ja"
    let (id_part, url_query) = if let Some(q_pos) = raw.find('?') {
        (&raw[..q_pos], Some(&raw[q_pos + 1..]))
    } else {
        (raw, None)
    };

    let mut version = args.version.clone();
    let mut lang = args.lang.clone();

    if let Some(query_str) = url_query {
        for pair in query_str.split('&') {
            let mut parts = pair.splitn(2, '=');
            let key = parts.next().unwrap_or("").trim();
            let val = parts.next().unwrap_or("").trim();
            if key.eq_ignore_ascii_case("version") && version.is_none() && !val.is_empty() {
                version = Some(val.to_string());
            } else if key.eq_ignore_ascii_case("lang") && lang.is_none() && !val.is_empty() {
                lang = Some(val.to_string());
            }
        }
    }

    (id_part.to_string(), version, lang)
}

pub async fn run_open(args: OpenArgs) -> anyhow::Result<()> {
    let (clean_id, version_opt, lang_opt) = parse_open_target(&args);

    if clean_id.is_empty() {
        eprintln!("Error: No document ID, custom ID, or path specified.");
        std::process::exit(1);
    }

    let base_url = if args.server_url != "http://localhost:8080" {
        args.server_url.trim_end_matches('/').to_string()
    } else {
        format!("http://localhost:{}", args.port)
    };

    let mut query_params = Vec::new();
    if let Some(ref v) = version_opt {
        query_params.push(format!("version={}", v));
    }
    if let Some(ref l) = lang_opt {
        query_params.push(format!("lang={}", l));
    }

    let target_url = if query_params.is_empty() {
        format!("{}/p/{}", base_url, clean_id)
    } else {
        format!("{}/p/{}?{}", base_url, clean_id, query_params.join("&"))
    };

    println!("Opening documentation in default browser: {}", target_url);
    windows::open_url_in_browser(&target_url)?;
    Ok(())
}

pub async fn run_install() -> anyhow::Result<()> {
    let current_exe = std::env::current_exe()?;
    let bin_dir = current_exe
        .parent()
        .ok_or_else(|| anyhow::anyhow!("Failed to locate binary directory"))?;

    println!("Installing cms-site...");
    match windows::install_user_path(bin_dir) {
        Ok(true) => println!("✓ Added '{}' to user PATH (HKCU\\Environment).", bin_dir.display()),
        Ok(false) => println!("- '{}' is already in user PATH.", bin_dir.display()),
        Err(e) => eprintln!("! Warning: Could not update user PATH: {}", e),
    }

    match windows::register_protocol_handler(&current_exe) {
        Ok(()) => println!("✓ Registered 'cms-doc://' URL protocol scheme (HKCU\\Software\\Classes\\cms-doc)."),
        Err(e) => eprintln!("! Warning: Could not register protocol handler: {}", e),
    }

    println!("\nInstallation complete! You can now run 'cms-site' from anywhere or click 'cms-doc://' links.");
    Ok(())
}

pub async fn run_uninstall() -> anyhow::Result<()> {
    let current_exe = std::env::current_exe()?;
    let bin_dir = current_exe
        .parent()
        .ok_or_else(|| anyhow::anyhow!("Failed to locate binary directory"))?;

    println!("Uninstalling cms-site...");
    match windows::uninstall_user_path(bin_dir) {
        Ok(true) => println!("✓ Removed '{}' from user PATH.", bin_dir.display()),
        Ok(false) => println!("- '{}' was not present in user PATH.", bin_dir.display()),
        Err(e) => eprintln!("! Warning: Could not remove from user PATH: {}", e),
    }

    match windows::unregister_protocol_handler() {
        Ok(()) => println!("✓ Unregistered 'cms-doc://' URL protocol scheme."),
        Err(e) => eprintln!("! Warning: Could not unregister protocol handler: {}", e),
    }

    println!("\nUninstallation complete.");
    Ok(())
}

pub async fn run_doctor_cmd(args: DoctorArgs) -> anyhow::Result<bool> {
    let dummy_serve = ServeArgs {
        db: args.db,
        dir: args.dir,
        index_dir: args.index_dir,
        bundle: args.bundle,
        port: args.port,
        bind: "127.0.0.1".into(),
        network: false,
        cors_origin: None,
    };
    let (db_path, idx_dir_opt) = resolve_runner_paths(&dummy_serve)?;
    diagnostics::run_doctor(&db_path, idx_dir_opt.as_deref(), args.port).await
}

pub async fn run_mcp(args: McpCliArgs) -> anyhow::Result<()> {
    let dummy_serve = ServeArgs {
        db: args.db,
        dir: args.dir,
        index_dir: args.index_dir,
        bundle: args.bundle,
        port: 8080,
        bind: "127.0.0.1".into(),
        network: false,
        cors_origin: None,
    };
    let (db_path, idx_dir_opt) = resolve_runner_paths(&dummy_serve)?;

    if !db_path.exists() {
        eprintln!(
            "Error: Database file not found: {}\nPlease provide a valid CMS SQLite export using \
             --db <path>, --dir <path>, or --bundle <path.tar.gz>",
            db_path.display()
        );
        std::process::exit(1);
    }

    let opts = sqlx::sqlite::SqliteConnectOptions::new()
        .filename(&db_path)
        .read_only(true);

    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(10)
        .connect_with(opts)
        .await?;

    let search = if let Some(ref idx_dir) = idx_dir_opt {
        match TantivySiteSearch::open(idx_dir) {
            Ok(s) => Some(Arc::new(s)),
            Err(e) => {
                tracing::warn!("Failed to open Tantivy index: {}. Using SQLite FTS5.", e);
                None
            }
        }
    } else {
        None
    };

    tracing::info!("Starting cms-site MCP stdio server...");
    mcp::run_stdio(pool, search, args.server_url)
        .await
        .map_err(|e| anyhow::anyhow!("MCP server error: {}", e))?;

    Ok(())
}

pub async fn run_server(args: ServeArgs) -> anyhow::Result<()> {
    let (db_path, idx_dir_opt) = resolve_runner_paths(&args)?;

    if !db_path.exists() {
        eprintln!(
            "Error: Database file not found: {}\nPlease provide a valid CMS SQLite export using \
             --db <path>, --dir <path>, or --bundle <path.tar.gz>",
            db_path.display()
        );
        std::process::exit(1);
    }

    // Open SQLite connection pool in read-only mode
    let opts = sqlx::sqlite::SqliteConnectOptions::new()
        .filename(&db_path)
        .read_only(true);

    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(10)
        .connect_with(opts)
        .await
        .map_err(|e| {
            anyhow::anyhow!(
                "Failed to open SQLite database at {}: {}",
                db_path.display(),
                e
            )
        })?;

    // Validate schema version
    let meta_row = sqlx::query("SELECT schema_version, project_name FROM export_meta LIMIT 1")
        .fetch_one(&pool)
        .await
        .map_err(|e| {
            anyhow::anyhow!(
                "Failed to read schema_version from export_meta in {}: {}",
                db_path.display(),
                e
            )
        })?;

    let schema_version: i32 = meta_row.try_get(0)?;

    if schema_version != 1 {
        eprintln!(
            "Error: Unsupported schema_version {} (expected 1). Please re-export from a \
             compatible CMS version.",
            schema_version
        );
        std::process::exit(1);
    }

    let project_name: String = meta_row.try_get(1).unwrap_or_else(|_| "Documentation".to_string());

    tracing::info!(
        "Loaded project: '{}' (schema v{}) from {}",
        project_name,
        schema_version,
        db_path.display()
    );

    let search = if let Some(ref idx_dir) = idx_dir_opt {
        match TantivySiteSearch::open(idx_dir) {
            Ok(s) => {
                tracing::info!("Loaded Tantivy search index from {}", idx_dir.display());
                Some(Arc::new(s))
            }
            Err(e) => {
                tracing::warn!(
                    "Failed to open Tantivy index at {}: {}. Falling back to SQLite FTS5.",
                    idx_dir.display(),
                    e
                );
                None
            }
        }
    } else {
        tracing::info!("No Tantivy search index found; using SQLite FTS5 search.");
        None
    };

    let state = AppState::with_paths(pool, search, db_path, idx_dir_opt);

    let bind_host = resolve_bind_host(&args.bind, args.network);
    let maybe_cors = build_cors_layer(&bind_host, args.cors_origin.as_deref())?;

    let addr_str = format!("{}:{}", bind_host, args.port);
    let mut resolved_addrs = tokio::net::lookup_host(&addr_str)
        .await
        .map_err(|e| anyhow::anyhow!("Failed to resolve bind address '{}': {}", addr_str, e))?;
    let addr = resolved_addrs
        .next()
        .ok_or_else(|| anyhow::anyhow!("No socket addresses resolved for '{}'", addr_str))?;

    tracing::info!("Documentation site server listening on http://{}", addr);

    let app = create_runner_router(state, maybe_cors);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    tracing::info!("Server shut down gracefully.");
    Ok(())
}

pub fn is_loopback_host(host: &str) -> bool {
    if host.eq_ignore_ascii_case("localhost") {
        return true;
    }
    if let Ok(ip) = host.parse::<std::net::IpAddr>() {
        return ip.is_loopback();
    }
    false
}

pub fn resolve_bind_host(bind: &str, network: bool) -> String {
    if network && (bind == "127.0.0.1" || bind.is_empty()) {
        "0.0.0.0".to_string()
    } else {
        bind.to_string()
    }
}

pub fn build_cors_layer(
    bind_host: &str,
    cors_origin: Option<&str>,
) -> anyhow::Result<Option<CorsLayer>> {
    let is_loopback = is_loopback_host(bind_host);

    if is_loopback {
        if cors_origin.is_some() {
            tracing::warn!(
                "CORS origin configured on loopback binding ({}); enforcing same-origin policy \
                 without Access-Control-Allow-Origin",
                bind_host
            );
        }
        return Ok(None);
    }

    match cors_origin {
        Some(origin_str) if !origin_str.trim().is_empty() => {
            let mut origins = Vec::new();
            for part in origin_str.split(',') {
                let trimmed = part.trim();
                if !trimmed.is_empty() {
                    let val = trimmed
                        .parse::<axum::http::HeaderValue>()
                        .map_err(|e| anyhow::anyhow!("Invalid CORS origin '{}': {}", trimmed, e))?;
                    origins.push(val);
                }
            }
            if origins.is_empty() {
                Ok(None)
            } else {
                tracing::info!(
                    "Configuring CORS for network exposure with allowed origin(s): {}",
                    origin_str
                );
                let layer = CorsLayer::new()
                    .allow_origin(origins)
                    .allow_methods([
                        axum::http::Method::GET,
                        axum::http::Method::HEAD,
                        axum::http::Method::OPTIONS,
                    ])
                    .allow_headers([header::CONTENT_TYPE, header::ACCEPT]);
                Ok(Some(layer))
            }
        }
        _ => {
            tracing::info!(
                "Server exposed on network ({}) without explicit CORS origin; enforcing \
                 same-origin policy",
                bind_host
            );
            Ok(None)
        }
    }
}

pub fn create_runner_router(state: AppState, maybe_cors: Option<CorsLayer>) -> Router {
    let dummy_db = sqlx::sqlite::SqlitePoolOptions::new()
        .connect_lazy("sqlite::memory:")
        .expect("dummy pool");
    let mcp_service = mcp::create_mcp_http_service(
        dummy_db,
        None,
        "http://localhost:8080".to_string(),
        Some(state.clone()),
    );

    let mut app = Router::new()
        .route("/healthz", get(healthz))
        .route("/p/{*id_or_path}", get(fast_path_redirect))
        .route("/api/v1/bootstrap", get(api_bootstrap))
        .route("/api/v1/page", get(api_page))
        .route("/api/v1/changelog", get(api_changelog))
        .route("/api/v1/search", get(api_search))
        .route("/api/v1/reload", axum::routing::post(api_reload))
        .route("/assets/{*path}", get(serve_asset))
        .nest_service("/mcp", mcp_service)
        .fallback(get(serve_spa))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    if let Some(cors) = maybe_cors {
        app = app.layer(cors);
    }

    app
}

pub async fn shutdown_signal() {
    tokio::signal::ctrl_c()
        .await
        .expect("Failed to listen for Ctrl+C event");
    tracing::info!("Shutdown signal received, shutting down gracefully...");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_escape_script_json_escapes_dangerous_chars() {
        let original_data = serde_json::json!({
            "name": "</script><script>alert('xss')</script>",
            "sep": "\u{2028}\u{2029}",
            "amp": "&",
            "gt": ">"
        });
        let raw_json = serde_json::to_string(&original_data).expect("serialize");
        let escaped = escape_script_json(&raw_json);

        assert!(!escaped.contains('<'), "must not contain raw <");
        assert!(!escaped.contains('>'), "must not contain raw >");
        assert!(!escaped.contains('&'), "must not contain raw &");
        assert!(!escaped.contains('\u{2028}'), "must not contain raw U+2028");
        assert!(!escaped.contains('\u{2029}'), "must not contain raw U+2029");
        assert!(escaped.contains(r"\u003c/script\u003e"));

        // Must roundtrip through serde_json to original values
        let parsed: serde_json::Value = serde_json::from_str(&escaped).expect("must parse back");
        assert_eq!(
            parsed["name"].as_str().unwrap(),
            "</script><script>alert('xss')</script>"
        );
        assert_eq!(parsed["sep"].as_str().unwrap(), "\u{2028}\u{2029}");
        assert_eq!(parsed["amp"].as_str().unwrap(), "&");
        assert_eq!(parsed["gt"].as_str().unwrap(), ">");
    }

    #[test]
    fn test_html_escape_replaces_all_special_chars() {
        let malicious = r#"<script>alert("xss & 'more'")</script>"#;
        let escaped = html_escape(malicious);
        assert_eq!(
            escaped,
            "&lt;script&gt;alert(&quot;xss &amp; &#x27;more&#x27;&quot;)&lt;/script&gt;"
        );
        assert!(!escaped.contains('<'));
        assert!(!escaped.contains('>'));
        assert!(!escaped.contains('"'));
        assert!(!escaped.contains('\''));
    }

    #[test]
    fn test_inject_bootstrap_and_meta_prevents_xss() {
        let shell = SiteShell {
            project: ProjectMetadata {
                id: "proj_123".to_string(),
                name: r#"Evil <Project> "</script><script>alert('xss')</script>""#.to_string(),
                slug: "evil-project".to_string(),
                description: Some(
                    r#"Description with "quotes", <tags>, & ampersand, and line break \u{2028}."#
                        .to_string(),
                ),
                config: Some(serde_json::json!({
                    "custom": "</script><img src=x onerror=alert(1)>"
                })),
                primary_domain: None,
            },
            nav: vec![],
            languages: vec![LanguageItem {
                code: "en".to_string(),
                label: "English".to_string(),
                direction: "LTR".to_string(),
                is_default: true,
                enabled: true,
            }],
            versions: vec![VersionItem {
                id: "v1".to_string(),
                name: "v1.0".to_string(),
                slug: "v1.0".to_string(),
                is_default: true,
            }],
            active_language: "en".to_string(),
            active_version: "v1.0".to_string(),
            language_config: None,
            version: 1,
            generated_at: "2026-10-05T00:00:00Z".to_string(),
        };

        // Test modern template
        let template_modern = r#"<!doctype html>
<html>
  <head>
    <title>Documentation</title>
    <!-- __SITE_HEAD__ -->
    <script type="application/json" id="__bootstrap__"></script>
  </head>
  <body><div id="root"></div></body>
</html>"#;

        let result = inject_bootstrap_and_meta(template_modern, Some(&shell));

        // 1. Meta tags and title verification
        assert!(
            !result.contains("<title>Documentation</title>"),
            "old title replaced"
        );
        assert!(result.contains(
            "<title>Evil &lt;Project&gt; \
             &quot;&lt;/script&gt;&lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;&quot;</\
             title>"
        ));
        assert!(result.contains(
            r#"<meta name="description" content="Description with &quot;quotes&quot;, &lt;tags&gt;, &amp; ampersand, and line break \u{2028}." />"#
        ));

        // 2. Script data block verification
        let script_start = result
            .find(r#"<script type="application/json" id="__bootstrap__">"#)
            .expect("bootstrap tag exists");
        let script_content_start =
            script_start + r#"<script type="application/json" id="__bootstrap__">"#.len();
        let script_end = result[script_content_start..]
            .find("</script>")
            .expect("bootstrap close exists")
            + script_content_start;
        let script_body = &result[script_content_start..script_end];

        // Ensure script body has no raw < or > or </script>
        assert!(
            !script_body.contains('<'),
            "script body must not contain raw <"
        );
        assert!(
            !script_body.contains('>'),
            "script body must not contain raw >"
        );
        assert!(
            !script_body.contains('\u{2028}'),
            "script body must not contain raw U+2028"
        );
        assert!(
            !script_body.contains('\u{2029}'),
            "script body must not contain raw U+2029"
        );

        // Verify JSON parses back accurately
        let roundtrip: SiteShell =
            serde_json::from_str(script_body).expect("JSON inside script tag must be valid");
        assert_eq!(roundtrip.project.name, shell.project.name);
        assert_eq!(roundtrip.project.description, shell.project.description);

        // 3. Test legacy template with <script id="__SITE_BOOTSTRAP__">
        let template_legacy = r#"<!doctype html>
<html>
  <head>
    <title>Documentation</title>
    <!-- __SITE_HEAD__ -->
    <script id="__SITE_BOOTSTRAP__">
      // Injected by standalone server at runtime
    </script>
  </head>
  <body><div id="root"></div></body>
</html>"#;

        let result_legacy = inject_bootstrap_and_meta(template_legacy, Some(&shell));
        assert!(result_legacy.contains(r#"<script type="application/json" id="__bootstrap__">"#));
        assert!(!result_legacy.contains("window.__SITE__"));
        assert!(!result_legacy.contains("Injected by standalone server at runtime"));
    }

    #[test]
    fn test_resolve_bind_host() {
        assert_eq!(resolve_bind_host("127.0.0.1", false), "127.0.0.1");
        assert_eq!(resolve_bind_host("127.0.0.1", true), "0.0.0.0");
        assert_eq!(resolve_bind_host("", true), "0.0.0.0");
        assert_eq!(resolve_bind_host("0.0.0.0", false), "0.0.0.0");
        assert_eq!(resolve_bind_host("192.168.1.10", false), "192.168.1.10");
        assert_eq!(resolve_bind_host("192.168.1.10", true), "192.168.1.10");
    }

    #[test]
    fn test_is_loopback_host() {
        assert!(is_loopback_host("127.0.0.1"));
        assert!(is_loopback_host("127.0.0.2"));
        assert!(is_loopback_host("::1"));
        assert!(is_loopback_host("localhost"));
        assert!(is_loopback_host("LOCALHOST"));
        assert!(!is_loopback_host("0.0.0.0"));
        assert!(!is_loopback_host("::"));
        assert!(!is_loopback_host("192.168.1.1"));
        assert!(!is_loopback_host("example.com"));
    }

    #[test]
    fn test_build_cors_layer() {
        // Loopback should return None (same-origin policy enforced)
        let loopback_default = build_cors_layer("127.0.0.1", None).unwrap();
        assert!(loopback_default.is_none());

        let loopback_with_origin =
            build_cors_layer("127.0.0.1", Some("https://example.com")).unwrap();
        assert!(loopback_with_origin.is_none());

        let localhost = build_cors_layer("localhost", None).unwrap();
        assert!(localhost.is_none());

        // Network binding without origin returns None (same-origin policy enforced)
        let network_no_origin = build_cors_layer("0.0.0.0", None).unwrap();
        assert!(network_no_origin.is_none());

        let network_empty_origin = build_cors_layer("0.0.0.0", Some("   ")).unwrap();
        assert!(network_empty_origin.is_none());

        // Network binding with explicit origin returns Some(CorsLayer)
        let network_with_origin =
            build_cors_layer("0.0.0.0", Some("https://docs.company.com")).unwrap();
        assert!(network_with_origin.is_some());

        // Multiple origins separated by comma
        let multi_origin = build_cors_layer(
            "0.0.0.0",
            Some("https://docs.company.com, https://site.company.com"),
        )
        .unwrap();
        assert!(multi_origin.is_some());

        // Invalid origin header value should error
        let invalid_origin = build_cors_layer("0.0.0.0", Some("invalid\norigin"));
        assert!(invalid_origin.is_err());
    }

    async fn setup_test_db() -> sqlx::SqlitePool {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("open in-memory db");
        sqlx::raw_sql(
            r#"
            CREATE TABLE export_meta (
                schema_version INTEGER NOT NULL,
                project_id TEXT NOT NULL,
                project_name TEXT NOT NULL,
                project_slug TEXT NOT NULL,
                exported_at TEXT NOT NULL
            );
            INSERT INTO export_meta VALUES (1, 'p1', 'Test Project', 'test-proj', '2026-10-05T00:00:00Z');

            CREATE TABLE project_config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            INSERT INTO project_config VALUES ('description', '"Test project description"');

            CREATE TABLE languages (
                code TEXT PRIMARY KEY,
                label TEXT NOT NULL,
                is_default INTEGER NOT NULL,
                is_rtl INTEGER NOT NULL
            );
            INSERT INTO languages VALUES ('en', 'English', 1, 0);
            INSERT INTO languages VALUES ('fr', 'French', 0, 0);

            CREATE TABLE versions (
                id TEXT PRIMARY KEY,
                slug TEXT NOT NULL,
                label TEXT NOT NULL,
                sort_order INTEGER NOT NULL,
                is_default INTEGER NOT NULL
            );
            INSERT INTO versions VALUES ('v1', 'latest', 'v1.0', 1, 1);
            INSERT INTO versions VALUES ('v2', 'v2.0', 'v2.0', 2, 0);

            CREATE TABLE pages (
                id TEXT PRIMARY KEY,
                version_id TEXT NOT NULL,
                parent_id TEXT,
                kind TEXT NOT NULL,
                slug TEXT NOT NULL,
                title TEXT NOT NULL,
                path TEXT NOT NULL,
                icon TEXT,
                sort_order INTEGER NOT NULL
            );
            INSERT INTO pages VALUES ('page1', 'v1', NULL, 'document', 'getting-started', 'Getting Started v1', '/getting-started', NULL, 1);
            INSERT INTO pages VALUES ('page2', 'v2', NULL, 'document', 'getting-started', 'Getting Started v2', '/getting-started', NULL, 1);
            INSERT INTO pages VALUES ('page3', 'v1', NULL, 'document', 'auth', 'Authentication v1', '/auth', NULL, 2);
            INSERT INTO pages VALUES ('page4', 'v2', NULL, 'document', 'auth', 'Authentication v2', '/auth', NULL, 2);

            CREATE TABLE page_content (
                page_id TEXT NOT NULL,
                language TEXT NOT NULL,
                markdown TEXT NOT NULL,
                description TEXT,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (page_id, language)
            );
            INSERT INTO page_content VALUES ('page1', 'en', '# Getting Started v1\n\nWelcome to documentation v1.', 'Intro page v1', '2026-10-05T00:00:00Z');
            INSERT INTO page_content VALUES ('page2', 'en', '# Getting Started v2\n\nWelcome to documentation v2.', 'Intro page v2', '2026-10-05T00:00:00Z');
            INSERT INTO page_content VALUES ('page3', 'en', '# Authentication v1\n\nAuthentication legacy tokens guide.', 'Auth guide v1', '2026-10-05T00:00:00Z');
            INSERT INTO page_content VALUES ('page4', 'en', '# Authentication v2\n\nAuthentication oauth modern guide.', 'Auth guide v2', '2026-10-05T00:00:00Z');

            CREATE VIRTUAL TABLE page_fts USING fts5(page_id UNINDEXED, version_id UNINDEXED, language UNINDEXED, title, content);
            INSERT INTO page_fts VALUES ('page1', 'v1', 'en', 'Getting Started v1', 'Welcome to documentation v1.');
            INSERT INTO page_fts VALUES ('page2', 'v2', 'en', 'Getting Started v2', 'Welcome to documentation v2.');
            INSERT INTO page_fts VALUES ('page3', 'v1', 'en', 'Authentication v1', 'Authentication legacy tokens guide.');
            INSERT INTO page_fts VALUES ('page4', 'v2', 'en', 'Authentication v2', 'Authentication oauth modern guide.');

            CREATE TABLE changelog (
                slug TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                published_at TEXT NOT NULL
            );
            INSERT INTO changelog VALUES ('v1.0.0', 'Initial Release', '2026-10-05');

            CREATE TABLE assets (
                path TEXT PRIMARY KEY,
                mime_type TEXT NOT NULL,
                data BLOB NOT NULL
            );
            INSERT INTO assets VALUES ('logo.png', 'image/png', X'89504E47');
            "#,
        )
        .execute(&pool)
        .await
        .expect("setup tables");
        pool
    }

    #[tokio::test]
    async fn test_same_origin_policy_on_loopback() {
        use tower::ServiceExt;
        let pool = setup_test_db().await;
        let state = AppState::new(pool, None);

        // Loopback binding with no cors
        let cors = build_cors_layer("127.0.0.1", None).unwrap();
        let app = create_runner_router(state, cors);

        let req = axum::http::Request::builder()
            .uri("/healthz")
            .header("Origin", "https://evil.com")
            .body(axum::body::Body::empty())
            .unwrap();

        let response = app.oneshot(req).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        // Ensure NO Access-Control-Allow-Origin header is present
        assert!(
            response
                .headers()
                .get("access-control-allow-origin")
                .is_none(),
            "Loopback must enforce same-origin policy without Access-Control-Allow-Origin"
        );
    }

    #[tokio::test]
    async fn test_cors_allowed_origin_on_network_binding() {
        use tower::ServiceExt;
        let pool = setup_test_db().await;
        let state = AppState::new(pool, None);

        // Network binding with explicit origin
        let cors = build_cors_layer("0.0.0.0", Some("https://docs.company.com")).unwrap();
        assert!(cors.is_some());
        let app = create_runner_router(state, cors);

        let req = axum::http::Request::builder()
            .uri("/healthz")
            .header("Origin", "https://docs.company.com")
            .body(axum::body::Body::empty())
            .unwrap();

        let response = app.oneshot(req).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let allow_origin = response.headers().get("access-control-allow-origin");
        assert_eq!(
            allow_origin.and_then(|v| v.to_str().ok()),
            Some("https://docs.company.com")
        );
    }

    #[tokio::test]
    async fn test_spawn_blocking_handlers_work_with_db() {
        use tower::ServiceExt;
        let pool = setup_test_db().await;
        let state = AppState::new(pool, None);

        let app = create_runner_router(state, None);

        // 1. Test bootstrap
        let req = axum::http::Request::builder()
            .uri("/api/v1/bootstrap")
            .body(axum::body::Body::empty())
            .unwrap();
        let response = app.clone().oneshot(req).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let shell: SiteShell = serde_json::from_slice(&body).unwrap();
        assert_eq!(shell.project.name, "Test Project");
        assert_eq!(shell.active_language, "en");
        assert_eq!(shell.nav.len(), 2);
        assert_eq!(shell.nav[0].title, "Getting Started v1");

        // 2. Test page
        let req = axum::http::Request::builder()
            .uri("/api/v1/page?path=/getting-started")
            .body(axum::body::Body::empty())
            .unwrap();
        let response = app.clone().oneshot(req).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let page_resp: SitePageResponse = serde_json::from_slice(&body).unwrap();
        assert_eq!(page_resp.page.title, "Getting Started v1");
        assert!(page_resp
            .page
            .content
            .contains("Welcome to documentation v1"));

        // 3. Test changelog
        let req = axum::http::Request::builder()
            .uri("/api/v1/changelog")
            .body(axum::body::Body::empty())
            .unwrap();
        let response = app.clone().oneshot(req).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        // 4. Test search
        let req = axum::http::Request::builder()
            .uri("/api/v1/search?q=documentation")
            .body(axum::body::Body::empty())
            .unwrap();
        let response = app.clone().oneshot(req).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let val: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert!(!val["hits"].as_array().unwrap().is_empty());

        // 5. Test asset
        let req = axum::http::Request::builder()
            .uri("/assets/logo.png")
            .body(axum::body::Body::empty())
            .unwrap();
        let response = app.oneshot(req).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers().get("content-type").unwrap(), "image/png");
    }

    #[tokio::test]
    async fn test_version_scoping_duplicate_path() {
        use tower::ServiceExt;
        let pool = setup_test_db().await;
        let state = AppState::new(pool, None);
        let app = create_runner_router(state, None);

        // 1. Querying version latest / v1 returns Getting Started v1
        let req = axum::http::Request::builder()
            .uri("/api/v1/page?path=/getting-started&version=latest")
            .body(axum::body::Body::empty())
            .unwrap();
        let res = app.clone().oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let body = axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap();
        let page: SitePageResponse = serde_json::from_slice(&body).unwrap();
        assert_eq!(page.page.title, "Getting Started v1");
        assert_eq!(page.page.id, "page1");
        assert_eq!(page.active_version, "latest");

        // 2. Querying version v2.0 / v2 returns Getting Started v2
        let req = axum::http::Request::builder()
            .uri("/api/v1/page?path=/getting-started&version=v2.0")
            .body(axum::body::Body::empty())
            .unwrap();
        let res = app.clone().oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let body = axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap();
        let page: SitePageResponse = serde_json::from_slice(&body).unwrap();
        assert_eq!(page.page.title, "Getting Started v2");
        assert_eq!(page.page.id, "page2");
        assert_eq!(page.active_version, "v2.0");

        // 3. Querying by version ID directly also works
        let req = axum::http::Request::builder()
            .uri("/api/v1/page?path=/getting-started&version=v2")
            .body(axum::body::Body::empty())
            .unwrap();
        let res = app.clone().oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let body = axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap();
        let page: SitePageResponse = serde_json::from_slice(&body).unwrap();
        assert_eq!(page.page.id, "page2");

        // 4. Default version (when omitted) returns default version v1
        let req = axum::http::Request::builder()
            .uri("/api/v1/page?path=/getting-started")
            .body(axum::body::Body::empty())
            .unwrap();
        let res = app.clone().oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let body = axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap();
        let page: SitePageResponse = serde_json::from_slice(&body).unwrap();
        assert_eq!(page.page.id, "page1");

        // 5. Querying non-existent version returns 404
        let req = axum::http::Request::builder()
            .uri("/api/v1/page?path=/getting-started&version=nonexistent")
            .body(axum::body::Body::empty())
            .unwrap();
        let res = app.oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_language_scoping_no_cross_language_fallback() {
        use tower::ServiceExt;
        let pool = setup_test_db().await;
        let state = AppState::new(pool, None);
        let app = create_runner_router(state, None);

        // 1. Language 'fr' exists in languages table, but page1 has no content for 'fr'
        // Must return 404 NOT_FOUND instead of falling back to English content
        let req = axum::http::Request::builder()
            .uri("/api/v1/page?path=/getting-started&lang=fr")
            .body(axum::body::Body::empty())
            .unwrap();
        let res = app.clone().oneshot(req).await.unwrap();
        assert_eq!(
            res.status(),
            StatusCode::NOT_FOUND,
            "Missing language content must return 404, not fallback to arbitrary language"
        );

        // 2. Non-existent language code in languages table must also return 404
        let req = axum::http::Request::builder()
            .uri("/api/v1/page?path=/getting-started&lang=de")
            .body(axum::body::Body::empty())
            .unwrap();
        let res = app.oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_root_path_no_cross_version_fallback() {
        use tower::ServiceExt;
        let pool = setup_test_db().await;
        let state = AppState::new(pool, None);
        let app = create_runner_router(state, None);

        // When no page has path="/" or "", root request must return 404, not pick first page across all versions
        let req = axum::http::Request::builder()
            .uri("/api/v1/page?path=/")
            .body(axum::body::Body::empty())
            .unwrap();
        let res = app.oneshot(req).await.unwrap();
        assert_eq!(
            res.status(),
            StatusCode::NOT_FOUND,
            "Root path with no root page defined must return 404, not cross-version fallback"
        );
    }

    #[tokio::test]
    async fn test_search_version_and_language_scoping_and_ranking() {
        use tower::ServiceExt;
        let pool = setup_test_db().await;
        let state = AppState::new(pool, None);
        let app = create_runner_router(state, None);

        // 1. Scoped to v1
        let req = axum::http::Request::builder()
            .uri("/api/v1/search?q=authentication&version=v1")
            .body(axum::body::Body::empty())
            .unwrap();
        let res = app.clone().oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let body = axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap();
        let val: serde_json::Value = serde_json::from_slice(&body).unwrap();
        let hits = val["hits"].as_array().unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0]["id"], "page3");
        assert_eq!(hits[0]["title"], "Authentication v1");
        // Verify deterministic score (not constant 1.0)
        let score = hits[0]["score"].as_f64().unwrap();
        assert!(
            score != 1.0,
            "Score should be calculated via BM25, not hardcoded 1.0"
        );

        // 2. Scoped to v2
        let req = axum::http::Request::builder()
            .uri("/api/v1/search?q=authentication&version=v2.0")
            .body(axum::body::Body::empty())
            .unwrap();
        let res = app.clone().oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let body = axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap();
        let val: serde_json::Value = serde_json::from_slice(&body).unwrap();
        let hits = val["hits"].as_array().unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0]["id"], "page4");
        assert_eq!(hits[0]["title"], "Authentication v2");

        // 3. Scoped to language with no matches
        let req = axum::http::Request::builder()
            .uri("/api/v1/search?q=authentication&lang=fr")
            .body(axum::body::Body::empty())
            .unwrap();
        let res = app.oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let body = axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap();
        let val: serde_json::Value = serde_json::from_slice(&body).unwrap();
        let hits = val["hits"].as_array().unwrap();
        assert_eq!(
            hits.len(),
            0,
            "No hits should be returned for unmatched language"
        );
    }

    #[tokio::test]
    async fn test_runner_tantivy_search_execution() {
        let temp_dir = tempfile::tempdir().unwrap();
        let index_dir = temp_dir.path().join("search_index");
        std::fs::create_dir_all(&index_dir).unwrap();

        let (schema, fields) = RunnerTantivyFields::build_schema();
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

    #[test]
    fn test_resolve_runner_paths_from_sibling_dir() {
        let temp = tempfile::tempdir().unwrap();
        let db_path = temp.path().join("docs.sqlite");
        std::fs::write(&db_path, b"mock sqlite").unwrap();
        let idx_dir = temp.path().join("search_index");
        std::fs::create_dir(&idx_dir).unwrap();

        let args = Args {
            db: db_path.clone(),
            dir: None,
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

    #[tokio::test]
    async fn test_fast_path_redirects() {
        use tower::ServiceExt;
        let pool = setup_test_db().await;
        sqlx::query("ALTER TABLE pages ADD COLUMN custom_id TEXT")
            .execute(&pool)
            .await
            .unwrap();

        // Seed custom_id and a group with child
        sqlx::query("UPDATE pages SET custom_id = 'guide-intro' WHERE id = 'page1'")
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query("INSERT INTO pages (id, custom_id, version_id, parent_id, kind, slug, title, path, sort_order) VALUES ('group1', 'api-ref', 'v1', NULL, 'GROUP', 'api', 'API Reference', '/api', 10)")
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query("INSERT INTO pages (id, custom_id, version_id, parent_id, kind, slug, title, path, sort_order) VALUES ('child1', 'api-overview', 'v1', 'group1', 'PAGE', 'overview', 'Overview', '/api/overview', 1)")
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query("INSERT INTO pages (id, custom_id, version_id, parent_id, kind, slug, title, path, sort_order) VALUES ('child2', 'api-endpoints', 'v1', 'group1', 'PAGE', 'endpoints', 'Endpoints', '/api/endpoints', 2)")
            .execute(&pool)
            .await
            .unwrap();

        let state = AppState::new(pool, None);
        let app = create_runner_router(state, None);

        // 1. Direct redirect by custom_id
        let req = axum::http::Request::builder()
            .uri("/p/guide-intro")
            .body(axum::body::Body::empty())
            .unwrap();
        let res = app.clone().oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::TEMPORARY_REDIRECT);
        assert_eq!(res.headers().get("location").unwrap(), "/getting-started");

        // 2. Direct redirect by page ID
        let req = axum::http::Request::builder()
            .uri("/p/page1")
            .body(axum::body::Body::empty())
            .unwrap();
        let res = app.clone().oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::TEMPORARY_REDIRECT);
        assert_eq!(res.headers().get("location").unwrap(), "/getting-started");

        // 3. Group unwrapping to first child page (child1 with sort_order 1)
        let req = axum::http::Request::builder()
            .uri("/p/api-ref")
            .body(axum::body::Body::empty())
            .unwrap();
        let res = app.clone().oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::TEMPORARY_REDIRECT);
        assert_eq!(res.headers().get("location").unwrap(), "/api/overview");

        // 4. Preserve query parameters
        let req = axum::http::Request::builder()
            .uri("/p/guide-intro?lang=ja&version=v2.0")
            .body(axum::body::Body::empty())
            .unwrap();
        let res = app.clone().oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::TEMPORARY_REDIRECT);
        assert_eq!(res.headers().get("location").unwrap(), "/getting-started?lang=ja&version=v2.0");

        // 5. Non-existent ID returns 404
        let req = axum::http::Request::builder()
            .uri("/p/does-not-exist")
            .body(axum::body::Body::empty())
            .unwrap();
        let res = app.oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_runner_mcp_handler_tools() {
        use rmcp::handler::server::wrapper::Parameters;

        let pool = setup_test_db().await;
        sqlx::query("ALTER TABLE pages ADD COLUMN custom_id TEXT")
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query("UPDATE pages SET custom_id = 'guide-intro' WHERE id = 'page1'")
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query("INSERT INTO pages (id, custom_id, version_id, parent_id, kind, slug, title, path, sort_order) VALUES ('group1', 'api-ref', 'v1', NULL, 'GROUP', 'api', 'API Reference', '/api', 10)")
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query("INSERT INTO pages (id, custom_id, version_id, parent_id, kind, slug, title, path, sort_order) VALUES ('child1', 'api-overview', 'v1', 'group1', 'PAGE', 'overview', 'Overview', '/api/overview', 1)")
            .execute(&pool)
            .await
            .unwrap();

        let handler = mcp::RunnerMcpHandler::new(pool, None, "http://localhost:8080".into());

        // 1. Test get_project_info
        let proj_res = handler
            .get_project_info(Parameters(mcp::GetProjectInfoParams::default()))
            .await
            .unwrap();
        assert!(!proj_res.content.is_empty());

        // 2. Test list_pages
        let list_res = handler
            .list_pages(Parameters(mcp::ListPagesParams { version: None }))
            .await
            .unwrap();
        assert!(!list_res.content.is_empty());

        // 3. Test get_page by custom_id
        let page_res = handler
            .get_page(Parameters(mcp::GetPageParams {
                id_or_path: "guide-intro".into(),
                language: None,
                version: None,
                max_chars: None,
            }))
            .await
            .unwrap();
        assert!(!page_res.content.is_empty());

        // 4. Test search_docs
        let search_res = handler
            .search_docs(Parameters(mcp::SearchDocsParams {
                query: "getting started".into(),
                language: None,
                version: None,
                limit: Some(5),
            }))
            .await
            .unwrap();
        assert!(!search_res.content.is_empty());

        // 5. Test list_versions
        let ver_res = handler
            .list_versions(Parameters(mcp::ListVersionsParams::default()))
            .await
            .unwrap();
        assert!(!ver_res.content.is_empty());
        let text = ver_res.content[0].as_text().unwrap();
        assert!(text.text.contains("v1.0"));
        assert!(text.text.contains("pageCount"));
    }

    #[test]
    fn test_parse_open_target_with_flags_and_urls() {
        // Case 1: Simple custom ID
        let args1 = OpenArgs {
            id: "auth-guide".into(),
            version: None,
            lang: None,
            port: 8080,
            server_url: "http://localhost:8080".into(),
        };
        let (id, v, l) = parse_open_target(&args1);
        assert_eq!(id, "auth-guide");
        assert_eq!(v, None);
        assert_eq!(l, None);

        // Case 2: cms-doc:// URI with query parameters
        let args2 = OpenArgs {
            id: "cms-doc://auth-guide?version=v2.0&lang=ja".into(),
            version: None,
            lang: None,
            port: 8080,
            server_url: "http://localhost:8080".into(),
        };
        let (id, v, l) = parse_open_target(&args2);
        assert_eq!(id, "auth-guide");
        assert_eq!(v.as_deref(), Some("v2.0"));
        assert_eq!(l.as_deref(), Some("ja"));

        // Case 3: Explicit CLI flags take precedence over URI params
        let args3 = OpenArgs {
            id: "cms-doc:///p/api/v1?version=v1.0&lang=en".into(),
            version: Some("v2.0".into()),
            lang: Some("ja".into()),
            port: 8080,
            server_url: "http://localhost:8080".into(),
        };
        let (id, v, l) = parse_open_target(&args3);
        assert_eq!(id, "api/v1");
        assert_eq!(v.as_deref(), Some("v2.0"));
        assert_eq!(l.as_deref(), Some("ja"));
    }

    #[tokio::test]
    async fn test_hot_reload_endpoint_and_atomic_swap() {
        use tower::ServiceExt;

        let temp = tempfile::tempdir().unwrap();
        let db_path = temp.path().join("docs.sqlite");

        // 1. Initialize SQLite database with initial project
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .connect_with(
                sqlx::sqlite::SqliteConnectOptions::new()
                    .filename(&db_path)
                    .create_if_missing(true),
            )
            .await
            .unwrap();

        sqlx::query(
            "CREATE TABLE export_meta (project_id TEXT PRIMARY KEY, project_name TEXT NOT NULL, project_slug TEXT NOT NULL, exported_at TEXT NOT NULL, schema_version INTEGER NOT NULL DEFAULT 1); \
             INSERT INTO export_meta VALUES ('p1', 'Initial Project', 'init', '2026-10-17T00:00:00Z', 1); \
             CREATE TABLE project_config (key TEXT PRIMARY KEY, value TEXT NOT NULL); \
             CREATE TABLE languages (code TEXT PRIMARY KEY, label TEXT NOT NULL, is_default INTEGER NOT NULL, is_rtl INTEGER NOT NULL); \
             INSERT INTO languages VALUES ('en', 'English', 1, 0); \
             CREATE TABLE versions (id TEXT PRIMARY KEY, slug TEXT NOT NULL, label TEXT NOT NULL, is_default INTEGER NOT NULL, sort_order INTEGER NOT NULL); \
             INSERT INTO versions VALUES ('v1', 'v1.0', 'v1.0', 1, 0); \
             CREATE TABLE pages (id TEXT PRIMARY KEY, custom_id TEXT, version_id TEXT NOT NULL, parent_id TEXT, kind TEXT NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL, path TEXT NOT NULL, icon TEXT, sort_order INTEGER NOT NULL); \
             INSERT INTO pages VALUES ('p_init', 'init-doc', 'v1', NULL, 'PAGE', 'init', 'Initial Page', '/init', NULL, 0); \
             CREATE TABLE page_content (page_id TEXT NOT NULL, language TEXT NOT NULL, markdown TEXT NOT NULL, description TEXT, updated_at TEXT NOT NULL, PRIMARY KEY(page_id, language)); \
             INSERT INTO page_content VALUES ('p_init', 'en', '# Initial Page Content', 'Initial description', '2026-10-17T00:00:00Z');"
        )
        .execute(&pool)
        .await
        .unwrap();

        pool.close().await;

        // Open read-only pool for AppState
        let ro_pool = sqlx::sqlite::SqlitePoolOptions::new()
            .connect_with(
                sqlx::sqlite::SqliteConnectOptions::new()
                    .filename(&db_path)
                    .read_only(true),
            )
            .await
            .unwrap();

        let state = AppState::with_paths(ro_pool, None, db_path.clone(), None);
        let app = create_runner_router(state, None);

        // 2. Query initial page
        let req = axum::http::Request::builder()
            .uri("/api/v1/page?path=/init")
            .body(axum::body::Body::empty())
            .unwrap();
        let res = app.clone().oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::OK);

        // 3. Mutate SQLite database on disk
        let rw_pool = sqlx::sqlite::SqlitePoolOptions::new()
            .connect_with(
                sqlx::sqlite::SqliteConnectOptions::new()
                    .filename(&db_path),
            )
            .await
            .unwrap();

        sqlx::query(
            "UPDATE export_meta SET project_name = 'Updated Raft Platform'; \
             INSERT INTO pages VALUES ('p_new', 'hot-reload-page', 'v1', NULL, 'PAGE', 'hot-reload', 'Hot Reload Page', '/hot-reload', NULL, 1); \
             INSERT INTO page_content VALUES ('p_new', 'en', '# Hot Reload Success', 'New page added live', '2026-10-17T01:00:00Z');"
        )
        .execute(&rw_pool)
        .await
        .unwrap();

        rw_pool.close().await;

        // 4. Trigger POST /api/v1/reload
        let reload_req = axum::http::Request::builder()
            .method("POST")
            .uri("/api/v1/reload")
            .header(axum::http::header::HOST, "127.0.0.1:8080")
            .body(axum::body::Body::empty())
            .unwrap();
        let reload_res = app.clone().oneshot(reload_req).await.unwrap();
        assert_eq!(reload_res.status(), StatusCode::OK);
        let body = axum::body::to_bytes(reload_res.into_body(), usize::MAX)
            .await
            .unwrap();
        let val: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(val["reloaded"], true);
        assert_eq!(val["stats"]["projectName"], "Updated Raft Platform");
        assert_eq!(val["stats"]["pageCount"], 2);

        // 5. Query newly added page without server restart
        let new_page_req = axum::http::Request::builder()
            .uri("/api/v1/page?path=/hot-reload")
            .body(axum::body::Body::empty())
            .unwrap();
        let new_page_res = app.oneshot(new_page_req).await.unwrap();
        assert_eq!(new_page_res.status(), StatusCode::OK);
        let body = axum::body::to_bytes(new_page_res.into_body(), usize::MAX)
            .await
            .unwrap();
        let page_resp: SitePageResponse = serde_json::from_slice(&body).unwrap();
        assert_eq!(page_resp.page.title, "Hot Reload Page");
        assert!(page_resp.page.content.contains("Hot Reload Success"));
    }

    #[tokio::test]
    async fn test_hot_reload_loopback_restriction() {
        use tower::ServiceExt;

        let pool = setup_test_db().await;
        let state = AppState::new(pool, None);
        let app = create_runner_router(state, None);

        // Call from external non-loopback host must receive 403 Forbidden
        let req = axum::http::Request::builder()
            .method("POST")
            .uri("/api/v1/reload")
            .header(axum::http::header::HOST, "malicious.internal.company.com")
            .body(axum::body::Body::empty())
            .unwrap();

        let res = app.oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::FORBIDDEN);
    }
}


