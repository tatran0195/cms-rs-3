use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
    routing::get,
    Router,
};
use cms_error::AppError;
use tower::ServiceExt;

#[tokio::test]
async fn test_api_error_localization_with_headers() {
    async fn failing_handler() -> Result<&'static str, AppError> {
        Err(AppError::InvalidCredentials)
    }

    async fn not_found_handler() -> Result<&'static str, AppError> {
        Err(AppError::NotFound("/api/v1/projects/missing".to_string()))
    }

    let app = Router::new()
        .route("/test-fail", get(failing_handler))
        .route("/test-not-found", get(not_found_handler))
        .layer(axum::middleware::from_fn(
            cms_middleware::locale_scoping_middleware,
        ));

    // 1. Request with x-cms-locale: ja
    let req = Request::builder()
        .uri("/test-fail")
        .header("x-cms-locale", "ja")
        .body(Body::empty())
        .unwrap();

    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(resp.headers().get("content-language").unwrap(), "ja");

    let bytes = to_bytes(resp.into_body(), 1024 * 1024).await.unwrap();
    let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(body["error"]["code"], "auth:invalid_credentials");
    assert_eq!(
        body["error"]["message"],
        "メールアドレスまたはパスワードが無効です"
    );
    assert_eq!(
        body["error"]["i18n"]["key"],
        "api_error_auth_invalid_credentials"
    );

    // 2. Request with Accept-Language: zh-CN
    let req = Request::builder()
        .uri("/test-fail")
        .header("accept-language", "zh-CN,zh;q=0.9,en;q=0.8")
        .body(Body::empty())
        .unwrap();

    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(resp.headers().get("content-language").unwrap(), "zh-CN");

    let bytes = to_bytes(resp.into_body(), 1024 * 1024).await.unwrap();
    let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(body["error"]["message"], "邮箱或密码无效");

    // 3. Request with parameters interpolation in Japanese
    let req = Request::builder()
        .uri("/test-not-found")
        .header("x-cms-locale", "ja")
        .body(Body::empty())
        .unwrap();

    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    let bytes = to_bytes(resp.into_body(), 1024 * 1024).await.unwrap();
    let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(
        body["error"]["message"],
        "リソースが見つかりません: /api/v1/projects/missing"
    );
    assert_eq!(body["error"]["i18n"]["key"], "api_error_http_not_found");

    // 4. Request with no locale header -> falls back to English
    let req = Request::builder()
        .uri("/test-fail")
        .body(Body::empty())
        .unwrap();

    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(resp.headers().get("content-language").unwrap(), "en");

    let bytes = to_bytes(resp.into_body(), 1024 * 1024).await.unwrap();
    let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(body["error"]["message"], "Invalid email or password");
}
