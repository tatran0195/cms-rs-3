use async_trait::async_trait;
use cms_error::AppError;

use crate::traits::AnalyticsStore;

/// ClickHouse analytics store (optional — enable with the `clickhouse` feature)
pub struct ClickHouseAnalyticsStore;

impl ClickHouseAnalyticsStore {
    pub async fn new(
        _host: String,
        _port: u16,
        _database: String,
        _username: Option<String>,
        _password: Option<String>,
    ) -> Result<Self, AppError> {
        // ClickHouse integration is not yet implemented.
        // Tracked as future work — requires the `clickhouse` crate.
        Err(AppError::Storage(
            "ClickHouse backend is not yet implemented".to_string(),
        ))
    }
}

#[async_trait]
impl AnalyticsStore for ClickHouseAnalyticsStore {
    async fn record_event(
        &self,
        _org_id: Option<&str>,
        _project_id: Option<&str>,
        _user_id: Option<&str>,
        _event_type: &str,
        _metadata: serde_json::Value,
        _ip_address: Option<&str>,
        _user_agent: Option<&str>,
    ) -> Result<(), AppError> {
        Err(AppError::Storage(
            "ClickHouse backend is not yet implemented".to_string(),
        ))
    }

    async fn query_events(
        &self,
        _org_id: Option<&str>,
        _project_id: Option<&str>,
        _user_id: Option<&str>,
        _event_type: Option<&str>,
        _start_date: Option<chrono::DateTime<chrono::Utc>>,
        _end_date: Option<chrono::DateTime<chrono::Utc>>,
        _limit: Option<i64>,
        _offset: Option<i64>,
    ) -> Result<Vec<cms_entity::analytics::AnalyticsEvent>, AppError> {
        Err(AppError::Storage(
            "ClickHouse backend is not yet implemented".to_string(),
        ))
    }

    async fn get_summary(
        &self,
        _org_id: &str,
        _start_date: chrono::DateTime<chrono::Utc>,
        _end_date: chrono::DateTime<chrono::Utc>,
    ) -> Result<serde_json::Value, AppError> {
        Err(AppError::Storage(
            "ClickHouse backend is not yet implemented".to_string(),
        ))
    }
}
