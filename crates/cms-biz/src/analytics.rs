//! Analytics Business Logic
//!
//! This module contains business logic for analytics tracking.

use cms_db::analytics::{AnalyticsEventQueries, AnalyticsQueries};
use cms_entity::analytics::{
    AnalyticsDashboardResponse, AnalyticsEventResponse, AnalyticsQueryRequest,
    AnalyticsQueryResponse,
};

use crate::{AppError, BizContext};

/// Analytics service
pub struct AnalyticsService;

impl AnalyticsService {
    /// Record an analytics event
    #[allow(clippy::too_many_arguments)]
    pub async fn record_event(
        ctx: &BizContext,
        project_id: Option<&str>,
        user_id: Option<&str>,
        event_type: &str,
        metadata: serde_json::Value,
        ip_address: Option<&str>,
        user_agent: Option<&str>,
    ) -> Result<AnalyticsEventResponse, AppError> {
        let event = AnalyticsEventQueries::create(
            &ctx.pool, project_id, user_id, event_type, metadata, ip_address, user_agent,
        )
        .await?;

        Ok(event.into())
    }

    /// Query analytics events
    pub async fn query_events(
        ctx: &BizContext,
        _user_id: &str,
        request: AnalyticsQueryRequest,
        page: u64,
        page_size: u64,
    ) -> Result<AnalyticsQueryResponse, AppError> {
        if let Some(ref proj_id) = request.project_id {
            let _project = cms_db::project::ProjectQueries::get_by_id(&ctx.pool, proj_id)
                .await?
                .ok_or_else(|| AppError::NotFound(format!("Project {proj_id} not found")))?;
        }

        let limit = page_size as i64;
        let offset = ((page.saturating_sub(1)) as i64) * limit;

        let events = AnalyticsEventQueries::query(
            &ctx.pool,
            request.project_id.as_deref(),
            request.user_id.as_deref(),
            request.event_type.as_deref(),
            request.start_date,
            request.end_date,
            limit,
            offset,
        )
        .await?;

        let total = AnalyticsEventQueries::count(
            &ctx.pool,
            request.project_id.as_deref(),
            request.user_id.as_deref(),
            request.event_type.as_deref(),
            request.start_date,
            request.end_date,
        )
        .await?;

        let event_responses: Vec<AnalyticsEventResponse> =
            events.into_iter().map(|e| e.into()).collect();

        Ok(AnalyticsQueryResponse {
            query: request,
            results: vec![],
            total,
            events: event_responses,
            page: page as i64,
            page_size: page_size as i64,
        })
    }

    /// Get analytics summary
    pub async fn get_summary(
        ctx: &BizContext,
        _user_id: &str,
        start_date: chrono::DateTime<chrono::Utc>,
        end_date: chrono::DateTime<chrono::Utc>,
    ) -> Result<serde_json::Value, AppError> {
        AnalyticsQueries::get_summary(&ctx.pool, start_date, end_date).await
    }

    /// Track an analytics event
    pub async fn track_event(
        ctx: &BizContext,
        request: cms_entity::analytics::TrackAnalyticsEventRequest,
    ) -> Result<AnalyticsEventResponse, AppError> {
        Self::record_event(
            ctx,
            request.project_id.as_deref(),
            request.user_id.as_deref(),
            &request.event_type,
            request.metadata,
            request.ip_address.as_deref(),
            request.user_agent.as_deref(),
        )
        .await
    }

    /// List analytics events
    pub async fn list_events(
        ctx: &BizContext,
        user_id: &str,
        query: cms_entity::analytics::ListAnalyticsEventsQuery,
    ) -> Result<cms_entity::common::PaginatedResponse<AnalyticsEventResponse>, AppError> {
        let page = query.page.unwrap_or(1) as u64;
        let page_size = query.page_size.unwrap_or(20) as u64;
        let response = Self::query_events(ctx, user_id, query, page, page_size).await?;
        Ok(cms_entity::common::PaginatedResponse::new(
            response.events,
            response.total as u64,
            page,
            page_size,
        ))
    }

    /// Query analytics
    pub async fn query_analytics(
        ctx: &BizContext,
        user_id: &str,
        request: AnalyticsQueryRequest,
    ) -> Result<AnalyticsQueryResponse, AppError> {
        let page = request.page.unwrap_or(1) as u64;
        let page_size = request.page_size.unwrap_or(20) as u64;
        Self::query_events(ctx, user_id, request, page, page_size).await
    }

    /// Get dashboard for a project
    pub async fn get_dashboard(
        ctx: &BizContext,
        _user_id: &str,
        project_id: &str,
    ) -> Result<AnalyticsDashboardResponse, AppError> {
        AnalyticsQueries::get_dashboard(&ctx.pool, project_id).await
    }

    /// Get page views scoped by project and authorized by user
    pub async fn get_page_views(
        ctx: &BizContext,
        _user_id: &str,
        page_id: &str,
    ) -> Result<serde_json::Value, AppError> {
        let page = cms_db::page::PageQueries::get_by_id(&ctx.pool, page_id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Page {page_id} not found")))?;

        AnalyticsQueries::get_page_views(&ctx.pool, &page.project_id, page_id).await
    }

    /// Get system stats
    pub async fn get_system_stats(ctx: &BizContext) -> Result<serde_json::Value, AppError> {
        AnalyticsQueries::get_system_stats(&ctx.pool).await
    }
}

/// Process analytics job (for worker)
pub async fn process_analytics_job(
    pool: &cms_db::PgPool,
    payload: &serde_json::Value,
) -> Result<(), AppError> {
    let event_type = payload
        .get("event_type")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::InvalidInput("Missing event_type".to_string()))?;
    let project_id = payload.get("project_id").and_then(|v| v.as_str());
    let user_id = payload.get("user_id").and_then(|v| v.as_str());
    let metadata = payload.get("metadata").cloned().unwrap_or_default();
    let ip_address = payload.get("ip_address").and_then(|v| v.as_str());
    let user_agent = payload.get("user_agent").and_then(|v| v.as_str());

    AnalyticsEventQueries::create(
        pool, project_id, user_id, event_type, metadata, ip_address, user_agent,
    )
    .await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use cms_authz::AuthzState;
    use uuid::Uuid;

    use super::*;

    #[tokio::test]
    async fn test_analytics_query_events_sql_count_pagination() {
        let database_url = std::env::var("CMS_DATABASE__URL")
            .or_else(|_| std::env::var("DATABASE_URL"))
            .unwrap_or_else(|_| "postgres://postgres:postgres@localhost:5432/cms".to_string());

        let pool = match cms_db::create_pool(&database_url).await {
            Ok(p) => p,
            Err(_) => return,
        };

        if cms_db::test_connection(&pool).await.is_err() {
            return;
        }

        let user_id = format!("user-analytics-{}", Uuid::new_v4());
        let now = chrono::Utc::now();

        // Seed user
        let _ = cms_db::sqlx::query(
            r#"INSERT INTO "User" (id, email, name, email_verified, role, created_at, updated_at)
               VALUES ($1, $2, 'Analytics User', TRUE, 'user', $3, $3)"#,
        )
        .bind(&user_id)
        .bind(format!("analytics-{}@internal.company", Uuid::new_v4()))
        .bind(now)
        .execute(&pool)
        .await;

        // Seed 3 analytics events
        for i in 0..3 {
            let _ = AnalyticsEventQueries::create(
                &pool,
                None,
                Some(&user_id),
                "page_view",
                serde_json::json!({ "idx": i }),
                None,
                None,
            )
            .await;
        }

        let ctx = BizContext {
            pool: pool.clone(),
            authz: std::sync::Arc::new(AuthzState::new(pool, vec![])),
        };

        // Query with page_size = 2, so the returned events will be 2, but total must be at least 3
        let req = AnalyticsQueryRequest {
            project_id: None,
            user_id: Some(user_id.clone()),
            event_type: Some("page_view".to_string()),
            start_date: None,
            end_date: None,
            group_by: None,
            limit: None,
            page: Some(1),
            page_size: Some(2),
        };

        let res = AnalyticsService::query_events(&ctx, &user_id, req, 1, 2)
            .await
            .expect("query_events should succeed");

        assert_eq!(res.events.len(), 2, "Returned page should have limit 2");
        assert!(
            res.total >= 3,
            "Total must reflect database COUNT(*), got {}",
            res.total
        );
    }
}
