use axum::response::IntoResponse;
use cms_error::AppError;
use cms_i18n::{with_locale, Locale};

#[tokio::test]
async fn test_error_localization_in_japanese() {
    let ja = Locale::parse("ja").unwrap();
    let resp = with_locale(ja, async {
        AppError::InvalidCredentials.into_response()
    })
    .await;

    assert_eq!(resp.status(), axum::http::StatusCode::UNAUTHORIZED);
    assert_eq!(resp.headers().get("Content-Language").unwrap(), "ja");

    let bytes = axum::body::to_bytes(resp.into_body(), 1024 * 1024).await.unwrap();
    let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(body["error"]["code"], "auth:invalid_credentials");
    assert_eq!(body["error"]["message"], "メールアドレスまたはパスワードが無効です");
    assert_eq!(body["error"]["i18n"]["key"], "api_error_auth_invalid_credentials");
}

#[tokio::test]
async fn test_error_localization_fallback_english() {
    let resp = AppError::InvalidCredentials.into_response();

    assert_eq!(resp.status(), axum::http::StatusCode::UNAUTHORIZED);
    assert_eq!(resp.headers().get("Content-Language").unwrap(), "en");

    let bytes = axum::body::to_bytes(resp.into_body(), 1024 * 1024).await.unwrap();
    let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(body["error"]["code"], "auth:invalid_credentials");
    assert_eq!(body["error"]["message"], "Invalid email or password");
    assert_eq!(body["error"]["i18n"]["key"], "api_error_auth_invalid_credentials");
}
