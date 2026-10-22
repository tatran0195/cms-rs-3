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

/// Resolves the unified canonical public downloads directory (`public/downloads`).
/// Overridable via `CMS_DOWNLOADS_DIR` or `CMS_PUBLIC_DIR/downloads`.
pub fn get_downloads_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("CMS_DOWNLOADS_DIR") {
        let p = PathBuf::from(dir.trim());
        if p.is_dir() {
            return p;
        }
    }

    if let Ok(public_dir) = std::env::var("CMS_PUBLIC_DIR") {
        let p = PathBuf::from(public_dir.trim()).join("downloads");
        if p.is_dir() {
            return p;
        }
    }

    let primary = Path::new("public/downloads");
    if primary.is_dir() {
        return primary.to_path_buf();
    }

    let parent_path = Path::new("../../public/downloads");
    if parent_path.is_dir() {
        return parent_path.to_path_buf();
    }

    let studio_path = Path::new("apps/studio/public/downloads");
    if studio_path.is_dir() {
        return studio_path.to_path_buf();
    }

    let default_dir = PathBuf::from("public/downloads");
    let _ = std::fs::create_dir_all(&default_dir);
    default_dir
}

/// Locates the runner executable directly within the unified downloads folder.
/// Automatically seeds from `target/release` during local development if missing.
pub fn find_runner_executable() -> Option<PathBuf> {
    let dir = get_downloads_dir();
    let exe_name = if cfg!(windows) { "cms-site.exe" } else { "cms-site" };
    let primary = dir.join(exe_name);

    if primary.is_file() {
        return Some(primary);
    }

    // Secondary check for alternate binary extension
    let alt_name = if cfg!(windows) { "cms-site" } else { "cms-site.exe" };
    let alt = dir.join(alt_name);
    if alt.is_file() {
        return Some(alt);
    }

    // If running in development without initial download seed, copy from target/release
    let build_sources = [
        PathBuf::from("target/release").join(exe_name),
        PathBuf::from("../../target/release").join(exe_name),
        PathBuf::from("target/debug").join(exe_name),
        PathBuf::from("../../target/debug").join(exe_name),
    ];
    for src in build_sources {
        if src.is_file() {
            let _ = std::fs::copy(&src, &primary);
            if primary.is_file() {
                return Some(primary);
            }
            return Some(src);
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

    let mut res = res.into_response();
    let content_type = infer_mime_type(filename);

    res.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static(content_type),
    );

    let disposition = format!("attachment; filename=\"{filename}\"");
    if let Ok(val) = HeaderValue::from_str(&disposition) {
        res.headers_mut().insert(header::CONTENT_DISPOSITION, val);
    }

    Ok(res)
}

/// Handler for GET /api/runner/info
pub async fn runner_info_handler() -> Result<Json<RunnerInfoResponse>, AppError> {
    let runner_path = find_runner_executable();

    let (available, filename, size_bytes, path_str) = match runner_path {
        Some(ref p) => {
            let fname = p
                .file_name()
                .and_then(|f| f.to_str())
                .unwrap_or("cms-site.exe")
                .to_string();
            let size = std::fs::metadata(p).map(|m| m.len()).unwrap_or(0);
            let display_path = p.display().to_string();
            (true, fname, size, Some(display_path))
        }
        None => (false, "cms-site.exe".to_string(), 0, None),
    };

    Ok(Json(RunnerInfoResponse {
        available,
        filename,
        path: path_str,
        size_bytes,
        version: env!("CARGO_PKG_VERSION").to_string(),
        download_url: "/api/runner/download".to_string(),
    }))
}

/// Handler for GET /api/runner/download
pub async fn download_runner_handler(req: Request) -> Result<Response, AppError> {
    let runner_path = find_runner_executable().ok_or_else(|| {
        AppError::NotFound("Runner executable (cms-site.exe) not found in public downloads folder".to_string())
    })?;

    let filename = runner_path
        .file_name()
        .and_then(|f| f.to_str())
        .unwrap_or("cms-site.exe")
        .to_string();

    serve_download_file(&runner_path, &filename, req).await
}

/// Handler for GET /api/downloads: Lists all public downloadable artifacts
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

/// Handler for GET /api/downloads/{filename}: Generic unified downloads route for any artifact
pub async fn download_artifact_handler(
    AxumPath(filename): AxumPath<String>,
    req: Request,
) -> Result<Response, AppError> {
    // Prevent directory traversal attacks
    if filename.is_empty()
        || filename.contains('/')
        || filename.contains('\\')
        || filename.contains("..")
    {
        return Err(AppError::BadRequest("Invalid filename".to_string()));
    }

    let dir = get_downloads_dir();
    let file_path = dir.join(&filename);

    if !file_path.is_file() {
        return Err(AppError::NotFound(format!("File '{filename}' not found in public downloads")));
    }

    serve_download_file(&file_path, &filename, req).await
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
