use async_trait::async_trait;
use cms_error::AppError;

/// Analytics store trait
#[allow(clippy::too_many_arguments)]
#[async_trait]
pub trait AnalyticsStore: Send + Sync {
    /// Record an analytics event
    async fn record_event(
        &self,
        project_id: Option<&str>,
        user_id: Option<&str>,
        event_type: &str,
        metadata: serde_json::Value,
        ip_address: Option<&str>,
        user_agent: Option<&str>,
    ) -> Result<(), AppError>;

    /// Query analytics events
    async fn query_events(
        &self,
        project_id: Option<&str>,
        user_id: Option<&str>,
        event_type: Option<&str>,
        start_date: Option<chrono::DateTime<chrono::Utc>>,
        end_date: Option<chrono::DateTime<chrono::Utc>>,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<cms_entity::analytics::AnalyticsEvent>, AppError>;

    /// Get summary statistics
    async fn get_summary(
        &self,
        start_date: chrono::DateTime<chrono::Utc>,
        end_date: chrono::DateTime<chrono::Utc>,
    ) -> Result<serde_json::Value, AppError>;
}
