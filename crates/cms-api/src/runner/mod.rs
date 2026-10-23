use std::path::{Path, PathBuf};
use std::sync::Arc;

use axum::{
    extract::{Path as AxumPath, Query, Request, State},
    http::{header, HeaderValue, StatusCode},
    response::{IntoResponse, Json, Response},
    routing::get,
    Router,
};
use cms_error::AppError;
use cms_middleware::app_state::AppState;
use serde::{Deserialize, Serialize};
use sha2::Digest;
use sqlx::{FromRow, Postgres, QueryBuilder};
use tower::ServiceExt;
use tower_http::services::ServeFile;

pub const RUNNER_FILENAME: &str = if cfg!(windows) { "cms-docs.exe" } else { "cms-docs" };

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadItem {
    pub filename: String,
    pub size_bytes: u64,
    pub download_url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunnerInfoResponse {
    pub available: bool,
    pub filename: String,
    pub path: Option<String>,
    pub size_bytes: u64,
    pub version: String,
    pub download_url: String,
}

static DOWNLOADS_DIR: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();

/// Resolves the unified canonical public downloads directory (`public/downloads`).
/// Configurable via `CMS_DOWNLOADS_DIR` or `CMS_PUBLIC_DIR/downloads`.
/// Cached via OnceLock to prevent repeated directory traversal and I/O on every request.
pub fn get_downloads_dir() -> PathBuf {
    DOWNLOADS_DIR
        .get_or_init(|| {
            if let Ok(dir) = std::env::var("CMS_DOWNLOADS_DIR") {
                let p = PathBuf::from(dir.trim());
                if p.is_dir() {
                    return p.canonicalize().unwrap_or(p);
                }
            }

            if let Ok(public_dir) = std::env::var("CMS_PUBLIC_DIR") {
                let p = PathBuf::from(public_dir.trim()).join("downloads");
                if p.is_dir() {
                    return p.canonicalize().unwrap_or(p);
                }
            }

            let primary = Path::new("public/downloads");
            if primary.is_dir() {
                return primary.canonicalize().unwrap_or_else(|_| primary.to_path_buf());
            }

            let parent_path = Path::new("../../public/downloads");
            if parent_path.is_dir() {
                return parent_path.canonicalize().unwrap_or_else(|_| parent_path.to_path_buf());
            }

            let studio_path = Path::new("apps/studio/public/downloads");
            if studio_path.is_dir() {
                return studio_path.canonicalize().unwrap_or_else(|_| studio_path.to_path_buf());
            }

            let default_dir = PathBuf::from("public/downloads");
            let _ = std::fs::create_dir_all(&default_dir);
            default_dir.canonicalize().unwrap_or(default_dir)
        })
        .clone()
}

/// Resolves the runner binary filename in the downloads directory.
/// Checks the host platform binary first, but gracefully falls back if the
/// other platform executable is present (e.g. running Linux API server serving Windows runner).
pub fn resolve_runner_filename(dir: &Path) -> Option<String> {
    let candidates = if cfg!(windows) {
        ["cms-docs.exe", "cms-docs", "cms-site.exe", "cms-site"]
    } else {
        ["cms-docs", "cms-docs.exe", "cms-site", "cms-site.exe"]
    };

    for candidate in candidates {
        if dir.join(candidate).is_file() {
            return Some(candidate.to_string());
        }
    }
    None
}

/// Infer standard MIME content-type based on file extension
fn infer_mime_type(filename: &str) -> &'static str {
    if filename.ends_with(".exe") {
        "application/vnd.microsoft.portable-executable"
    } else if filename.ends_with(".sqlite") || filename.ends_with(".db") {
        "application/vnd.sqlite3"
    } else if filename.ends_with(".tar.gz") || filename.ends_with(".tgz") {
        "application/gzip"
    } else if filename.ends_with(".zip") {
        "application/zip"
    } else if filename.ends_with(".json") {
        "application/json"
    } else if filename.ends_with(".pdf") {
        "application/pdf"
    } else {
        "application/octet-stream"
    }
}

/// Streams a file with proper HTTP headers and range request support
async fn serve_download_file(file_path: &Path, filename: &str, req: Request) -> Result<Response, AppError> {
    let service = ServeFile::new(file_path);
    let res = service
        .oneshot(req)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("ServeFile error: {e}")))?;

    let status = res.status();
    let mut res = res.into_response();

    // Only inject body headers on successful content responses (200 OK or 206 Partial Content)
    if status.is_success() || status == axum::http::StatusCode::PARTIAL_CONTENT {
        let content_type = infer_mime_type(filename);
        res.headers_mut().insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static(content_type),
        );

        let disposition = format!("attachment; filename=\"{filename}\"");
        if let Ok(val) = HeaderValue::from_str(&disposition) {
            res.headers_mut().insert(header::CONTENT_DISPOSITION, val);
        }

        res.headers_mut().insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=60, must-revalidate"),
        );
    }

    Ok(res)
}

/// Handler for GET /api/downloads/{filename}: Generic unified downloads route for any artifact
pub async fn download_artifact_handler(
    AxumPath(filename): AxumPath<String>,
    req: Request,
) -> Result<Response, AppError> {
    // 1. Strict filename security validation
    if filename.is_empty()
        || filename.starts_with('.')
        || !filename.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
    {
        return Err(AppError::BadRequest(
            "Invalid filename: must be alphanumeric, dashes, dots, or underscores only and not start with '.'"
                .to_string(),
        ));
    }

    let dir = get_downloads_dir();
    let file_path = dir.join(&filename);

    if !file_path.is_file() {
        return Err(AppError::NotFound(format!("File '{filename}' not found in public downloads")));
    }

    // 2. Canonical containment check to guarantee no symlink escapes
    if let (Ok(canonical_dir), Ok(canonical_file)) = (dir.canonicalize(), file_path.canonicalize()) {
        if !canonical_file.starts_with(&canonical_dir) {
            return Err(AppError::Forbidden);
        }
    }

    serve_download_file(&file_path, &filename, req).await
}

/// Handler for GET /api/downloads: Lists all public downloadable artifacts in public/downloads/
pub async fn list_downloads_handler() -> Result<Json<Vec<DownloadItem>>, AppError> {
    let dir = get_downloads_dir();
    let mut items = Vec::new();

    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                let filename = entry.file_name().to_string_lossy().to_string();
                if filename.starts_with('.') {
                    continue; // Skip hidden / .gitkeep
                }
                let size_bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
                items.push(DownloadItem {
                    download_url: format!("/api/downloads/{filename}"),
                    filename,
                    size_bytes,
                });
            }
        }
    }

    items.sort_by(|a, b| a.filename.cmp(&b.filename));
    Ok(Json(items))
}

/// Handler for GET /api/runner/download: Direct shortcut to download runner binary from public downloads
pub async fn download_runner_handler(req: Request) -> Result<Response, AppError> {
    let dir = get_downloads_dir();
    let runner_name = resolve_runner_filename(&dir).unwrap_or_else(|| RUNNER_FILENAME.to_string());
    download_artifact_handler(AxumPath(runner_name), req).await
}

/// Handler for GET /api/runner/info: Checks runner status directly in public downloads
pub async fn runner_info_handler() -> Result<Json<RunnerInfoResponse>, AppError> {
    let dir = get_downloads_dir();
    let runner_name = resolve_runner_filename(&dir).unwrap_or_else(|| RUNNER_FILENAME.to_string());
    let runner_path = dir.join(&runner_name);

    let (available, size_bytes, path_str) = if runner_path.is_file() {
        let size = std::fs::metadata(&runner_path).map(|m| m.len()).unwrap_or(0);
        let display_path = runner_path.display().to_string();
        (true, size, Some(display_path))
    } else {
        (false, 0, None)
    };

    Ok(Json(RunnerInfoResponse {
        available,
        filename: runner_name,
        path: path_str,
        size_bytes,
        version: env!("CARGO_PKG_VERSION").to_string(),
        download_url: "/api/runner/download".to_string(),
    }))
}

#[derive(Debug, Deserialize)]
pub struct SyncManifestQuery {
    pub project: Option<String>,
    pub branch: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SyncDownloadQuery {
    pub export_id: Option<String>,
    pub artifact_id: Option<String>,
    pub filename: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunnerSyncManifest {
    pub has_update: bool,
    pub export_id: Option<String>,
    pub project_id: Option<String>,
    pub project_name: Option<String>,
    pub branch: Option<String>,
    pub etag: String,
    pub sha256: String,
    pub size_bytes: u64,
    pub exported_at: String,
    pub schema_version: u32,
    pub download_url: String,
}

#[derive(Debug, FromRow)]
struct SyncJobArtifactRow {
    job_id: String,
    project_id: Option<String>,
    project_name: Option<String>,
    completed_at: Option<chrono::DateTime<chrono::Utc>>,
    artifact_id: String,
    storage_path: String,
    _file_name: String,
    _file_size: i64,
}

async fn resolve_db_sync_manifest(
    state: &AppState,
    query: &SyncManifestQuery,
) -> Result<Option<RunnerSyncManifest>, AppError> {
    let mut qb: QueryBuilder<Postgres> = QueryBuilder::new(
        r#"
        SELECT
            j.id as job_id,
            j.project_id,
            p.name as project_name,
            j.completed_at,
            a.id as artifact_id,
            a.storage_path,
            a.file_name,
            a.file_size
        FROM "ExportJob" j
        JOIN "ExportArtifact" a ON a.job_id = j.id
        LEFT JOIN "Project" p ON p.id = j.project_id
        LEFT JOIN "ExportSnapshot" s ON s.id = j.snapshot_id
        LEFT JOIN "Branch" b ON b.id = s.branch_id
        WHERE j.status = 'COMPLETED'
          AND (a.format = 'SQLITE' OR a.file_name LIKE '%.sqlite')
        "#,
    );

    if let Some(ref proj) = query.project {
        let p = proj.trim();
        if !p.is_empty() {
            qb.push(" AND (j.project_id = ");
            qb.push_bind(p);
            qb.push(" OR p.slug = ");
            qb.push_bind(p);
            qb.push(")");
        }
    }

    if let Some(ref branch) = query.branch {
        let b = branch.trim();
        if !b.is_empty() {
            qb.push(" AND (b.name = ");
            qb.push_bind(b);
            qb.push(" OR b.slug = ");
            qb.push_bind(b);
            qb.push(")");
        }
    }

    qb.push(" ORDER BY j.completed_at DESC NULLS LAST, j.created_at DESC LIMIT 1");

    let row = qb
        .build_query_as::<SyncJobArtifactRow>()
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

    let Some(row) = row else {
        return Ok(None);
    };

    let etag = format!(
        "\"exp-{}-{}\"",
        row.job_id,
        row.completed_at.map(|c| c.timestamp()).unwrap_or(0)
    );

    let bytes = state.storage.get(&row.storage_path).await?;
    let sha256 = hex::encode(sha2::Sha256::digest(&bytes));

    Ok(Some(RunnerSyncManifest {
        has_update: true,
        export_id: Some(row.job_id),
        project_id: row.project_id,
        project_name: row.project_name,
        branch: query.branch.clone(),
        etag,
        sha256,
        size_bytes: bytes.len() as u64,
        exported_at: row.completed_at.unwrap_or_else(chrono::Utc::now).to_rfc3339(),
        schema_version: 1,
        download_url: format!("/api/runner/sync/download?artifact_id={}", row.artifact_id),
    }))
}

/// Handler for GET /api/runner/sync/manifest
/// Provides high-performance conditional synchronization check (HTTP 304 fast path).
pub async fn sync_manifest_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<SyncManifestQuery>,
    req: Request,
) -> Result<Response, AppError> {
    // 1. Try querying database for latest completed SQLite export
    if let Ok(Some(manifest)) = resolve_db_sync_manifest(&state, &query).await {
        if let Some(if_none_match) = req.headers().get(header::IF_NONE_MATCH) {
            if let Ok(val) = if_none_match.to_str() {
                if val.trim() == manifest.etag.trim() {
                    return Ok((
                        StatusCode::NOT_MODIFIED,
                        [
                            (
                                header::ETAG,
                                HeaderValue::from_str(&manifest.etag)
                                    .unwrap_or(HeaderValue::from_static("")),
                            ),
                            (
                                header::CACHE_CONTROL,
                                HeaderValue::from_static("public, max-age=10, must-revalidate"),
                            ),
                        ],
                    )
                        .into_response());
                }
            }
        }

        let mut res = Json(manifest).into_response();
        res.headers_mut().insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=10, must-revalidate"),
        );
        return Ok(res);
    }

    // 2. Fallback: check public downloads directory for docs.sqlite
    let dir = get_downloads_dir();
    let local_file = dir.join("docs.sqlite");
    if local_file.is_file() {
        if let Ok(meta) = local_file.metadata() {
            let size = meta.len();
            let mtime = meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH);
            let mtime_secs = mtime
                .duration_since(std::time::SystemTime::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let etag = format!("\"file-docs-{}-{}\"", size, mtime_secs);

            if let Some(if_none_match) = req.headers().get(header::IF_NONE_MATCH) {
                if let Ok(val) = if_none_match.to_str() {
                    if val.trim() == etag.trim() {
                        return Ok((
                            StatusCode::NOT_MODIFIED,
                            [
                                (
                                    header::ETAG,
                                    HeaderValue::from_str(&etag)
                                        .unwrap_or(HeaderValue::from_static("")),
                                ),
                                (
                                    header::CACHE_CONTROL,
                                    HeaderValue::from_static("public, max-age=10, must-revalidate"),
                                ),
                            ],
                        )
                            .into_response());
                    }
                }
            }

            let sha256 = if let Ok(bytes) = std::fs::read(&local_file) {
                hex::encode(sha2::Sha256::digest(&bytes))
            } else {
                String::new()
            };

            let manifest = RunnerSyncManifest {
                has_update: true,
                export_id: Some("public-docs".to_string()),
                project_id: query.project.clone(),
                project_name: Some("Local Docs".to_string()),
                branch: query.branch.clone(),
                etag,
                sha256,
                size_bytes: size,
                exported_at: chrono::DateTime::<chrono::Utc>::from(mtime).to_rfc3339(),
                schema_version: 1,
                download_url: "/api/downloads/docs.sqlite".to_string(),
            };

            let mut res = Json(manifest).into_response();
            res.headers_mut().insert(
                header::CACHE_CONTROL,
                HeaderValue::from_static("public, max-age=10, must-revalidate"),
            );
            return Ok(res);
        }
    }

    // 3. No update or database available
    let empty_manifest = RunnerSyncManifest {
        has_update: false,
        export_id: None,
        project_id: query.project,
        project_name: None,
        branch: query.branch,
        etag: "\"empty\"".to_string(),
        sha256: String::new(),
        size_bytes: 0,
        exported_at: chrono::Utc::now().to_rfc3339(),
        schema_version: 1,
        download_url: String::new(),
    };

    Ok(Json(empty_manifest).into_response())
}

/// Handler for GET /api/runner/sync/download
/// Serves the requested documentation database artifact with caching headers.
pub async fn sync_download_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<SyncDownloadQuery>,
    req: Request,
) -> Result<Response, AppError> {
    if let Some(ref art_id) = query.artifact_id {
        let row = sqlx::query_as::<_, (String, String, Option<chrono::DateTime<chrono::Utc>>)>(
            r#"SELECT a.storage_path, a.file_name, a.created_at FROM "ExportArtifact" a WHERE a.id = $1"#,
        )
        .bind(art_id)
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        if let Some((storage_path, file_name, created_at)) = row {
            let etag = format!(
                "\"art-{}-{}\"",
                art_id,
                created_at.map(|c| c.timestamp()).unwrap_or(0)
            );
            if let Some(if_none_match) = req.headers().get(header::IF_NONE_MATCH) {
                if let Ok(val) = if_none_match.to_str() {
                    if val.trim() == etag.trim() {
                        return Ok((
                            StatusCode::NOT_MODIFIED,
                            [(
                                header::ETAG,
                                HeaderValue::from_str(&etag).unwrap_or(HeaderValue::from_static("")),
                            )],
                        )
                            .into_response());
                    }
                }
            }

            let bytes = state.storage.get(&storage_path).await?;
            let mut res = bytes.into_response();
            res.headers_mut().insert(
                header::CONTENT_TYPE,
                HeaderValue::from_static("application/vnd.sqlite3"),
            );
            if let Ok(h) = HeaderValue::from_str(&etag) {
                res.headers_mut().insert(header::ETAG, h);
            }
            res.headers_mut().insert(
                header::CACHE_CONTROL,
                HeaderValue::from_static("public, max-age=60, must-revalidate"),
            );
            let disp = format!("attachment; filename=\"{}\"", file_name);
            if let Ok(h) = HeaderValue::from_str(&disp) {
                res.headers_mut().insert(header::CONTENT_DISPOSITION, h);
            }
            return Ok(res);
        }
    }

    if let Some(ref filename) = query.filename {
        return download_artifact_handler(AxumPath(filename.clone()), req).await;
    }

    // Default to docs.sqlite if present in downloads
    let dir = get_downloads_dir();
    let default_file = dir.join("docs.sqlite");
    if default_file.is_file() {
        return serve_download_file(&default_file, "docs.sqlite", req).await;
    }

    Err(AppError::NotFound(
        "Requested documentation database artifact not found".to_string(),
    ))
}

/// Router for /api/runner
pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/download", get(download_runner_handler))
        .route("/info", get(runner_info_handler))
        .route("/sync/manifest", get(sync_manifest_handler))
        .route("/sync/download", get(sync_download_handler))
        .with_state(state)
}

/// Router for /api/downloads (unified public downloads folder for all artifacts)
pub fn downloads_router(_state: Arc<AppState>) -> Router {
    Router::new()
        .route("/", get(list_downloads_handler))
        .route("/{filename}", get(download_artifact_handler))
}
