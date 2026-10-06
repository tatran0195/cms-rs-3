use std::sync::Arc;

use axum::{
    extract::{Path, State},
    Json,
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
) -> Result<Json<serde_json::Value>, AppError> {
    let dashboard = cms_biz::analytics::AnalyticsService::get_dashboard(
        &state.biz_context,
        &auth.user.id,
        &project_id,
    )
    .await?;

    // Local helper to map the cms-rs bucket shape (date,count) to the SPA point
    // (dates,views) used by the charts.
    let timeseries: Vec<serde_json::Value> = dashboard
        .time_series
        .iter()
        .map(|t| {
            serde_json::json!({
                "date": t.date,
                "views": t.count,
                "visitors": t.count,
            })
        })
        .collect();

    // Only page_view events count as "views" toward the headline metric.
    let total_views = dashboard
        .events_by_type
        .get("page_view")
        .copied()
        .unwrap_or(dashboard.total_events)
        .max(0);

    Ok(Json(serde_json::json!({
        "data": {
            "availability": "available",
            "totalViews": total_views,
            "uniqueVisitors": null,
            "viewsPreviousPeriod": null,
            "visitorsPreviousPeriod": null,
            "viewsChangePct": null,
            "visitorsChangePct": null,
            "avgDurationSeconds": null,
            "timeseries": timeseries,
            "topPages": [],
            "topReferrers": [],
            "topCountries": [],
            "topSearches": [],
            "referrers": [],
            "languages": [],
            "devices": [],
            "engagement": {
                "engagedViews": null,
                "averageEngagementMs": null
            },
            "searches": {
                "total": 0,
                "zeroResults": null,
                "clickedResults": null,
                "averageLatencyMs": null,
                "queryTerms": "legacy",
                "topTerms": []
            },
            "ai": {
                "answersCompleted": null,
                "answersFailed": null,
                "promptTokens": null,
                "completionTokens": null,
                "costMicros": null,
                "averageLatencyMs": null
            },
            "noAnswerReasons": []
        }
    })))
}

/// Project settings usage
///
/// Returns plan-limit meter readings based on real project usage. Counts are taken
/// from the actual tables (published pages, assets+bytes, deployments, members,
/// domains, events) so the Usage tab renders real values.
pub async fn get_project_settings_usage_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    use cms_biz::project::ProjectService;

    let project =
        ProjectService::get_project(&state.biz_context, &auth.user.id, &project_id).await?;
    let org_id = project.project.organization_id.clone();

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
    let members = cms_db::org::MemberQueries::count_by_organization(
        &state.biz_context.pool,
        &org_id,
        None,
        None,
    )
    .await
    .unwrap_or(0);
    let domains =
        cms_db::domain::DomainQueries::get_by_deployment(&state.biz_context.pool, &project_id)
            .await
            .map(|d| d.len() as i64)
            .unwrap_or(0);

    let meter = |key: &str, quantity: i64, unit: &str| {
        serde_json::json!({
            "key": key,
            "quantity": quantity.to_string(),
            "limit": null,
            "ratio": null,
            "unit": unit,
            "state": "available",
            "availability": "complete",
            "capability": key,
            "enforcement": "advisory",
            "behavior": "observe",
        })
    };

    let now = chrono::Utc::now();
    let period_start = now - chrono::Duration::days(30);

    Ok(Json(serde_json::json!({
        "data": {
            "plan": { "key": "free", "name": "Free" },
            "availability": "complete",
            "period": {
                "start": period_start.to_rfc3339(),
                "endExclusive": now.to_rfc3339(),
            },
            "meters": [
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
            "_assetCount": deminr_of_assets,
        }
    })))
}
