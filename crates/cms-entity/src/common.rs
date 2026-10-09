//! Common types used across the application

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Base identifier type for most entities
pub type Id = String;

/// Timestamp type
pub type Timestamp = DateTime<Utc>;

/// UUID type alias
pub type UuidString = String;

/// Pagination request
#[derive(Debug, Clone, Deserialize, Serialize, utoipa::ToSchema, ts_rs::TS)]
pub struct PaginationRequest {
    #[serde(default = "default_page")]
    pub page: u64,
    #[serde(default = "default_page_size")]
    pub page_size: u64,
}

fn default_page() -> u64 {
    1
}
fn default_page_size() -> u64 {
    20
}

/// Unified bounded pagination query for offset-based endpoints
#[derive(Debug, Clone, Deserialize, Serialize, utoipa::ToSchema, ts_rs::TS)]
pub struct PaginationQuery {
    #[serde(default = "default_page")]
    pub page: u64,
    #[serde(default = "default_page_size")]
    pub limit: u64,
}

impl Default for PaginationQuery {
    fn default() -> Self {
        Self {
            page: default_page(),
            limit: default_page_size(),
        }
    }
}

impl PaginationQuery {
    pub const MAX_LIMIT: u64 = 100;
    pub const DEFAULT_LIMIT: u64 = 20;

    pub fn safe_limit(&self) -> u64 {
        if self.limit == 0 {
            Self::DEFAULT_LIMIT
        } else {
            self.limit.min(Self::MAX_LIMIT)
        }
    }

    pub fn safe_page(&self) -> u64 {
        self.page.max(1)
    }

    pub fn offset(&self) -> u64 {
        (self.safe_page() - 1) * self.safe_limit()
    }
}

/// Unified cursor-based pagination query
#[derive(Debug, Clone, Default, Deserialize, Serialize, utoipa::ToSchema, ts_rs::TS)]
pub struct CursorQuery {
    pub after: Option<String>,
    pub before: Option<String>,
    #[serde(default = "default_page_size")]
    pub limit: u64,
}

impl CursorQuery {
    pub const MAX_LIMIT: u64 = 100;
    pub const DEFAULT_LIMIT: u64 = 20;

    pub fn safe_limit(&self) -> u64 {
        if self.limit == 0 {
            Self::DEFAULT_LIMIT
        } else {
            self.limit.min(Self::MAX_LIMIT)
        }
    }

    /// Encode a cursor from timestamp and unique ID
    pub fn encode_cursor(timestamp: &DateTime<Utc>, id: &str) -> String {
        format!("{}_{}", timestamp.timestamp_millis(), id)
    }

    /// Decode a cursor into (timestamp_millis, id)
    pub fn decode_cursor(cursor: &str) -> Option<(i64, &str)> {
        let (ts_str, id) = cursor.split_once('_')?;
        let ts_millis = ts_str.parse::<i64>().ok()?;
        Some((ts_millis, id))
    }
}

/// Cursor-based pagination metadata
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct CursorMeta {
    pub next_cursor: Option<String>,
    pub prev_cursor: Option<String>,
    pub has_more: bool,
}

impl CursorMeta {
    pub fn new(next_cursor: Option<String>, has_more: bool) -> Self {
        Self {
            next_cursor,
            prev_cursor: None,
            has_more,
        }
    }
}

/// Paginated response wrapper
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct PaginatedResponse<T> {
    pub data: Vec<T>,
    pub total: u64,
    pub page: u64,
    pub page_size: u64,
    pub total_pages: u64,
}

impl<T> PaginatedResponse<T> {
    pub fn new(data: Vec<T>, total: u64, page: u64, page_size: u64) -> Self {
        let total_pages = if page_size > 0 {
            total.div_ceil(page_size)
        } else {
            0
        };

        Self {
            data,
            total,
            page,
            page_size,
            total_pages,
        }
    }
}

/// Sort order
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default, utoipa::ToSchema, ts_rs::TS)]
#[serde(rename_all = "lowercase")]
pub enum SortOrder {
    #[default]
    Asc,
    Desc,
}

/// Sort direction for queries
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct SortRequest {
    pub field: String,
    #[serde(default)]
    pub order: SortOrder,
}

/// Health check response
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct HealthResponse {
    pub status: String,
    pub timestamp: DateTime<Utc>,
    pub version: String,
}

impl HealthResponse {
    pub fn ok(version: &str) -> Self {
        Self {
            status: "ok".to_string(),
            timestamp: Utc::now(),
            version: version.to_string(),
        }
    }
}

/// Detailed system health response for GET /health
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct SystemHealthResponse {
    pub status: String,
    pub database: String,
    pub database_latency_ms: u128,
    pub timestamp: String,
}

/// Standard API response envelope.
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct ApiResponse<T> {
    /// Domain payload.
    pub data: T,
    /// Optional metadata (pagination, tracing, etc.).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta: Option<ResponseMeta>,
}

/// Standardized pagination metadata.
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct PaginationMeta {
    pub page: u64,
    pub page_size: u64,
    pub total: u64,
    pub total_pages: u64,
    pub has_next: bool,
    pub has_prev: bool,
}

impl PaginationMeta {
    pub fn new(page: u64, page_size: u64, total: u64) -> Self {
        let total_pages = if page_size > 0 {
            total.div_ceil(page_size)
        } else {
            0
        };
        Self {
            page,
            page_size,
            total,
            total_pages,
            has_next: page < total_pages,
            has_prev: page > 1,
        }
    }
}

/// Production response metadata container.
#[derive(Debug, Clone, Serialize, Deserialize, Default, utoipa::ToSchema, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct ResponseMeta {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pagination: Option<PaginationMeta>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<CursorMeta>,
}

impl ResponseMeta {
    pub fn with_pagination(pagination: PaginationMeta) -> Self {
        Self {
            pagination: Some(pagination),
            ..Default::default()
        }
    }

    pub fn with_cursor(cursor: CursorMeta) -> Self {
        Self {
            cursor: Some(cursor),
            ..Default::default()
        }
    }

    pub fn with_request_id(request_id: impl Into<String>) -> Self {
        Self {
            request_id: Some(request_id.into()),
            ..Default::default()
        }
    }
}

impl<T> ApiResponse<T> {
    /// Create a standard data response without metadata (`{"data": ...}`).
    pub fn new(data: T) -> Self {
        Self { data, meta: None }
    }

    /// Create a response with custom metadata.
    pub fn with_meta(data: T, meta: ResponseMeta) -> Self {
        Self {
            data,
            meta: Some(meta),
        }
    }

    /// Create a paginated response with standardized pagination metadata.
    pub fn paginated(data: T, page: u64, page_size: u64, total: u64) -> Self {
        Self {
            data,
            meta: Some(ResponseMeta::with_pagination(PaginationMeta::new(
                page, page_size, total,
            ))),
        }
    }

    /// Create a cursor-paginated response with standardized cursor metadata.
    pub fn cursor(data: T, cursor: CursorMeta) -> Self {
        Self {
            data,
            meta: Some(ResponseMeta::with_cursor(cursor)),
        }
    }
}

impl<T> From<PaginatedResponse<T>> for ApiResponse<Vec<T>> {
    fn from(p: PaginatedResponse<T>) -> Self {
        ApiResponse::paginated(p.data, p.page, p.page_size, p.total)
    }
}

/// Empty response for DELETE and other operations that don't return data
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct EmptyResponse;

/// Success message response
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct SuccessResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl SuccessResponse {
    pub fn ok() -> Self {
        Self {
            success: true,
            message: None,
        }
    }

    pub fn with_message(message: impl Into<String>) -> Self {
        Self {
            success: true,
            message: Some(message.into()),
        }
    }
}

/// Member role in a project or workspace
#[derive(
    Debug,
    Clone,
    Copy,
    Serialize,
    Deserialize,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Default,
    utoipa::ToSchema,
    ts_rs::TS,
)]
#[serde(rename_all = "lowercase")]
pub enum MemberRole {
    #[default]
    Viewer,
    Editor,
    Member,
    Admin,
    Owner,
}

impl sqlx::Type<sqlx::Postgres> for MemberRole {
    fn type_info() -> sqlx::postgres::PgTypeInfo {
        sqlx::postgres::PgTypeInfo::with_name("text")
    }
    fn compatible(ty: &sqlx::postgres::PgTypeInfo) -> bool {
        *ty == sqlx::postgres::PgTypeInfo::with_name("text")
            || *ty == sqlx::postgres::PgTypeInfo::with_name("varchar")
            || *ty == sqlx::postgres::PgTypeInfo::with_name("\"MemberRole\"")
    }
}

impl<'r> sqlx::Decode<'r, sqlx::Postgres> for MemberRole {
    fn decode(
        value: sqlx::postgres::PgValueRef<'r>,
    ) -> Result<Self, Box<dyn std::error::Error + 'static + Send + Sync>> {
        let s = <&str as sqlx::Decode<sqlx::Postgres>>::decode(value)?;
        match s {
            "OWNER" | "owner" => Ok(MemberRole::Owner),
            "ADMIN" | "admin" => Ok(MemberRole::Admin),
            "MEMBER" | "member" => Ok(MemberRole::Member),
            "VIEWER" | "viewer" => Ok(MemberRole::Viewer),
            "EDITOR" | "editor" => Ok(MemberRole::Editor),
            other => Err(format!("unknown MemberRole: {}", other).into()),
        }
    }
}

impl<'q> sqlx::Encode<'q, sqlx::Postgres> for MemberRole {
    fn encode_by_ref(
        &self,
        buf: &mut sqlx::postgres::PgArgumentBuffer,
    ) -> Result<sqlx::encode::IsNull, Box<dyn std::error::Error + 'static + Send + Sync>> {
        let s = match self {
            MemberRole::Owner => "OWNER",
            MemberRole::Admin => "ADMIN",
            MemberRole::Member | MemberRole::Editor => "MEMBER",
            MemberRole::Viewer => "VIEWER",
        };
        <&str as sqlx::Encode<sqlx::Postgres>>::encode_by_ref(&s, buf)
    }
}

/// Project role
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default, utoipa::ToSchema, ts_rs::TS)]
#[serde(rename_all = "lowercase")]
pub enum ProjectRole {
    Admin,
    Editor,
    #[default]
    Viewer,
}

/// Entity audit information
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct AuditInfo {
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_by: Option<Id>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_by: Option<Id>,
}

impl AuditInfo {
    pub fn new(created_by: Option<Id>, updated_by: Option<Id>) -> Self {
        let now = Utc::now();
        Self {
            created_at: now,
            updated_at: now,
            created_by,
            updated_by,
        }
    }
}

/// Filter operators for query parameters
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, utoipa::ToSchema, ts_rs::TS)]
#[serde(rename_all = "lowercase")]
pub enum FilterOperator {
    Eq,
    Ne,
    Gt,
    Gte,
    Lt,
    Lte,
    Contains,
    StartsWith,
    EndsWith,
    In,
    NotIn,
    IsNull,
    IsNotNull,
}

/// Filter condition for queries
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct FilterCondition {
    pub field: String,
    pub operator: FilterOperator,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<serde_json::Value>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pagination() {
        let items: Vec<i32> = (0..100).collect();
        let response = PaginatedResponse::new(items, 100, 1, 10);

        assert_eq!(response.total, 100);
        assert_eq!(response.page, 1);
        assert_eq!(response.page_size, 10);
        assert_eq!(response.total_pages, 10);
    }

    #[test]
    fn test_member_role_serialization() {
        let role = MemberRole::Owner;
        let json = serde_json::to_string(&role).unwrap();
        assert_eq!(json, "\"owner\"");

        let deserialized: MemberRole = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, MemberRole::Owner);
    }

    #[test]
    fn test_api_response_serialization_without_meta() {
        let resp = ApiResponse::new("payload");
        let json = serde_json::to_string(&resp).unwrap();
        assert_eq!(json, r#"{"data":"payload"}"#);

        let parsed: ApiResponse<String> = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.data, "payload");
        assert!(parsed.meta.is_none());
    }

    #[test]
    fn test_api_response_serialization_with_pagination() {
        let resp = ApiResponse::paginated(vec![1, 2, 3], 1, 10, 25);
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains(r#""data":[1,2,3]"#));
        assert!(json.contains(r#""page":1"#));
        assert!(json.contains(r#""pageSize":10"#));
        assert!(json.contains(r#""total":25"#));
        assert!(json.contains(r#""totalPages":3"#));
        assert!(json.contains(r#""hasNext":true"#));
        assert!(json.contains(r#""hasPrev":false"#));
    }

    #[test]
    fn test_api_response_from_paginated_response() {
        let p = PaginatedResponse::new(vec!["item1".to_string()], 50, 2, 10);
        let resp: ApiResponse<Vec<String>> = p.into();
        assert_eq!(resp.data, vec!["item1"]);
        let meta = resp.meta.unwrap().pagination.unwrap();
        assert_eq!(meta.page, 2);
        assert_eq!(meta.page_size, 10);
        assert_eq!(meta.total, 50);
        assert_eq!(meta.total_pages, 5);
        assert!(meta.has_next);
        assert!(meta.has_prev);
    }

    #[test]
    fn test_pagination_query_bounds() {
        let q = PaginationQuery {
            page: 0,
            limit: 500,
        };
        assert_eq!(q.safe_page(), 1);
        assert_eq!(q.safe_limit(), PaginationQuery::MAX_LIMIT);
        assert_eq!(q.offset(), 0);

        let q2 = PaginationQuery { page: 3, limit: 15 };
        assert_eq!(q2.safe_page(), 3);
        assert_eq!(q2.safe_limit(), 15);
        assert_eq!(q2.offset(), 30);
    }

    #[test]
    fn test_cursor_query_and_meta() {
        let now = Utc::now();
        let cursor = CursorQuery::encode_cursor(&now, "item_123");
        let decoded = CursorQuery::decode_cursor(&cursor).unwrap();
        assert_eq!(decoded.0, now.timestamp_millis());
        assert_eq!(decoded.1, "item_123");

        let meta = CursorMeta::new(Some(cursor.clone()), true);
        let resp = ApiResponse::cursor(vec!["hello"], meta);
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains(&cursor));
        assert!(json.contains(r#""hasMore":true"#));
    }
}
