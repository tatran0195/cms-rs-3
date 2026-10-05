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

    /// Host or IP address to bind to (defaults to 127.0.0.1 for local isolation)
    #[arg(long, visible_alias = "host", default_value = "127.0.0.1")]
    bind: String,

    /// Expose the server to the local network (binds to 0.0.0.0 unless --bind is explicitly set)
    #[arg(long)]
    network: bool,

    /// Allowed CORS origin when exposing over network (e.g. "https://docs.example.com")
    #[arg(long, visible_alias = "allowed-origin")]
    cors_origin: Option<String>,
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
    for (k, v) in config_rows.flatten() {
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

fn query_changelog(conn: &Connection) -> Vec<ChangelogEntry> {
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
    entries
}

fn execute_search(conn: &Connection, clean_q: &str, limit: usize) -> Vec<SiteSearchHit> {
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
            return hits;
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

    hits
}

fn query_asset_from_db(conn: &Connection, clean_path: &str) -> Option<(String, Vec<u8>)> {
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
            return Some((mime, data));
        }
    }

    None
}

async fn api_bootstrap(
    State(state): State<AppState>,
    Query(query): Query<BootstrapQuery>,
) -> Response {
    let lang = query.lang;
    let res = tokio::task::spawn_blocking(move || {
        let conn = state.db.lock();
        query_bootstrap(&conn, lang.as_deref())
    })
    .await;

    match res {
        Ok(Ok(shell)) => Json(shell).into_response(),
        Ok(Err(e)) => {
            tracing::error!("Failed to query bootstrap: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to load site configuration").into_response()
        }
        Err(e) => {
            tracing::error!("Spawn blocking task join error in api_bootstrap: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error").into_response()
        }
    }
}

async fn api_page(
    State(state): State<AppState>,
    Query(query): Query<PageQuery>,
) -> Response {
    let path = query.path.unwrap_or_else(|| "/".to_string());
    let lang = query.lang;
    let path_clone = path.clone();
    let res = tokio::task::spawn_blocking(move || {
        let conn = state.db.lock();
        query_page(&conn, &path_clone, lang.as_deref())
    })
    .await;

    match res {
        Ok(Ok(Some(page))) => Json(page).into_response(),
        Ok(Ok(None)) => (StatusCode::NOT_FOUND, "Page not found").into_response(),
        Ok(Err(e)) => {
            tracing::error!("Failed to query page {}: {}", path, e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to load page").into_response()
        }
        Err(e) => {
            tracing::error!("Spawn blocking task join error in api_page: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error").into_response()
        }
    }
}

async fn api_changelog(State(state): State<AppState>) -> Response {
    let res = tokio::task::spawn_blocking(move || {
        let conn = state.db.lock();
        query_changelog(&conn)
    })
    .await;

    match res {
        Ok(entries) => Json(entries).into_response(),
        Err(e) => {
            tracing::error!("Spawn blocking task join error in api_changelog: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error").into_response()
        }
    }
}

async fn api_search(
    State(state): State<AppState>,
    Query(query): Query<SearchQuery>,
) -> Response {
    let raw_q = query.q.unwrap_or_default();
    let clean_q = raw_q.trim().to_string();
    if clean_q.is_empty() {
        return Json(serde_json::json!({ "hits": [] })).into_response();
    }
    let limit = query.limit.unwrap_or(20).min(50);

    let res = tokio::task::spawn_blocking(move || {
        let conn = state.db.lock();
        execute_search(&conn, &clean_q, limit)
    })
    .await;

    match res {
        Ok(hits) => Json(serde_json::json!({ "hits": hits })).into_response(),
        Err(e) => {
            tracing::error!("Spawn blocking task join error in api_search: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error").into_response()
        }
    }
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

    // 2. Query SQLite assets table for uploaded images/attachments via blocking task
    let clean_path_owned = clean_path.to_string();
    let res = tokio::task::spawn_blocking(move || {
        let conn = state.db.lock();
        query_asset_from_db(&conn, &clean_path_owned)
    })
    .await;

    match res {
        Ok(Some((mime, data))) => (
            [
                (header::CONTENT_TYPE, mime),
                (header::CACHE_CONTROL, "public, max-age=86400".to_string()),
            ],
            data,
        )
            .into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, "Asset not found").into_response(),
        Err(e) => {
            tracing::error!("Spawn blocking task join error in serve_asset: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error").into_response()
        }
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
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Invalid UTF-8 in index.html").into_response(),
    };

    // Fast Bootstrap Injection into index.html via blocking task
    let res = tokio::task::spawn_blocking(move || {
        let conn = state.db.lock();
        query_bootstrap(&conn, None).ok()
    })
    .await;

    let shell = match res {
        Ok(shell_opt) => shell_opt,
        Err(e) => {
            tracing::error!("Spawn blocking task join error in serve_spa: {}", e);
            None
        }
    };

    let injected_html = inject_bootstrap_and_meta(raw_html, shell.as_ref());
    Html(injected_html).into_response()
}

pub(crate) fn html_escape(input: &str) -> String {
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

pub(crate) fn escape_script_json(json: &str) -> String {
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
        "<title>{site_title}</title>\n    <meta name=\"description\" content=\"{site_desc}\" />\n    <meta property=\"og:title\" content=\"{site_title}\" />\n    <meta property=\"og:description\" content=\"{site_desc}\" />"
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

pub(crate) fn inject_bootstrap_and_meta(raw_html: &str, shell: Option<&SiteShell>) -> String {
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

pub(crate) fn is_loopback_host(host: &str) -> bool {
    if host.eq_ignore_ascii_case("localhost") {
        return true;
    }
    if let Ok(ip) = host.parse::<std::net::IpAddr>() {
        return ip.is_loopback();
    }
    false
}

pub(crate) fn resolve_bind_host(bind: &str, network: bool) -> String {
    if network && (bind == "127.0.0.1" || bind.is_empty()) {
        "0.0.0.0".to_string()
    } else {
        bind.to_string()
    }
}

pub(crate) fn build_cors_layer(
    bind_host: &str,
    cors_origin: Option<&str>,
) -> anyhow::Result<Option<CorsLayer>> {
    let is_loopback = is_loopback_host(bind_host);

    if is_loopback {
        if cors_origin.is_some() {
            tracing::warn!(
                "CORS origin configured on loopback binding ({}); enforcing same-origin policy without Access-Control-Allow-Origin",
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
                "Server exposed on network ({}) without explicit CORS origin; enforcing same-origin policy",
                bind_host
            );
            Ok(None)
        }
    }
}

pub(crate) fn create_runner_router(state: AppState, maybe_cors: Option<CorsLayer>) -> Router {
    let mut app = Router::new()
        .route("/healthz", get(healthz))
        .route("/api/v1/bootstrap", get(api_bootstrap))
        .route("/api/v1/page", get(api_page))
        .route("/api/v1/changelog", get(api_changelog))
        .route("/api/v1/search", get(api_search))
        .route("/assets/{*path}", get(serve_asset))
        .fallback(get(serve_spa))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    if let Some(cors) = maybe_cors {
        app = app.layer(cors);
    }

    app
}

async fn shutdown_signal() {
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
                    r#"Description with "quotes", <tags>, & ampersand, and line break \u{2028}."#.to_string(),
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
        assert!(!result.contains("<title>Documentation</title>"), "old title replaced");
        assert!(result.contains(
            "<title>Evil &lt;Project&gt; &quot;&lt;/script&gt;&lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;&quot;</title>"
        ));
        assert!(result.contains(
            r#"<meta name="description" content="Description with &quot;quotes&quot;, &lt;tags&gt;, &amp; ampersand, and line break \u{2028}." />"#
        ));

        // 2. Script data block verification
        let script_start = result
            .find(r#"<script type="application/json" id="__bootstrap__">"#)
            .expect("bootstrap tag exists");
        let script_content_start = script_start + r#"<script type="application/json" id="__bootstrap__">"#.len();
        let script_end = result[script_content_start..]
            .find("</script>")
            .expect("bootstrap close exists")
            + script_content_start;
        let script_body = &result[script_content_start..script_end];

        // Ensure script body has no raw < or > or </script>
        assert!(!script_body.contains('<'), "script body must not contain raw <");
        assert!(!script_body.contains('>'), "script body must not contain raw >");
        assert!(!script_body.contains('\u{2028}'), "script body must not contain raw U+2028");
        assert!(!script_body.contains('\u{2029}'), "script body must not contain raw U+2029");

        // Verify JSON parses back accurately
        let roundtrip: SiteShell = serde_json::from_str(script_body).expect("JSON inside script tag must be valid");
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

        let loopback_with_origin = build_cors_layer("127.0.0.1", Some("https://example.com")).unwrap();
        assert!(loopback_with_origin.is_none());

        let localhost = build_cors_layer("localhost", None).unwrap();
        assert!(localhost.is_none());

        // Network binding without origin returns None (same-origin policy enforced)
        let network_no_origin = build_cors_layer("0.0.0.0", None).unwrap();
        assert!(network_no_origin.is_none());

        let network_empty_origin = build_cors_layer("0.0.0.0", Some("   ")).unwrap();
        assert!(network_empty_origin.is_none());

        // Network binding with explicit origin returns Some(CorsLayer)
        let network_with_origin = build_cors_layer("0.0.0.0", Some("https://docs.company.com")).unwrap();
        assert!(network_with_origin.is_some());

        // Multiple origins separated by comma
        let multi_origin = build_cors_layer("0.0.0.0", Some("https://docs.company.com, https://site.company.com")).unwrap();
        assert!(multi_origin.is_some());

        // Invalid origin header value should error
        let invalid_origin = build_cors_layer("0.0.0.0", Some("invalid\norigin"));
        assert!(invalid_origin.is_err());
    }

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.execute_batch(
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

            CREATE TABLE versions (
                id TEXT PRIMARY KEY,
                slug TEXT NOT NULL,
                label TEXT NOT NULL,
                sort_order INTEGER NOT NULL,
                is_default INTEGER NOT NULL
            );
            INSERT INTO versions VALUES ('v1', 'latest', 'v1.0', 1, 1);

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
            INSERT INTO pages VALUES ('page1', 'v1', NULL, 'document', 'getting-started', 'Getting Started', '/getting-started', NULL, 1);

            CREATE TABLE page_content (
                page_id TEXT NOT NULL,
                language TEXT NOT NULL,
                markdown TEXT NOT NULL,
                description TEXT,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (page_id, language)
            );
            INSERT INTO page_content VALUES ('page1', 'en', '# Getting Started\n\nWelcome to documentation.', 'Intro page', '2026-10-05T00:00:00Z');

            CREATE VIRTUAL TABLE page_fts USING fts5(page_id UNINDEXED, language UNINDEXED, title, description, content);
            INSERT INTO page_fts VALUES ('page1', 'en', 'Getting Started', 'Intro page', 'Welcome to documentation.');

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
        .expect("setup tables");
        conn
    }

    #[tokio::test]
    async fn test_same_origin_policy_on_loopback() {
        use tower::ServiceExt;
        let conn = setup_test_db();
        let state = AppState {
            db: Arc::new(Mutex::new(conn)),
            db_path: PathBuf::from("test.sqlite"),
        };

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
            response.headers().get("access-control-allow-origin").is_none(),
            "Loopback must enforce same-origin policy without Access-Control-Allow-Origin"
        );
    }

    #[tokio::test]
    async fn test_cors_allowed_origin_on_network_binding() {
        use tower::ServiceExt;
        let conn = setup_test_db();
        let state = AppState {
            db: Arc::new(Mutex::new(conn)),
            db_path: PathBuf::from("test.sqlite"),
        };

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
        let conn = setup_test_db();
        let state = AppState {
            db: Arc::new(Mutex::new(conn)),
            db_path: PathBuf::from("test.sqlite"),
        };

        let app = create_runner_router(state, None);

        // 1. Test bootstrap
        let req = axum::http::Request::builder()
            .uri("/api/v1/bootstrap")
            .body(axum::body::Body::empty())
            .unwrap();
        let response = app.clone().oneshot(req).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let shell: SiteShell = serde_json::from_slice(&body).unwrap();
        assert_eq!(shell.project.name, "Test Project");
        assert_eq!(shell.active_language, "en");
        assert_eq!(shell.nav.len(), 1);
        assert_eq!(shell.nav[0].title, "Getting Started");

        // 2. Test page
        let req = axum::http::Request::builder()
            .uri("/api/v1/page?path=/getting-started")
            .body(axum::body::Body::empty())
            .unwrap();
        let response = app.clone().oneshot(req).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let page_resp: SitePageResponse = serde_json::from_slice(&body).unwrap();
        assert_eq!(page_resp.page.title, "Getting Started");
        assert!(page_resp.page.content.contains("Welcome to documentation"));

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
        let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
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
}

