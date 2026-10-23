use std::sync::Arc;

use rmcp::{
    handler::server::wrapper::Parameters,
    model::*,
    service::ServiceExt,
    tool, tool_handler, tool_router, ErrorData, ServerHandler,
    transport::streamable_http_server::{
        session::local::LocalSessionManager, tower::StreamableHttpService,
        StreamableHttpServerConfig,
    },
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};

use crate::{execute_search, query_bootstrap, query_page, TantivySiteSearch};

#[inline]
fn mcp_err(code: ErrorCode, msg: impl Into<String>) -> ErrorData {
    ErrorData::new(code, msg.into(), None)
}

/// Parameters for documentation search.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SearchDocsParams {
    /// Keyword search query or question
    pub query: String,
    /// Optional language code filter (e.g., "en", "ja")
    pub language: Option<String>,
    /// Optional version slug or ID (e.g., "v1", "latest")
    pub version: Option<String>,
    /// Maximum search hits to return (default: 10, max: 50)
    pub limit: Option<usize>,
}

/// Parameters for retrieving page content.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GetPageParams {
    /// Page UUID, custom ID (e.g., "auth-guide"), or path (e.g., "/getting-started")
    pub id_or_path: String,
    /// Optional language code (defaults to project default language)
    pub language: Option<String>,
    /// Optional version slug or ID (defaults to default version)
    pub version: Option<String>,
    /// Max character limit for markdown content truncation
    pub max_chars: Option<usize>,
}

/// Parameters for listing pages in the site.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListPagesParams {
    /// Optional version slug or ID (defaults to default version)
    pub version: Option<String>,
}

/// Parameters for opening a page in the default web browser.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct OpenPageParams {
    /// Page UUID, custom ID, or path to open in browser
    pub id_or_path: String,
}

/// Parameters for listing available documentation versions.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, Default)]
pub struct ListVersionsParams {}

/// Summary of a documentation version with page counts.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionSummary {
    pub id: String,
    pub slug: String,
    pub label: String,
    pub is_default: bool,
    pub sort_order: i64,
    pub page_count: i64,
}

/// Parameters for getting project information.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, Default)]
pub struct GetProjectInfoParams {}

/// MCP Handler for offline CMS Runner site documentation.
#[derive(Clone)]
pub struct RunnerMcpHandler {
    pub db: SqlitePool,
    pub search: Option<Arc<TantivySiteSearch>>,
    pub server_url: String,
    pub state: Option<crate::AppState>,
}

impl RunnerMcpHandler {
    pub fn new(
        db: SqlitePool,
        search: Option<Arc<TantivySiteSearch>>,
        server_url: String,
    ) -> Self {
        Self {
            db,
            search,
            server_url,
            state: None,
        }
    }

    pub fn with_state(
        db: SqlitePool,
        search: Option<Arc<TantivySiteSearch>>,
        server_url: String,
        state: crate::AppState,
    ) -> Self {
        Self {
            db,
            search,
            server_url,
            state: Some(state),
        }
    }

    pub async fn current_db(&self) -> SqlitePool {
        if let Some(ref s) = self.state {
            s.get_db().await
        } else {
            self.db.clone()
        }
    }

    pub async fn current_search(&self) -> Option<Arc<TantivySiteSearch>> {
        if let Some(ref s) = self.state {
            s.get_search().await
        } else {
            self.search.clone()
        }
    }

    /// Resolves an identifier, custom_id, or path to a concrete documentation path.
    pub async fn resolve_target_path(&self, id_or_path: &str) -> anyhow::Result<Option<String>> {
        let clean_id = id_or_path.trim().trim_matches('/');
        if clean_id.is_empty() {
            return Ok(None);
        }

        let db = self.current_db().await;

        let row_opt = sqlx::query(
            "SELECT id, kind, path FROM pages WHERE id = ?1 OR custom_id = ?1 OR path = ?1 OR path = ?2 OR slug = ?1 LIMIT 1",
        )
        .bind(clean_id)
        .bind(format!("/{}", clean_id))
        .fetch_optional(&db)
        .await?;

        let (page_id, kind, mut target_path) = match row_opt {
            Some(row) => {
                let id: String = row.try_get(0).unwrap_or_default();
                let kind: String = row.try_get(1).unwrap_or_default();
                let path: String = row.try_get(2).unwrap_or_default();
                (id, kind, path)
            }
            None => return Ok(None),
        };

        if kind.eq_ignore_ascii_case("GROUP") {
            let child_opt = sqlx::query(
                "SELECT path FROM pages WHERE parent_id = ?1 AND kind = 'PAGE' ORDER BY sort_order ASC, id ASC LIMIT 1",
            )
            .bind(&page_id)
            .fetch_optional(&db)
            .await?;

            if let Some(child_row) = child_opt {
                if let Ok(child_path) = child_row.try_get::<String, _>(0) {
                    target_path = child_path;
                }
            } else if let Ok(Some(any_child)) = sqlx::query(
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

        Ok(Some(target_path))
    }
}

#[tool_router]
impl RunnerMcpHandler {
    #[tool(description = "Search documentation using Tantivy full-text index and SQLite FTS5")]
    pub async fn search_docs(
        &self,
        Parameters(args): Parameters<SearchDocsParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let clean_q = args.query.trim();
        if clean_q.is_empty() {
            return Ok(CallToolResult::success(vec![ContentBlock::text("No search query provided")]));
        }

        let limit = args.limit.unwrap_or(10).min(50);
        let lang = args.language.as_deref();
        let version = args.version.as_deref();

        let db = self.current_db().await;
        let search = self.current_search().await;

        let hits = if let Some(ref search_engine) = search {
            match search_engine.search(clean_q, lang, version, limit) {
                Ok(results) => results,
                Err(e) => {
                    tracing::warn!("Tantivy search error ({}); falling back to SQLite FTS5", e);
                    execute_search(&db, clean_q, limit, lang, version)
                        .await
                        .map_err(|e| mcp_err(ErrorCode::INTERNAL_ERROR, e.to_string()))?
                }
            }
        } else {
            execute_search(&db, clean_q, limit, lang, version)
                .await
                .map_err(|e| mcp_err(ErrorCode::INTERNAL_ERROR, e.to_string()))?
        };

        let json_text = serde_json::to_string_pretty(&hits)
            .map_err(|e| mcp_err(ErrorCode::INTERNAL_ERROR, e.to_string()))?;

        Ok(CallToolResult::success(vec![ContentBlock::text(json_text)]))
    }

    #[tool(description = "Get full markdown content, outline, and metadata for a documentation page by UUID, custom ID, or path")]
    pub async fn get_page(
        &self,
        Parameters(args): Parameters<GetPageParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let resolved_path = match self.resolve_target_path(&args.id_or_path).await {
            Ok(Some(p)) => p,
            Ok(None) => {
                return Err(mcp_err(
                    ErrorCode::INVALID_PARAMS,
                    format!("Documentation page or custom ID '{}' not found", args.id_or_path),
                ));
            }
            Err(e) => return Err(mcp_err(ErrorCode::INTERNAL_ERROR, e.to_string())),
        };

        let db = self.current_db().await;

        let page_resp = match query_page(
            &db,
            &resolved_path,
            args.language.as_deref(),
            args.version.as_deref(),
        )
        .await
        {
            Ok(Some(p)) => p,
            Ok(None) => {
                return Err(mcp_err(
                    ErrorCode::INVALID_PARAMS,
                    format!("Page content not found at path '{}'", resolved_path),
                ));
            }
            Err(e) => return Err(mcp_err(ErrorCode::INTERNAL_ERROR, e.to_string())),
        };

        let mut content = page_resp.page.content;
        if let Some(max_len) = args.max_chars {
            if content.len() > max_len {
                content.truncate(max_len);
                content.push_str("\n\n... [Content truncated due to max_chars limit]");
            }
        }

        let headings_summary = page_resp
            .page
            .headings
            .iter()
            .map(|h| format!("{} {}", "#".repeat(h.depth as usize), h.text))
            .collect::<Vec<_>>()
            .join("\n");

        let formatted = format!(
            "# {}\nPath: {}\nVersion: {}\nLanguage: {}\n\n## Table of Contents\n{}\n\n---\n\n{}",
            page_resp.page.title,
            page_resp.page.path,
            page_resp.active_version,
            page_resp.active_language,
            if headings_summary.is_empty() { "(None)" } else { &headings_summary },
            content
        );

        Ok(CallToolResult::success(vec![ContentBlock::text(formatted)]))
    }

    #[tool(description = "List all documentation pages, custom IDs, and hierarchy for a version")]
    pub async fn list_pages(
        &self,
        Parameters(args): Parameters<ListPagesParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let db = self.current_db().await;

        let shell = match query_bootstrap(&db, None, args.version.as_deref()).await {
            Ok(s) => s,
            Err(e) => return Err(mcp_err(ErrorCode::INTERNAL_ERROR, e.to_string())),
        };

        let resolved_version_id = shell
            .versions
            .iter()
            .find(|v| v.slug == shell.active_version || v.id == shell.active_version)
            .map(|v| v.id.clone())
            .unwrap_or(shell.active_version);

        // Query pages table directly to get custom_ids
        let rows = sqlx::query(
            "SELECT id, custom_id, parent_id, kind, slug, path, title, sort_order FROM pages WHERE version_id = ?1 OR version_id = (SELECT id FROM versions WHERE slug = ?1 LIMIT 1) ORDER BY sort_order ASC, id ASC",
        )
        .bind(&resolved_version_id)
        .fetch_all(&db)
        .await
        .map_err(|e| mcp_err(ErrorCode::INTERNAL_ERROR, e.to_string()))?;

        #[derive(Serialize)]
        struct PageItemSummary {
            id: String,
            custom_id: Option<String>,
            parent_id: Option<String>,
            kind: String,
            slug: String,
            path: String,
            title: String,
            sort_order: i64,
        }

        let mut items = Vec::new();
        for r in rows {
            items.push(PageItemSummary {
                id: r.try_get(0).unwrap_or_default(),
                custom_id: r.try_get(1).ok(),
                parent_id: r.try_get(2).ok(),
                kind: r.try_get(3).unwrap_or_default(),
                slug: r.try_get(4).unwrap_or_default(),
                path: r.try_get(5).unwrap_or_default(),
                title: r.try_get(6).unwrap_or_default(),
                sort_order: r.try_get(7).unwrap_or(0),
            });
        }

        let json_text = serde_json::to_string_pretty(&items)
            .map_err(|e| mcp_err(ErrorCode::INTERNAL_ERROR, e.to_string()))?;

        Ok(CallToolResult::success(vec![ContentBlock::text(json_text)]))
    }

    #[tool(description = "Open a documentation page or custom ID in the user's default web browser")]
    pub async fn open_page(
        &self,
        Parameters(args): Parameters<OpenPageParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let clean_id = args.id_or_path.trim().trim_matches('/');
        let target_url = format!("{}/p/{}", self.server_url.trim_end_matches('/'), clean_id);

        crate::windows::open_url_in_browser(&target_url)
            .map_err(|e| mcp_err(ErrorCode::INTERNAL_ERROR, format!("Failed to open browser: {e}")))?;

        Ok(CallToolResult::success(vec![ContentBlock::text(format!(
            "Opened '{}' in default web browser via {}",
            clean_id, target_url
        ))]))
    }

    #[tool(description = "Get project metadata, name, description, export timestamp, and configured languages and versions")]
    pub async fn get_project_info(
        &self,
        Parameters(_args): Parameters<GetProjectInfoParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let db = self.current_db().await;

        let shell = match query_bootstrap(&db, None, None).await {
            Ok(s) => s,
            Err(e) => return Err(mcp_err(ErrorCode::INTERNAL_ERROR, e.to_string())),
        };

        let json_text = serde_json::to_string_pretty(&serde_json::json!({
            "project": shell.project,
            "languages": shell.languages,
            "versions": shell.versions,
            "activeLanguage": shell.active_language,
            "activeVersion": shell.active_version,
            "generatedAt": shell.generated_at,
        }))
        .map_err(|e| mcp_err(ErrorCode::INTERNAL_ERROR, e.to_string()))?;

        Ok(CallToolResult::success(vec![ContentBlock::text(json_text)]))
    }

    #[tool(description = "List all available documentation versions and branches with page counts")]
    pub async fn list_versions(
        &self,
        Parameters(_args): Parameters<ListVersionsParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let db = self.current_db().await;

        let rows = sqlx::query(
            "SELECT v.id, v.slug, v.label, v.is_default, v.sort_order, COUNT(p.id) \
             FROM versions v \
             LEFT JOIN pages p ON p.version_id = v.id \
             GROUP BY v.id \
             ORDER BY v.sort_order ASC",
        )
        .fetch_all(&db)
        .await
        .map_err(|e| mcp_err(ErrorCode::INTERNAL_ERROR, e.to_string()))?;

        let mut versions = Vec::new();
        for r in rows {
            versions.push(VersionSummary {
                id: r.try_get(0).unwrap_or_default(),
                slug: r.try_get(1).unwrap_or_default(),
                label: r.try_get(2).unwrap_or_default(),
                is_default: r.try_get::<i32, _>(3).unwrap_or(0) == 1,
                sort_order: r.try_get(4).unwrap_or(0),
                page_count: r.try_get(5).unwrap_or(0),
            });
        }

        let json_text = serde_json::to_string_pretty(&versions)
            .map_err(|e| mcp_err(ErrorCode::INTERNAL_ERROR, e.to_string()))?;
        Ok(CallToolResult::success(vec![ContentBlock::text(json_text)]))
    }
}

#[tool_handler]
impl ServerHandler for RunnerMcpHandler {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(
            ServerCapabilities::builder()
                .enable_tools()
                .build(),
        )
        .with_server_info(Implementation::new("cms-site-mcp", env!("CARGO_PKG_VERSION")))
        .with_instructions(
            "Offline Documentation MCP Server. Query full-text search, retrieve Markdown pages, inspect page hierarchy, and open documentation pages in browser.",
        )
    }
}

/// Create a Streamable HTTP Tower service for mounting into the Axum runner router at `/mcp`.
pub fn create_mcp_http_service(
    pool: SqlitePool,
    search: Option<Arc<TantivySiteSearch>>,
    server_url: String,
    state: Option<crate::AppState>,
) -> StreamableHttpService<RunnerMcpHandler, LocalSessionManager> {
    let handler = RunnerMcpHandler {
        db: pool,
        search,
        server_url,
        state,
    };
    StreamableHttpService::new(
        move || Ok(handler.clone()),
        Arc::new(LocalSessionManager::default()),
        StreamableHttpServerConfig::default().with_json_response(true),
    )
}

/// Run the Runner MCP server over stdio transport (zero stdout pollution, stderr logging).
pub async fn run_stdio(
    pool: SqlitePool,
    search: Option<Arc<TantivySiteSearch>>,
    server_url: String,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let handler = RunnerMcpHandler::new(pool, search, server_url);
    let running = handler.serve(rmcp::transport::stdio()).await?;
    running.waiting().await?;
    Ok(())
}
