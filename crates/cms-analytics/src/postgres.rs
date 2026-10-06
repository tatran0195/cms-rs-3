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
        org_id: Option<&str>,
        project_id: Option<&str>,
        user_id: Option<&str>,
        event_type: Option<&str>,
        start_date: Option<chrono::DateTime<chrono::Utc>>,
        end_date: Option<chrono::DateTime<chrono::Utc>>,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<cms_entity::analytics::AnalyticsEvent>, AppError> {
        let org_id = org_id.ok_or_else(|| {
            AppError::Validation("organization_id is required for analytics queries".to_string())
        })?;
        AnalyticsEventQueries::query(
            &self.pool,
            org_id,
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
        AnalyticsQueries::get_summary(&self.pool, org_id, start_date, end_date).await
    }
}
