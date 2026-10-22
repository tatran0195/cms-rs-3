use std::path::{Path, PathBuf};
use std::sync::Arc;

use axum::{
    extract::Request,
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
pub struct RunnerInfoResponse {
    pub available: bool,
    pub filename: String,
    pub path: Option<String>,
    pub size_bytes: u64,
    pub version: String,
    pub download_url: String,
}

pub fn find_runner_executable() -> Option<PathBuf> {
    // 1. Check explicit environment override
    if let Ok(explicit) = std::env::var("CMS_RUNNER_PATH") {
        let p = PathBuf::from(explicit.trim());
        if p.is_file() {
            return p.canonicalize().ok().or(Some(p));
        }
    }

    // 2. Check public directory specified in environment
    if let Ok(public_dir) = std::env::var("CMS_PUBLIC_DIR") {
        let candidates = [
            PathBuf::from(&public_dir).join("downloads").join("cms-site.exe"),
            PathBuf::from(&public_dir).join("downloads").join("cms-site"),
            PathBuf::from(&public_dir).join("cms-site.exe"),
            PathBuf::from(&public_dir).join("cms-site"),
        ];
        for p in candidates {
            if p.is_file() {
                return p.canonicalize().ok().or(Some(p));
            }
        }
    }

    // 3. Check public directories and target release locations
    let candidates = [
        // Public downloads directory (primary distribution point)
        "public/downloads/cms-site.exe",
        "public/downloads/cms-site",
        "public/cms-site.exe",
        "public/runner/cms-site.exe",
        "apps/studio/public/downloads/cms-site.exe",
        "apps/studio/public/downloads/cms-site",
        "dist/downloads/cms-site.exe",
        "dist/downloads/cms-site",
        "dist/frontend/downloads/cms-site.exe",
        // Release build artifacts
        "target/release/cms-site.exe",
        "target/release/cms-site",
        "release/cms-site.exe",
        "release/cms-site",
        // Parent workspace relative paths
        "../../public/downloads/cms-site.exe",
        "../../public/downloads/cms-site",
        "../../target/release/cms-site.exe",
        "../../target/release/cms-site",
        "../target/release/cms-site.exe",
        "../target/release/cms-site",
        // Debug fallback during local development
        "target/debug/cms-site.exe",
        "target/debug/cms-site",
        "../../target/debug/cms-site.exe",
        "../target/debug/cms-site.exe",
    ];

    for candidate in candidates {
        let p = Path::new(candidate);
        if p.is_file() {
            if let Ok(canon) = p.canonicalize() {
                return Some(canon);
            }
            return Some(p.to_path_buf());
        }
    }

    // 4. Check Windows user programs directory
    if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
        let p = PathBuf::from(local_appdata)
            .join("Programs")
            .join("cms-site")
            .join("cms-site.exe");
        if p.is_file() {
            return Some(p);
        }
    }

    // 5. Check sibling to current running executable
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            let win = parent.join("cms-site.exe");
            if win.is_file() {
                return Some(win);
            }
            let nix = parent.join("cms-site");
            if nix.is_file() {
                return Some(nix);
            }
        }
    }

    None
}

/// Handler for GET /api/runner/info (or /api/app/runner/info)
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

/// Handler for GET /api/runner/download (or /api/app/runner/download)
pub async fn download_runner_handler(req: Request) -> Result<Response, AppError> {
    let runner_path = find_runner_executable().ok_or_else(|| {
        AppError::NotFound("Runner executable (cms-site.exe) not found on server".to_string())
    })?;

    let filename = runner_path
        .file_name()
        .and_then(|f| f.to_str())
        .unwrap_or("cms-site.exe")
        .to_string();

    let is_windows = filename.ends_with(".exe");
    let content_type = if is_windows {
        "application/vnd.microsoft.portable-executable"
    } else {
        "application/octet-stream"
    };

    let service = ServeFile::new(&runner_path);
    let res = service
        .oneshot(req)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("ServeFile error: {e}")))?;

    let mut res = res.into_response();

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

pub fn router(_state: Arc<AppState>) -> Router {
    Router::new()
        .route("/download", get(download_runner_handler))
        .route("/info", get(runner_info_handler))
}
