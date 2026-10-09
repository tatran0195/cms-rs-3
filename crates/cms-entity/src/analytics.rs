//! Analytics entity types

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::common::Id;

/// Track analytics event request
#[derive(Debug, Clone, Deserialize, Serialize, utoipa::ToSchema, ts_rs::TS)]
pub struct TrackAnalyticsEventRequest {
    pub project_id: Option<Id>,
    pub user_id: Option<Id>,
    pub event_type: String,
    #[serde(default)]
    pub metadata: serde_json::Value,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
}

/// List analytics events query
pub type ListAnalyticsEventsQuery = AnalyticsQueryRequest;

/// Analytics event entity (duplicated from usage.rs for clarity, but we'll keep it here)
/// Note: This is a simplified version for the analytics crate
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct AnalyticsEvent {
    pub id: Id,
    pub project_id: Option<Id>,
    pub user_id: Option<Id>,
    pub event_type: String,
    pub metadata: serde_json::Value,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// Analytics event response
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct AnalyticsEventResponse {
    pub id: Id,
    pub project_id: Option<Id>,
    pub user_id: Option<Id>,
    pub event_type: String,
    pub metadata: serde_json::Value,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub created_at: DateTime<Utc>,
}

impl From<AnalyticsEvent> for AnalyticsEventResponse {
    fn from(event: AnalyticsEvent) -> Self {
        Self {
            id: event.id,
            project_id: event.project_id,
            user_id: event.user_id,
            event_type: event.event_type,
            metadata: event.metadata,
            ip_address: event.ip_address,
            user_agent: event.user_agent,
            created_at: event.created_at,
        }
    }
}

/// Analytics query request
#[derive(Debug, Clone, Deserialize, Serialize, utoipa::ToSchema, ts_rs::TS)]
pub struct AnalyticsQueryRequest {
    #[serde(default)]
    pub project_id: Option<Id>,
    #[serde(default)]
    pub user_id: Option<Id>,
    #[serde(default)]
    pub event_type: Option<String>,
    #[serde(default)]
    pub start_date: Option<DateTime<Utc>>,
    #[serde(default)]
    pub end_date: Option<DateTime<Utc>>,
    #[serde(default)]
    pub group_by: Option<String>,
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub page: Option<i64>,
    #[serde(default)]
    pub page_size: Option<i64>,
}

/// Analytics result item
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct AnalyticsResultItem {
    pub date: Option<String>,
    pub group_value: Option<String>,
    pub count: i64,
    pub event_type: String,
}

/// Analytics query response
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct AnalyticsQueryResponse {
    pub query: AnalyticsQueryRequest,
    pub results: Vec<AnalyticsResultItem>,
    pub total: i64,
    /// Events list (for paginated results)
    #[serde(default)]
    pub events: Vec<AnalyticsEventResponse>,
    /// Current page (1-based)
    #[serde(default)]
    pub page: i64,
    /// Items per page
    #[serde(default)]
    pub page_size: i64,
}

/// Page view analytics
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct PageViewAnalytics {
    pub page_id: Id,
    pub project_id: Id,
    pub view_count: i64,
    pub unique_visitors: i64,
    pub last_viewed_at: Option<DateTime<Utc>>,
}

/// Project analytics summary
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct ProjectAnalyticsSummary {
    pub project_id: Id,
    pub total_views: i64,
    pub unique_visitors: i64,
    pub total_pages: i64,
    pub most_viewed_pages: Vec<PageViewAnalytics>,
    pub recent_activity: Vec<AnalyticsEventResponse>,
}

/// Track page view request
#[derive(Debug, Clone, Deserialize, Serialize, utoipa::ToSchema, ts_rs::TS)]
pub struct TrackPageViewRequest {
    pub page_id: Id,
    pub project_id: Id,
    #[serde(default)]
    pub referrer: Option<String>,
    #[serde(default)]
    pub user_agent: Option<String>,
    #[serde(default)]
    pub ip_address: Option<String>,
}

/// Time series analytics
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct TimeSeriesAnalytics {
    pub date: String,
    pub count: i64,
}

/// Analytics dashboard response
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct AnalyticsDashboardResponse {
    pub total_events: i64,
    pub events_by_type: std::collections::HashMap<String, i64>,
    pub time_series: Vec<TimeSeriesAnalytics>,
}

/// Point in timeseries for ProjectAnalytics
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectAnalyticsTimeseriesPoint {
    pub date: String,
    pub views: i64,
    pub visitors: i64,
}

/// Project analytics matching SPA contract
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectAnalyticsResponse {
    pub availability: String,
    pub total_views: i64,
    pub unique_visitors: Option<i64>,
    pub views_previous_period: Option<i64>,
    pub visitors_previous_period: Option<i64>,
    pub views_change_pct: Option<f64>,
    pub visitors_change_pct: Option<f64>,
    pub avg_duration_seconds: Option<i64>,
    pub timeseries: Vec<ProjectAnalyticsTimeseriesPoint>,
    pub top_pages: Vec<serde_json::Value>,
    pub top_referrers: Vec<serde_json::Value>,
    pub top_countries: Vec<serde_json::Value>,
    pub top_searches: Vec<serde_json::Value>,
    pub referrers: Vec<serde_json::Value>,
    pub languages: Vec<serde_json::Value>,
    pub devices: Vec<serde_json::Value>,
    pub engagement: serde_json::Value,
    pub searches: serde_json::Value,
    pub ai: serde_json::Value,
    pub no_answer_reasons: Vec<serde_json::Value>,
}

/// Project operational telemetry response (ADR 001 compliant, zero billing/plan concepts)
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectUsageTelemetryResponse {
    pub availability: String,
    pub period: ProjectUsagePeriod,
    pub meters: Vec<ProjectUsageMeter>,
    #[serde(rename = "_assetCount")]
    pub asset_count: i64,
}

/// Period window for project operational usage
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectUsagePeriod {
    pub start: String,
    pub end_exclusive: String,
}

/// Meter item for internal resource usage tracking
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectUsageMeter {
    pub key: String,
    pub quantity: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ratio: Option<f64>,
    pub unit: String,
    pub state: String,
    pub availability: String,
    pub capability: String,
    pub enforcement: String,
    pub behavior: String,
}
