use axum::{
    body::Body,
    http::{header, StatusCode},
    response::{Html, IntoResponse, Response},
};

use crate::mime::get_mime_type;

/// Serve static file or SPA index.html fallback from dist/frontend
pub fn serve_spa_file(path: &str) -> Response {
    let sanitized = path.trim_start_matches('/').replace('\\', "/");
    if sanitized.starts_with("api/") || sanitized == "api" {
        let json = serde_json::json!({
            "error": {
                "code": "not_found",
                "message": "API endpoint not found"
            }
        });
        let mut res = Response::new(Body::from(serde_json::to_vec(&json).unwrap()));
        *res.status_mut() = StatusCode::NOT_FOUND;
        res.headers_mut().insert(
            header::CONTENT_TYPE,
            header::HeaderValue::from_static("application/json"),
        );
        return res;
    }
    let candidate_dirs = [
        "dist/frontend",
        "frontend/dist",
        "../dist/frontend",
        "../frontend/dist",
    ];

    // 1. If path is a specific static file, try to serve it
    if !sanitized.is_empty() {
        for dir in &candidate_dirs {
            let file_path = std::path::Path::new(dir).join(&sanitized);
            if file_path.is_file() {
                if let Ok(bytes) = std::fs::read(&file_path) {
                    let ext = file_path
                        .extension()
                        .and_then(|s| s.to_str())
                        .unwrap_or("")
                        .to_lowercase();
                    let mime = get_mime_type(&ext);
                    let mut res = Response::new(Body::from(bytes));
                    if let Ok(val) = header::HeaderValue::from_str(mime) {
                        res.headers_mut().insert(header::CONTENT_TYPE, val);
                    }
                    if ext != "html" {
                        res.headers_mut().insert(
                            header::CACHE_CONTROL,
                            header::HeaderValue::from_static("public, max-age=31536000, immutable"),
                        );
                    }
                    return res;
                }
            }
        }
    }

    // 2. SPA fallback: serve index.html for client-side routing
    for dir in &candidate_dirs {
        let index_path = std::path::Path::new(dir).join("index.html");
        if index_path.is_file() {
            if let Ok(bytes) = std::fs::read(&index_path) {
                let mut res = Response::new(Body::from(bytes));
                res.headers_mut().insert(
                    header::CONTENT_TYPE,
                    header::HeaderValue::from_static("text/html; charset=utf-8"),
                );
                res.headers_mut().insert(
                    header::CACHE_CONTROL,
                    header::HeaderValue::from_static("no-cache"),
                );
                return res;
            }
        }
    }

    // 3. Fallback HTML if build artifacts are missing
    Html(r#"<!DOCTYPE html><html><head><meta charset="utf-8"><title>CMS</title></head><body><div id="root"><h1>CMS App</h1><p>Frontend assets not found in dist/frontend.</p></div></body></html>"#.to_string()).into_response()
}
