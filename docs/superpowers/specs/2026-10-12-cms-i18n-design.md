# Design Specification: Unified `cms-i18n` Crate for API Errors and Email Localization

## 1. Overview & Objective

Currently, transactional email localization logic resides directly inside `crates/cms-mailer/src/i18n`. Meanwhile, backend API errors (`cms-error`) return hardcoded English strings in their JSON responses (`ApiErrorResponse`), requiring frontend UI components to either display English or maintain manual translation maps.

This feature extracts the generic i18n logic from `cms-mailer` into a shared, production-ready workspace crate: **`cms-i18n`**.

`cms-i18n` becomes the single source of truth for:
1. **Language Resolution**: Extracting and negotiating BCP-47 tags (`x-cms-locale`, `Accept-Language`, user preferences) with hierarchical fallbacks (`zh-Hant-TW` → `zh-Hant` → `zh` → `en`).
2. **API Error Localization**: Formatting localized error messages for UI rendering based on the caller's language.
3. **Transactional Email Localization**: Serving email subject/body templates across supported locales without duplicating i18n code in `cms-mailer`.

---

## 2. Goals & Non-Goals

### Goals
- **Single Crate Core (`cms-i18n`)**: Lift generic `Locale`, `Message`, `Catalog`, `negotiate`, and `accept_language_tags` from `cms-mailer/src/i18n` into `crates/cms-i18n`.
- **Email Compatibility**: Ensure `cms-mailer` consumes `cms-i18n` seamlessly with zero regressions in email templating or tests.
- **Localized API Errors**: Resolve user-facing error messages in the requested language (via `x-cms-locale` or `Accept-Language`) so Studio UI (`toast.error`, modal alerts, etc.) receives already-translated messages directly in `error.message`.
- **Hybrid Error Envelope**: Provide both the localized human-readable `error.message` and structured `i18n: { key, args }` metadata in `ApiErrorResponse` so clients can optionally inspect or override keys if desired.
- **Compile-Time Safety**: Embed server strings from `packages/i18n/messages/{locale}.json` at build time so the binary has zero runtime disk I/O dependency and boots with strict validation.

### Non-Goals
- No runtime hot-reloading file watchers in production (keeps binary robust and self-contained).
- No SaaS billing, pricing, or subscription features (strictly following platform rules).

---

## 3. Architecture & Layering

```
                 packages/i18n/messages/{locale}.json
                   (Single source of truth in monorepo)
                                │
                        build.rs embeds keys
                                ▼
                       crates/cms-i18n
             ┌──────────────────┴──────────────────┐
             ▼                                     ▼
     crates/cms-mailer                      crates/cms-error
  (Email language resolution)            (API error localization)
             │                                     │
             ▼                                     ▼
     Transactional Emails                 HTTP API / Axum Responses
   (Rendered in user's lang)             (error.message in user's lang)
                                                   │
                                                   ▼
                                           packages/sdk & Studio UI
                                          (Rendered in toast / dialog)
```

### Dependency Hierarchy
- `crates/cms-i18n`: Leaf library crate. Depends only on `serde`, `serde_json`, `thiserror`, `tokio` (for task-local request scoping), and `tracing`.
- `crates/cms-mailer`: Depends on `cms-i18n` instead of maintaining its own internal `src/i18n`.
- `crates/cms-error`: Depends on `cms-i18n` to resolve localized error messages in `into_response`.
- `crates/cms-middleware`: Depends on `cms-i18n` for request locale extraction (`LocaleExtractor`) and task-local scope binding.

---

## 4. Detailed Component Design

### 4.1. `crates/cms-i18n` Crate Structure

```
crates/cms-i18n/
├── Cargo.toml
├── build.rs                  # Embeds email_* and api_error_* from packages/i18n/messages/
└── src/
    ├── lib.rs                # Crate exports and entry points
    ├── locale.rs             # Canonical BCP-47 tag parsing, RTL check, accept_language_tags
    ├── message.rs            # Tokenizer and parameter substitution ({var})
    ├── catalog.rs            # Catalog, CatalogBuilder, fallback chain, audit
    ├── context.rs            # Tokio task-local CURRENT_LOCALE & scope guard
    └── errors.rs             # Error code -> key mapping and error formatting helper
```

#### Key Types & APIs
```rust
// Locale & Negotiation
pub use locale::{accept_language_tags, Direction, Locale, LocaleError};
pub use message::{Args, Message, ParseError};
pub use catalog::{Audit, Catalog, CatalogBuilder, CatalogError, I18nError};

// Context (Task-Local for Request Pipeline)
pub fn current_locale() -> Locale;
pub async fn with_locale<F, R>(locale: Locale, future: F) -> R;

// Preloaded Embedded Catalogs
pub fn embedded_catalog() -> &'static Catalog;
pub fn localize_error(code: &str, locale: &Locale, args: &Args) -> Option<String>;
```

### 4.2. API Error Response & Envelope (`cms-error`)

Update `ApiErrorResponse` and `ApiError`:
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiErrorResponse {
    pub error: ApiError,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "requestId")]
    pub request_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub i18n: Option<ApiErrorI18n>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiErrorI18n {
    pub key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub args: Option<std::collections::HashMap<String, String>>,
}
```

#### Resolution in `AppError::into_response(self)`
1. Retrieve active request locale via `cms_i18n::current_locale()`.
2. Map `AppError` code (`auth:invalid_credentials`, `http:not_found`, etc.) to its corresponding `api_error_*` translation key.
3. If translated text is available for the active locale, format it with any parameters (`path`, `field`, etc.) and set `error.message`. If missing, fall back cleanly to English default.
4. Populate `error.i18n` with the `{ key, args }`.
5. For 500 internal server errors, preserve existing security sanitization: emit an opaque, localized safe message ("An internal server error occurred") with the unique correlation `errorId`.
6. Attach `Content-Language` header to the response.

### 4.3. Request Scoping in Middleware (`cms-middleware`)

In `cms_middleware::locale::LocaleLayer` / Axum middleware:
1. Resolves requested locale in priority order:
   - Header `x-cms-locale` (sent by Studio SPA)
   - Header `Accept-Language` (standard browser header)
   - Cookie `locale` / `language`
   - Default: `en`
2. Wraps the request handler execution inside `cms_i18n::with_locale(resolved_locale, async { ... })`.
3. Ensures zero handler signature changes across all routes.

### 4.4. Email Localization in `cms-mailer`

`cms-mailer` removes its internal `src/i18n/` directory and instead:
- Declares `cms-i18n = { path = "../cms-i18n" }` in `Cargo.toml`.
- Re-exports `pub use cms_i18n::{accept_language_tags, Catalog, Locale};` for existing callers.
- Uses `cms_i18n::Catalog` and `cms_i18n::Locale` in `EmailRenderer::render(&self, email: &Email, requested: &Locale)`.

---

## 5. Translation Keys Catalog

Add canonical error keys under `api_error_` in `packages/i18n/messages/{en,ja,zh-CN}.json`:
- `api_error_http_bad_request`: "Bad request: {details}" / "不正なリクエストです: {details}" / "无效请求: {details}"
- `api_error_http_unauthorized`: "Authentication required" / "認証が必要です" / "需要身份验证"
- `api_error_http_forbidden`: "Access forbidden" / "アクセスが拒否されました" / "访问被拒绝"
- `api_error_http_not_found`: "Resource not found: {path}" / "リソースが見つかりません: {path}" / "未找到资源: {path}"
- `api_error_http_conflict`: "Resource conflict: {details}" / "リソースの競合が発生しました: {details}" / "资源冲突: {details}"
- `api_error_auth_invalid_credentials`: "Invalid email or password" / "メールアドレスまたはパスワードが無効です" / "邮箱或密码无效"
- `api_error_auth_invalid_session`: "Session is invalid or expired" / "セッションが無効または期限切れです" / "会话无效或已过期"
- `api_error_auth_token_expired`: "Authentication token expired" / "認証トークンの有効期限が切れています" / "认证令牌已过期"
- `api_error_validation_failed`: "Validation failed: {details}" / "入力の検証に失敗しました: {details}" / "验证失败: {details}"
- `api_error_database_error`: "An internal database error occurred" / "データベースエラーが発生しました" / "发生数据库错误"
- `api_error_internal_error`: "An unexpected server error occurred" / "予期しないサーバーエラーが発生しました" / "发生意外服务器错误"

---

## 6. Verification & Quality Gates

1. **Unit Tests in `cms-i18n`**:
   - Tag parsing, RTL detection, language negotiation fallback chains.
   - Interpolation of variables (`{var}`).
   - Error code translation resolution across `en`, `ja`, and `zh-CN`.
2. **Integration Tests in `cms-mailer`**:
   - Run existing `tests/i18n_contract.rs` against `cms-i18n` to guarantee 100% email translation compatibility and clean catalog audit.
3. **API Response Tests in `cms-api` / `cms-error`**:
   - Send requests with `x-cms-locale: ja` and verify 401/400 errors return Japanese messages and `Content-Language: ja`.
   - Send requests without headers and verify clean fallback to English.
   - Verify server errors redact raw internal errors and output localized safe messages.
