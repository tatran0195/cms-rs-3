use async_trait::async_trait;
use cms_db::{
    analytics::{AnalyticsEventQueries, AnalyticsQueries},
    PgPool,
};
use cms_error::AppError;

use crate::traits::AnalyticsStore;

/// Postgres analytics store — delegates to `cms_db::analytics::AnalyticsEventQueries`.
pub struct PostgresAnalyticsStore {
    pool: PgPool,
}

impl PostgresAnalyticsStore {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl AnalyticsStore for PostgresAnalyticsStore {
    async fn record_event(
        &self,
        org_id: Option<&str>,
        project_id: Option<&str>,
        user_id: Option<&str>,
        event_type: &str,
        metadata: serde_json::Value,
        ip_address: Option<&str>,
        user_agent: Option<&str>,
    ) -> Result<(), AppError> {
        AnalyticsEventQueries::create(
            &self.pool, org_id, project_id, user_id, event_type, metadata, ip_address, user_agent,
        )
        .await?;
        Ok(())
    }

    async fn query_events(
        &self,
        _org_id: Option<&str>,
        project_id: Option<&str>,
        user_id: Option<&str>,
        event_type: Option<&str>,
        start_date: Option<chrono::DateTime<chrono::Utc>>,
        end_date: Option<chrono::DateTime<chrono::Utc>>,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<cms_entity::analytics::AnalyticsEvent>, AppError> {
        AnalyticsEventQueries::query(
            &self.pool,
            project_id,
            user_id,
            event_type,
            start_date,
            end_date,
            limit.unwrap_or(100),
            offset.unwrap_or(0),
        )
        .await
    }

    async fn get_summary(
        &self,
        org_id: &str,
        start_date: chrono::DateTime<chrono::Utc>,
        end_date: chrono::DateTime<chrono::Utc>,
    ) -> Result<serde_json::Value, AppError> {
        let total_events = AnalyticsEventQueries::query(
            &self.pool,
            None,
            None,
            None,
            Some(start_date),
            Some(end_date),
            1000,
            0,
        )
        .await
        .map(|v| v.len() as i64)
        .unwrap_or(0);

        let page_views = AnalyticsQueries::get_page_view_count(
            &self.pool,
            org_id,
            Some(start_date),
            Some(end_date),
        )
        .await
        .unwrap_or(0);

        let unique_users = AnalyticsQueries::get_unique_user_count(
            &self.pool,
            org_id,
            Some(start_date),
            Some(end_date),
        )
        .await
        .unwrap_or(0);

        let searches = AnalyticsQueries::get_search_count(
            &self.pool,
            org_id,
            Some(start_date),
            Some(end_date),
        )
        .await
        .unwrap_or(0);

        Ok(serde_json::json!({
            "total_events": total_events,
            "unique_users": unique_users,
            "page_views": page_views,
            "searches": searches,
        }))
    }
}
