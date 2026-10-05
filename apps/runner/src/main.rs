use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use axum::extract::{Query, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use clap::Parser;
use parking_lot::Mutex;
use rusqlite::{Connection, OpenFlags};
use rust_embed::Embed;
use serde::{Deserialize, Serialize};
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Embed)]
#[folder = "../../dist/reader/"]
struct EmbeddedSite;

#[derive(Parser, Debug)]
#[command(name = "cms-site", author, version, about = "Portable single-binary documentation site runner")]
struct Args {
    /// Path to the exported SQLite database
    #[arg(short, long, default_value = "docs.sqlite")]
    db: PathBuf,

    /// HTTP port to bind to
    #[arg(short, long, default_value_t = 8080)]
    port: u16,

    /// Host address to bind to
    #[arg(long, default_value = "0.0.0.0")]
    host: String,
}

#[derive(Clone)]
struct AppState {
    db: Arc<Mutex<Connection>>,
    db_path: PathBuf,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct NavNode {
    id: String,
    kind: String,
    title: String,
    path: String,
    icon: Option<String>,
    tag: Option<String>,
    children: Vec<NavNode>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LanguageItem {
    code: String,
    label: String,
    direction: String,
    is_default: bool,
    enabled: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct VersionItem {
    id: String,
    name: String,
    slug: String,
    is_default: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProjectMetadata {
    id: String,
    name: String,
    slug: String,
    description: Option<String>,
    config: Option<serde_json::Value>,
    primary_domain: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SiteShell {
    project: ProjectMetadata,
    nav: Vec<NavNode>,
    languages: Vec<LanguageItem>,
    versions: Vec<VersionItem>,
    active_language: String,
    active_version: String,
    language_config: Option<serde_json::Value>,
    version: i64,
    generated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct HeadingItem {
    depth: u32,
    text: String,
    id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PageDetails {
    id: String,
    created_at: String,
    updated_at: String,
    title: String,
    description: Option<String>,
    excerpt: String,
    icon: Option<String>,
    path: String,
    content: String,
    headings: Vec<HeadingItem>,
    config: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PageLanguageItem {
    code: String,
    is_default: bool,
    path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BreadcrumbItem {
    title: String,
    path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AdjacentPage {
    title: String,
    path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SitePageResponse {
    project: ProjectMetadata,
    page: PageDetails,
    active_language: String,
    active_version: String,
    versions: Vec<VersionItem>,
    language_config: Option<serde_json::Value>,
    languages: Vec<PageLanguageItem>,
    breadcrumbs: Vec<BreadcrumbItem>,
    prev: Option<AdjacentPage>,
    next: Option<AdjacentPage>,
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
struct SiteSearchHit {
    id: String,
    title: String,
    path: String,
    description: String,
    icon: Option<String>,
    snippet: String,
    score: f64,
    language: String,
}

#[derive(Debug, Deserialize)]
struct BootstrapQuery {
    lang: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PageQuery {
    path: Option<String>,
    lang: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SearchQuery {
    q: Option<String>,
    lang: Option<String>,
    version: Option<String>,
    limit: Option<usize>,
}

// ── Database Queries ─────────────────────────────────────────────────────────

fn query_bootstrap(conn: &Connection, target_lang: Option<&str>) -> anyhow::Result<SiteShell> {
    // 1. Project metadata
    let (project_id, project_name, project_slug, exported_at): (String, String, String, String) = conn
        .query_row(
            "SELECT project_id, project_name, project_slug, exported_at FROM export_meta LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )?;

    let mut project_config = serde_json::Map::new();
    let mut stmt = conn.prepare("SELECT key, value FROM project_config")?;
    let config_rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    for row in config_rows {
        if let Ok((k, v)) = row {
            if let Ok(json_val) = serde_json::from_str(&v) {
                project_config.insert(k, json_val);
            } else {
                project_config.insert(k, serde_json::Value::String(v));
            }
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
    let mut stmt = conn.prepare("SELECT code, label, is_default, is_rtl FROM languages")?;
    let lang_rows = stmt.query_map([], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, i32>(2)? == 1,
            r.get::<_, i32>(3)? == 1,
        ))
    })?;

    for row in lang_rows {
        let (code, label, is_default, is_rtl) = row?;
        if is_default {
            default_lang = code.clone();
        }
        languages.push(LanguageItem {
            code,
            label,
            direction: if is_rtl { "RTL".to_string() } else { "LTR".to_string() },
            is_default,
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
    let mut active_version_id = String::new();
    let mut active_version_slug = String::new();
    let mut stmt = conn.prepare("SELECT id, slug, label, is_default FROM versions ORDER BY sort_order ASC")?;
    let ver_rows = stmt.query_map([], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, String>(2)?,
            r.get::<_, i32>(3)? == 1,
        ))
    })?;

    for (idx, row) in ver_rows.enumerate() {
        let (id, slug, name, is_default) = row?;
        if is_default || idx == 0 && active_version_id.is_empty() {
            active_version_id = id.clone();
            active_version_slug = slug.clone();
        }
        versions.push(VersionItem {
            id,
            name,
            slug,
            is_default,
        });
    }

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
    let mut stmt = conn.prepare(
        "SELECT id, parent_id, kind, title, path, icon, sort_order FROM pages WHERE version_id = ?1 ORDER BY sort_order ASC",
    )?;
    let page_rows = stmt.query_map([&active_version_id], |r| {
        Ok(RawPageNode {
            id: r.get(0)?,
            parent_id: r.get(1)?,
            kind: r.get(2)?,
            title: r.get(3)?,
            path: r.get(4)?,
            icon: r.get(5)?,
            sort_order: r.get(6)?,
        })
    })?;

    for row in page_rows {
        raw_pages.push(row?);
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

fn query_page(
    conn: &Connection,
    target_path: &str,
    target_lang: Option<&str>,
) -> anyhow::Result<Option<SitePageResponse>> {
    let bootstrap = query_bootstrap(conn, target_lang)?;
    let active_lang = bootstrap.active_language.clone();

    // Normalize path
    let normalized = target_path.trim().trim_matches('/');
    let path_candidates = if normalized.is_empty() {
        vec!["/".to_string(), "".to_string()]
    } else {
        vec![format!("/{}", normalized), normalized.to_string()]
    };

    // Find page record
    struct PageRow {
        id: String,
        version_id: String,
        parent_id: Option<String>,
        kind: String,
        slug: String,
        path: String,
        title: String,
        icon: Option<String>,
        sort_order: i32,
    }

    let mut found_page: Option<PageRow> = None;
    for cand in &path_candidates {
        let mut stmt = conn.prepare(
            "SELECT id, version_id, parent_id, kind, slug, path, title, icon, sort_order FROM pages WHERE path = ?1 LIMIT 1",
        )?;
        let mut rows = stmt.query([cand])?;
        if let Some(r) = rows.next()? {
            found_page = Some(PageRow {
                id: r.get(0)?,
                version_id: r.get(1)?,
                parent_id: r.get(2)?,
                kind: r.get(3)?,
                slug: r.get(4)?,
                path: r.get(5)?,
                title: r.get(6)?,
                icon: r.get(7)?,
                sort_order: r.get(8)?,
            });
            break;
        }
    }

    // Fallback: if root was requested and no page has path="/" or "", pick the first page in active version
    if found_page.is_none() && normalized.is_empty() {
        let mut stmt = conn.prepare(
            "SELECT id, version_id, parent_id, kind, slug, path, title, icon, sort_order FROM pages ORDER BY sort_order ASC LIMIT 1",
        )?;
        let mut rows = stmt.query([])?;
        if let Some(r) = rows.next()? {
            found_page = Some(PageRow {
                id: r.get(0)?,
                version_id: r.get(1)?,
                parent_id: r.get(2)?,
                kind: r.get(3)?,
                slug: r.get(4)?,
                path: r.get(5)?,
                title: r.get(6)?,
                icon: r.get(7)?,
                sort_order: r.get(8)?,
            });
        }
    }

    let page_row = match found_page {
        Some(p) => p,
        None => return Ok(None),
    };

    // Query content for the page
    let mut content_query = conn.prepare(
        "SELECT markdown, description, updated_at FROM page_content WHERE page_id = ?1 AND language = ?2 LIMIT 1",
    )?;
    let mut content_rows = content_query.query(rusqlite::params![page_row.id, active_lang])?;

    let (markdown, description, updated_at) = if let Some(r) = content_rows.next()? {
        (r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?, r.get::<_, String>(2)?)
    } else {
        // Fallback: pick any language content
        let mut fallback_query = conn.prepare(
            "SELECT markdown, description, updated_at FROM page_content WHERE page_id = ?1 LIMIT 1",
        )?;
        let mut fallback_rows = fallback_query.query([&page_row.id])?;
        if let Some(r) = fallback_rows.next()? {
            (r.get(0)?, r.get(1)?, r.get(2)?)
        } else {
            (String::new(), None, bootstrap.generated_at.clone())
        }
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
        let mut stmt = conn.prepare("SELECT title, path, parent_id FROM pages WHERE id = ?1 LIMIT 1")?;
        let mut rows = stmt.query([&parent_id])?;
        if let Some(r) = rows.next()? {
            breadcrumbs.push(BreadcrumbItem {
                title: r.get(0)?,
                path: r.get(1)?,
            });
            curr_parent = r.get(2)?;
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
    let mut stmt = conn.prepare(
        "SELECT title, path FROM pages WHERE version_id = ?1 ORDER BY sort_order ASC",
    )?;
    let sib_rows = stmt.query_map([&page_row.version_id], |r| {
        Ok(AdjacentPage {
            title: r.get(0)?,
            path: r.get(1)?,
        })
    })?;
    for s in sib_rows {
        siblings.push(s?);
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
        active_version: bootstrap.active_version,
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

async fn api_bootstrap(
    State(state): State<AppState>,
    Query(query): Query<BootstrapQuery>,
) -> Response {
    let conn = state.db.lock();
    match query_bootstrap(&conn, query.lang.as_deref()) {
        Ok(shell) => Json(shell).into_response(),
        Err(e) => {
            tracing::error!("Failed to query bootstrap: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to load site configuration").into_response()
        }
    }
}

async fn api_page(
    State(state): State<AppState>,
    Query(query): Query<PageQuery>,
) -> Response {
    let conn = state.db.lock();
    let path = query.path.as_deref().unwrap_or("/");
    match query_page(&conn, path, query.lang.as_deref()) {
        Ok(Some(page)) => Json(page).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, "Page not found").into_response(),
        Err(e) => {
            tracing::error!("Failed to query page {}: {}", path, e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to load page").into_response()
        }
    }
}

async fn api_changelog(State(state): State<AppState>) -> Response {
    let conn = state.db.lock();
    let mut entries = Vec::new();
    if let Ok(mut stmt) = conn.prepare("SELECT slug, title, published_at FROM changelog ORDER BY published_at DESC") {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok(ChangelogEntry {
                version: 1,
                date: Some(r.get(2)?),
                title: r.get(1)?,
                pages: 1,
            })
        }) {
            for (idx, r) in rows.enumerate() {
                if let Ok(mut entry) = r {
                    entry.version = (idx + 1) as i64;
                    entries.push(entry);
                }
            }
        }
    }
    Json(entries).into_response()
}

async fn api_search(
    State(state): State<AppState>,
    Query(query): Query<SearchQuery>,
) -> Response {
    let raw_q = query.q.unwrap_or_default();
    let clean_q = raw_q.trim();
    if clean_q.is_empty() {
        return Json(serde_json::json!({ "hits": [] })).into_response();
    }

    let conn = state.db.lock();
    let limit = query.limit.unwrap_or(20).min(50);

    // Escape query for FTS5 syntax
    let fts_query = clean_q
        .split_whitespace()
        .map(|w| format!("\"{}\"*", w.replace('\"', "")))
        .collect::<Vec<_>>()
        .join(" ");

    let mut hits = Vec::new();
    let mut stmt = match conn.prepare(
        r#"
        SELECT p.id, p.title, p.path, p.icon, c.description,
               snippet(page_fts, 4, '<mark>', '</mark>', '...', 12) as snippet,
               f.language
        FROM page_fts f
        JOIN pages p ON p.id = f.page_id
        LEFT JOIN page_content c ON c.page_id = p.id AND c.language = f.language
        WHERE page_fts MATCH ?1
        LIMIT ?2
        "#,
    ) {
        Ok(s) => s,
        Err(e) => {
            tracing::warn!("FTS query prepare failed: {}", e);
            return Json(serde_json::json!({ "hits": [] })).into_response();
        }
    };

    let rows = stmt.query_map(rusqlite::params![fts_query, limit as i64], |r| {
        Ok(SiteSearchHit {
            id: r.get(0)?,
            title: r.get(1)?,
            path: r.get(2)?,
            icon: r.get(3)?,
            description: r.get::<_, Option<String>>(4)?.unwrap_or_default(),
            snippet: r.get::<_, Option<String>>(5)?.unwrap_or_default(),
            score: 1.0,
            language: r.get(6)?,
        })
    });

    if let Ok(results) = rows {
        for hit in results.flatten() {
            hits.push(hit);
        }
    }

    Json(serde_json::json!({ "hits": hits })).into_response()
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
    let conn = state.db.lock();
    let candidates = [
        clean_path.to_string(),
        format!("assets/{}", clean_path),
        format!("/{}", clean_path),
    ];

    for cand in &candidates {
        if let Ok((mime, data)) = conn.query_row(
            "SELECT mime_type, data FROM assets WHERE path = ?1 LIMIT 1",
            [cand],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, Vec<u8>>(1)?)),
        ) {
            return (
                [
                    (header::CONTENT_TYPE, mime),
                    (header::CACHE_CONTROL, "public, max-age=86400".to_string()),
                ],
                data,
            )
                .into_response();
        }
    }

    (StatusCode::NOT_FOUND, "Asset not found").into_response()
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
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Invalid UTF-8 in index.html").into_response(),
    };

    // Fast Bootstrap Injection into index.html
    let conn = state.db.lock();
    let shell = query_bootstrap(&conn, None).ok();

    let mut injected_html = raw_html.to_string();
    if let Some(s) = shell {
        if let Ok(json_str) = serde_json::to_string(&s) {
            let bootstrap_script = format!(
                "<script id=\"__SITE_BOOTSTRAP__\">window.__SITE__ = {};</script>",
                json_str
            );
            injected_html = injected_html.replace(
                "<script id=\"__SITE_BOOTSTRAP__\">\n      // Injected by standalone server at runtime\n    </script>",
                &bootstrap_script,
            );
        }

        let site_title = &s.project.name;
        let site_desc = s.project.description.as_deref().unwrap_or("");
        let meta_tags = format!(
            r#"<title>{}</title>
    <meta name="description" content="{}" />
    <meta property="og:title" content="{}" />
    <meta property="og:description" content="{}" />"#,
            site_title, site_desc, site_title, site_desc
        );
        injected_html = injected_html.replace("<!-- __SITE_HEAD__ -->", &meta_tags);
    }

    Html(injected_html).into_response()
}

// ── Main Entrypoint ──────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,cms_site=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let args = Args::parse();

    if !args.db.exists() {
        eprintln!(
            "Error: Database file not found: {}\nPlease provide a valid CMS SQLite export using --db <path>",
            args.db.display()
        );
        std::process::exit(1);
    }

    // Open SQLite connection in read-only mode
    let conn = rusqlite::Connection::open_with_flags(
        &args.db,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| anyhow::anyhow!("Failed to open SQLite database at {}: {}", args.db.display(), e))?;

    // Validate schema version
    let schema_version: i32 = conn
        .query_row("SELECT schema_version FROM export_meta LIMIT 1", [], |r| {
            r.get(0)
        })
        .map_err(|e| {
            anyhow::anyhow!(
                "Failed to read schema_version from export_meta in {}: {}",
                args.db.display(),
                e
            )
        })?;

    if schema_version != 1 {
        eprintln!(
            "Error: Unsupported schema_version {} (expected 1). Please re-export from a compatible CMS version.",
            schema_version
        );
        std::process::exit(1);
    }

    let project_name: String = conn
        .query_row("SELECT project_name FROM export_meta LIMIT 1", [], |r| {
            r.get(0)
        })
        .unwrap_or_else(|_| "Documentation".to_string());

    tracing::info!(
        "Loaded project: '{}' (schema v{}) from {}",
        project_name,
        schema_version,
        args.db.display()
    );

    let state = AppState {
        db: Arc::new(Mutex::new(conn)),
        db_path: args.db.clone(),
    };

    let app = Router::new()
        .route("/healthz", get(healthz))
        .route("/api/v1/bootstrap", get(api_bootstrap))
        .route("/api/v1/page", get(api_page))
        .route("/api/v1/changelog", get(api_changelog))
        .route("/api/v1/search", get(api_search))
        .route("/assets/{*path}", get(serve_asset))
        .fallback(get(serve_spa))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr: SocketAddr = format!("{}:{}", args.host, args.port).parse()?;
    tracing::info!("Documentation site server listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    tracing::info!("Server shut down gracefully.");
    Ok(())
}

async fn shutdown_signal() {
    tokio::signal::ctrl_c()
        .await
        .expect("Failed to listen for Ctrl+C event");
    tracing::info!("Shutdown signal received, shutting down gracefully...");
}
