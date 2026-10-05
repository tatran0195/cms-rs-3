use std::path::{Component, Path, PathBuf};

use axum::{
    body::Body,
    http::{header, StatusCode},
    response::{Html, IntoResponse, Response},
};

use crate::mime::get_mime_type;

/// Resolve configured frontend asset root.
pub fn get_asset_root() -> PathBuf {
    if let Ok(dir) = std::env::var("FRONTEND_DIR") {
        let trimmed = dir.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    let default_path = Path::new("dist/frontend");
    if default_path.exists() {
        return default_path.to_path_buf();
    }
    let parent_path = Path::new("../../dist/frontend");
    if parent_path.exists() {
        return parent_path.to_path_buf();
    }
    default_path.to_path_buf()
}

/// Percent-decode a UTF-8 string. Returns None if malformed.
fn percent_decode(input: &str) -> Option<String> {
    let mut bytes = Vec::with_capacity(input.len());
    let mut chars = input.bytes();
    while let Some(b) = chars.next() {
        if b == b'%' {
            let h1 = chars.next()?;
            let h2 = chars.next()?;
            let hex_bytes = [h1, h2];
            let hex_str = std::str::from_utf8(&hex_bytes).ok()?;
            let byte = u8::from_str_radix(hex_str, 16).ok()?;
            bytes.push(byte);
        } else {
            bytes.push(b);
        }
    }
    String::from_utf8(bytes).ok()
}

/// Validate that a requested path is strictly relative and contains no directory
/// traversal, backslashes, double slashes, or absolute components.
fn validate_relative_path(path: &str) -> Result<PathBuf, &'static str> {
    if path.is_empty() {
        return Ok(PathBuf::new());
    }

    // Reject backslashes and double-slashes in the raw path
    if path.contains('\\') || path.contains("//") {
        return Err("Path contains invalid separators");
    }

    // Reject raw traversal sequence
    if path.contains("..") {
        return Err("Path contains directory traversal");
    }

    // Repeated percent-decoding to guard against double-encoding attacks
    let mut decoded = path.to_string();
    for _ in 0..3 {
        if let Some(next) = percent_decode(&decoded) {
            if next == decoded {
                break;
            }
            decoded = next;
        } else {
            return Err("Invalid percent-encoding");
        }
    }

    // Reject traversal, null bytes, backslashes, double-slashes, or colon in decoded form
    if decoded.contains('\0')
        || decoded.contains('\\')
        || decoded.contains("//")
        || decoded.contains("..")
        || decoded.contains(':')
    {
        return Err("Decoded path contains invalid components");
    }

    // Strip at most one leading slash if present
    let normalized = if let Some(stripped) = decoded.strip_prefix('/') {
        if stripped.starts_with('/') {
            return Err("Path contains leading double slash");
        }
        stripped
    } else {
        &decoded
    };

    let rel_path = Path::new(normalized);
    for component in rel_path.components() {
        match component {
            Component::Normal(_) => {}
            _ => return Err("Path contains non-normal component"),
        }
    }

    Ok(rel_path.to_path_buf())
}

/// Fallback HTML when assets are missing.
fn fallback_html_response() -> Response {
    Html(r#"<!DOCTYPE html><html><head><meta charset="utf-8"><title>CMS</title></head><body><div id="root"><h1>CMS App</h1><p>Frontend assets not found in dist/frontend.</p></div></body></html>"#.to_string()).into_response()
}

/// Serve static file or SPA index.html fallback from a specified root directory,
/// verifying that the canonical target strictly remains inside the asset root.
pub fn serve_spa_file_from_root(path: &str, asset_root: &Path) -> Response {
    let trimmed = path.trim_start_matches('/');
    if trimmed.starts_with("api/") || trimmed == "api" {
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

    let rel_path = match validate_relative_path(path) {
        Ok(p) => p,
        Err(err) => {
            let json = serde_json::json!({
                "error": {
                    "code": "invalid_path",
                    "message": err
                }
            });
            let mut res = Response::new(Body::from(serde_json::to_vec(&json).unwrap()));
            *res.status_mut() = StatusCode::BAD_REQUEST;
            res.headers_mut().insert(
                header::CONTENT_TYPE,
                header::HeaderValue::from_static("application/json"),
            );
            return res;
        }
    };

    let canonical_root = match asset_root.canonicalize() {
        Ok(r) => r,
        Err(_) => return fallback_html_response(),
    };

    // 1. If path points to a specific static file, verify confinement and serve it
    if !rel_path.as_os_str().is_empty() {
        let file_path = canonical_root.join(&rel_path);
        if let Ok(canonical_file) = file_path.canonicalize() {
            if !canonical_file.starts_with(&canonical_root) {
                let json = serde_json::json!({
                    "error": {
                        "code": "forbidden",
                        "message": "Path escapes asset root"
                    }
                });
                let mut res = Response::new(Body::from(serde_json::to_vec(&json).unwrap()));
                *res.status_mut() = StatusCode::FORBIDDEN;
                res.headers_mut().insert(
                    header::CONTENT_TYPE,
                    header::HeaderValue::from_static("application/json"),
                );
                return res;
            }

            if canonical_file.is_file() {
                if let Ok(bytes) = std::fs::read(&canonical_file) {
                    let ext = canonical_file
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
    let index_path = canonical_root.join("index.html");
    if let Ok(canonical_index) = index_path.canonicalize() {
        if canonical_index.starts_with(&canonical_root) && canonical_index.is_file() {
            if let Ok(bytes) = std::fs::read(&canonical_index) {
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
    fallback_html_response()
}

/// Serve static file or SPA index.html fallback from the configured frontend root.
pub fn serve_spa_file(path: &str) -> Response {
    serve_spa_file_from_root(path, &get_asset_root())
}

#[cfg(test)]
mod tests {
    use std::fs;
    use tempfile::tempdir;

    use super::*;

    #[test]
    fn test_plain_traversal_rejected() {
        let dir = tempdir().unwrap();
        let res = serve_spa_file_from_root("../../etc/passwd", dir.path());
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);

        let res2 = serve_spa_file_from_root("..\\..\\etc\\passwd", dir.path());
        assert_eq!(res2.status(), StatusCode::BAD_REQUEST);

        let res3 = serve_spa_file_from_root("subdir/../secret.txt", dir.path());
        assert_eq!(res3.status(), StatusCode::BAD_REQUEST);
    }

    #[test]
    fn test_encoded_traversal_rejected() {
        let dir = tempdir().unwrap();
        let res1 = serve_spa_file_from_root("%2e%2e/etc/passwd", dir.path());
        assert_eq!(res1.status(), StatusCode::BAD_REQUEST);

        let res2 = serve_spa_file_from_root("%2e%2e%2fetc%2fpasswd", dir.path());
        assert_eq!(res2.status(), StatusCode::BAD_REQUEST);

        let res3 = serve_spa_file_from_root("..%2f..%2f", dir.path());
        assert_eq!(res3.status(), StatusCode::BAD_REQUEST);

        let res4 = serve_spa_file_from_root("%252e%252e/etc/passwd", dir.path());
        assert_eq!(res4.status(), StatusCode::BAD_REQUEST);
    }

    #[test]
    fn test_double_slash_rejected() {
        let dir = tempdir().unwrap();
        let res1 = serve_spa_file_from_root("//etc/passwd", dir.path());
        assert_eq!(res1.status(), StatusCode::BAD_REQUEST);

        let res2 = serve_spa_file_from_root("assets//app.js", dir.path());
        assert_eq!(res2.status(), StatusCode::BAD_REQUEST);

        let res3 = serve_spa_file_from_root("///", dir.path());
        assert_eq!(res3.status(), StatusCode::BAD_REQUEST);
    }

    #[test]
    fn test_valid_path_served_and_confined() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        // Create index.html and assets/app.js
        fs::write(root.join("index.html"), "<html><body>SPA App</body></html>").unwrap();
        let assets_dir = root.join("assets");
        fs::create_dir(&assets_dir).unwrap();
        fs::write(assets_dir.join("app.js"), "console.log('cms');").unwrap();

        // 1. Valid static file
        let res_js = serve_spa_file_from_root("assets/app.js", root);
        assert_eq!(res_js.status(), StatusCode::OK);
        assert_eq!(
            res_js.headers().get(header::CONTENT_TYPE).unwrap(),
            "application/javascript; charset=utf-8"
        );

        // 2. Valid static file with single leading slash
        let res_js_slash = serve_spa_file_from_root("/assets/app.js", root);
        assert_eq!(res_js_slash.status(), StatusCode::OK);

        // 3. Valid index.html
        let res_index = serve_spa_file_from_root("index.html", root);
        assert_eq!(res_index.status(), StatusCode::OK);
        assert_eq!(
            res_index.headers().get(header::CONTENT_TYPE).unwrap(),
            "text/html; charset=utf-8"
        );

        // 4. SPA route fallback
        let res_spa = serve_spa_file_from_root("dashboard/settings", root);
        assert_eq!(res_spa.status(), StatusCode::OK);
        assert_eq!(
            res_spa.headers().get(header::CONTENT_TYPE).unwrap(),
            "text/html; charset=utf-8"
        );
    }

    #[test]
    fn test_api_route_not_found() {
        let dir = tempdir().unwrap();
        let res = serve_spa_file_from_root("api/v1/unknown", dir.path());
        assert_eq!(res.status(), StatusCode::NOT_FOUND);
    }
}
