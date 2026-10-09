use std::sync::Arc;

use axum::{
    extract::{Path, State},
    Json,
};
use cms_entity::{
    analytics::{
        ProjectAnalyticsResponse, ProjectAnalyticsTimeseriesPoint, ProjectUsageMeter,
        ProjectUsagePeriod, ProjectUsageTelemetryResponse,
    },
    common::ApiResponse,
};
use cms_error::AppError;
use cms_middleware::app_state::AppState;

use crate::auth::AuthExtractor;

/// Project analytics
///
/// Returns a dashboard shape matching the SPA's `ProjectAnalytics` contract,
/// populated from the real analytics store: `totalViews` comes from the event
/// count, `timeseries` from the per-day buckets, and the remaining (richer)
/// fields are populated where the data model supports them.
pub async fn get_project_analytics_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
) -> Result<Json<ApiResponse<ProjectAnalyticsResponse>>, AppError> {
    let dashboard = cms_biz::analytics::AnalyticsService::get_dashboard(
        &state.biz_context,
        &auth.user.id,
        &project_id,
    )
    .await?;

    let timeseries: Vec<ProjectAnalyticsTimeseriesPoint> = dashboard
        .time_series
        .iter()
        .map(|t| ProjectAnalyticsTimeseriesPoint {
            date: t.date.clone(),
            views: t.count,
            visitors: t.count,
        })
        .collect();

    // Only page_view events count as "views" toward the headline metric.
    let total_views = dashboard
        .events_by_type
        .get("page_view")
        .copied()
        .unwrap_or(dashboard.total_events)
        .max(0);

    let res = ProjectAnalyticsResponse {
        availability: "available".to_string(),
        total_views,
        unique_visitors: None,
        views_previous_period: None,
        visitors_previous_period: None,
        views_change_pct: None,
        visitors_change_pct: None,
        avg_duration_seconds: None,
        timeseries,
        top_pages: Vec::new(),
        top_referrers: Vec::new(),
        top_countries: Vec::new(),
        top_searches: Vec::new(),
        referrers: Vec::new(),
        languages: Vec::new(),
        devices: Vec::new(),
        engagement: serde_json::json!({
            "engagedViews": null,
            "averageEngagementMs": null
        }),
        searches: serde_json::json!({
            "total": 0,
            "zeroResults": null,
            "clickedResults": null,
            "averageLatencyMs": null,
            "queryTerms": "legacy",
            "topTerms": []
        }),
        ai: serde_json::json!({
            "answersCompleted": null,
            "answersFailed": null,
            "promptTokens": null,
            "completionTokens": null,
            "costMicros": null,
            "averageLatencyMs": null
        }),
        no_answer_reasons: Vec::new(),
    };

    Ok(Json(ApiResponse::new(res)))
}

/// Project settings usage (internal operational telemetry, ADR 001 compliant)
pub async fn get_project_settings_usage_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
) -> Result<Json<ApiResponse<ProjectUsageTelemetryResponse>>, AppError> {
    use cms_biz::project::ProjectService;

    let _project =
        ProjectService::get_project(&state.biz_context, &auth.user.id, &project_id).await?;

    let pages = cms_db::page::PageQueries::get_by_project(&state.biz_context.pool, &project_id)
        .await
        .map(|p| p.len() as i64)
        .unwrap_or(0);
    let assets = cms_db::asset::AssetQueries::get_by_project(
        &state.biz_context.pool,
        &project_id,
        Some(1000),
        None,
    )
    .await
    .unwrap_or_default();
    let asset_bytes: i64 = assets.iter().map(|a| a.file_size).sum();
    let deminr_of_assets = assets.len() as i64;
    let builds = cms_db::deployment::DeploymentQueries::count_by_project(
        &state.biz_context.pool,
        &project_id,
    )
    .await
    .unwrap_or(0);
    let members = cms_db::authz::ProjectMemberQueries::list_by_project(
        &state.biz_context.pool,
        &project_id,
    )
    .await
    .map(|m| m.len() as i64)
    .unwrap_or(0);
    let domains =
        cms_db::domain::DomainQueries::get_by_deployment(&state.biz_context.pool, &project_id)
            .await
            .map(|d| d.len() as i64)
            .unwrap_or(0);

    let meter = |key: &str, quantity: i64, unit: &str| ProjectUsageMeter {
        key: key.to_string(),
        quantity: quantity.to_string(),
        limit: None,
        ratio: None,
        unit: unit.to_string(),
        state: "available".to_string(),
        availability: "complete".to_string(),
        capability: key.to_string(),
        enforcement: "advisory".to_string(),
        behavior: "observe".to_string(),
    };

    let now = chrono::Utc::now();
    let period_start = now - chrono::Duration::days(30);

    let res = ProjectUsageTelemetryResponse {
        availability: "complete".to_string(),
        period: ProjectUsagePeriod {
            start: period_start.to_rfc3339(),
            end_exclusive: now.to_rfc3339(),
        },
        meters: vec![
            meter("published_page", pages, "count"),
            meter("editor_seat", members, "count"),
            meter("asset_storage_byte", asset_bytes, "byte"),
            meter("custom_domain", domains, "count"),
            meter("build", builds, "count"),
            meter("public_page_view", 0, "count"),
            meter("search_query", 0, "count"),
            meter("ai_answer", 0, "count"),
            meter("ai_input_token", 0, "count"),
            meter("ai_output_token", 0, "count"),
            meter("embedded_chunk", 0, "count"),
            meter("indexed_content_byte", 0, "byte"),
        ],
        asset_count: deminr_of_assets,
    };

    Ok(Json(ApiResponse::new(res)))
}
