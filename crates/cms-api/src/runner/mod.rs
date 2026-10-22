use std::path::{Path, PathBuf};
use std::sync::Arc;

use axum::{
    extract::{Path as AxumPath, Request},
    http::{header, HeaderValue},
    response::{IntoResponse, Json, Response},
    routing::get,
    Router,
};
use cms_error::AppError;
use cms_middleware::app_state::AppState;
use serde::Serialize;
use tower::ServiceExt;
use tower_http::services::ServeFile;

pub const RUNNER_FILENAME: &str = if cfg!(windows) { "cms-site.exe" } else { "cms-site" };

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
    if dir.join(RUNNER_FILENAME).is_file() {
        return Some(RUNNER_FILENAME.to_string());
    }
    let alt = if RUNNER_FILENAME == "cms-site.exe" { "cms-site" } else { "cms-site.exe" };
    if dir.join(alt).is_file() {
        return Some(alt.to_string());
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

/// Router for /api/runner
pub fn router(_state: Arc<AppState>) -> Router {
    Router::new()
        .route("/download", get(download_runner_handler))
        .route("/info", get(runner_info_handler))
}

/// Router for /api/downloads (unified public downloads folder for all artifacts)
pub fn downloads_router(_state: Arc<AppState>) -> Router {
    Router::new()
        .route("/", get(list_downloads_handler))
        .route("/{filename}", get(download_artifact_handler))
}
