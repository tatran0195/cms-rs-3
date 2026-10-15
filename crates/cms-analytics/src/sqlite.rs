use async_trait::async_trait;
use cms_error::AppError;
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    Row, SqlitePool,
};

use crate::traits::AnalyticsStore;

/// Embedded SQLite analytics store for self-contained, high-performance local analytics.
#[derive(Clone)]
pub struct SqliteAnalyticsStore {
    pool: SqlitePool,
}

impl SqliteAnalyticsStore {
    /// Initialize embedded SQLite analytics store (file path or ":memory:")
    pub async fn new(path: &str) -> Result<Self, AppError> {
        let opts = if path == ":memory:" {
            use std::str::FromStr;
            SqliteConnectOptions::from_str("sqlite::memory:")
                .map_err(|e| AppError::Storage(format!("Failed to parse SQLite memory url: {}", e)))?
                .create_if_missing(true)
        } else {
            if let Some(parent) = std::path::Path::new(path).parent() {
                if !parent.as_os_str().is_empty() {
                    let _ = std::fs::create_dir_all(parent);
                }
            }
            SqliteConnectOptions::new()
                .filename(path)
                .create_if_missing(true)
        };

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(opts)
            .await
            .map_err(|e| AppError::Storage(format!("Failed to open SQLite analytics db: {}", e)))?;

        if path != ":memory:" {
            let _ = sqlx::raw_sql(
                r#"
                PRAGMA journal_mode = WAL;
                PRAGMA synchronous = NORMAL;
                "#,
            )
            .execute(&pool)
            .await;
        }

        sqlx::raw_sql(
            r#"
            CREATE TABLE IF NOT EXISTS analytics_events (
                id TEXT PRIMARY KEY,
                project_id TEXT,
                user_id TEXT,
                event_type TEXT NOT NULL,
                metadata TEXT NOT NULL,
                ip_address TEXT,
                user_agent TEXT,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_analytics_proj_created ON analytics_events(project_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics_events(event_type);
            "#,
        )
        .execute(&pool)
        .await
        .map_err(|e| AppError::Storage(format!("Failed to initialize SQLite analytics schema: {}", e)))?;

        Ok(Self { pool })
    }

    /// In-memory SQLite analytics store for testing
    pub async fn in_memory() -> Result<Self, AppError> {
        Self::new(":memory:").await
    }
}

#[async_trait]
impl AnalyticsStore for SqliteAnalyticsStore {
    async fn record_event(
        &self,
        project_id: Option<&str>,
        user_id: Option<&str>,
        event_type: &str,
        metadata: serde_json::Value,
        ip_address: Option<&str>,
        user_agent: Option<&str>,
    ) -> Result<(), AppError> {
        let id = uuid::Uuid::new_v4().to_string();
        let metadata_str = metadata.to_string();
        let created_at = chrono::Utc::now().to_rfc3339();

        sqlx::query(
            r#"
            INSERT INTO analytics_events (
                id, project_id, user_id, event_type, metadata, ip_address, user_agent, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(project_id)
        .bind(user_id)
        .bind(event_type)
        .bind(&metadata_str)
        .bind(ip_address)
        .bind(user_agent)
        .bind(&created_at)
        .execute(&self.pool)
        .await
        .map_err(|e| {
            AppError::Storage(format!(
                "Failed to insert analytics event into SQLite: {}",
                e
            ))
        })?;

        Ok(())
    }

    async fn query_events(
        &self,
        project_id: Option<&str>,
        user_id: Option<&str>,
        event_type: Option<&str>,
        start_date: Option<chrono::DateTime<chrono::Utc>>,
        end_date: Option<chrono::DateTime<chrono::Utc>>,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<cms_entity::analytics::AnalyticsEvent>, AppError> {
        let start_date_str = start_date.map(|t| t.to_rfc3339());
        let end_date_str = end_date.map(|t| t.to_rfc3339());
        let limit = limit.unwrap_or(100);
        let offset = offset.unwrap_or(0);

        let mut query = sqlx::QueryBuilder::<sqlx::Sqlite>::new(
            "SELECT id, project_id, user_id, event_type, metadata, ip_address, user_agent, \
             created_at FROM analytics_events WHERE 1=1",
        );

        if let Some(proj) = project_id {
            query.push(" AND project_id = ");
            query.push_bind(proj);
        }
        if let Some(uid) = user_id {
            query.push(" AND user_id = ");
            query.push_bind(uid);
        }
        if let Some(et) = event_type {
            query.push(" AND event_type = ");
            query.push_bind(et);
        }
        if let Some(st) = start_date_str {
            query.push(" AND created_at >= ");
            query.push_bind(st);
        }
        if let Some(et) = end_date_str {
            query.push(" AND created_at <= ");
            query.push_bind(et);
        }

        query.push(" ORDER BY created_at DESC LIMIT ");
        query.push_bind(limit);
        query.push(" OFFSET ");
        query.push_bind(offset);

        let rows = query
            .build()
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::Storage(format!("Failed to query analytics: {}", e)))?;

        let mut result = Vec::with_capacity(rows.len());
        for row in rows {
            let id: String = row.get(0);
            let project_id: Option<String> = row.get(1);
            let user_id: Option<String> = row.get(2);
            let event_type: String = row.get(3);
            let metadata_str: String = row.get(4);
            let ip_address: Option<String> = row.get(5);
            let user_agent: Option<String> = row.get(6);
            let created_at_str: String = row.get(7);

            let metadata: serde_json::Value =
                serde_json::from_str(&metadata_str).unwrap_or(serde_json::Value::Null);
            let created_at = chrono::DateTime::parse_from_rfc3339(&created_at_str)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now());

            result.push(cms_entity::analytics::AnalyticsEvent {
                id,
                project_id,
                user_id,
                event_type,
                metadata,
                ip_address,
                user_agent,
                created_at,
            });
        }

        Ok(result)
    }

    async fn get_summary(
        &self,
        start_date: chrono::DateTime<chrono::Utc>,
        end_date: chrono::DateTime<chrono::Utc>,
    ) -> Result<serde_json::Value, AppError> {
        let start_date_str = start_date.to_rfc3339();
        let end_date_str = end_date.to_rfc3339();

        let total_events: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM analytics_events WHERE created_at >= ? AND created_at <= ?",
        )
        .bind(&start_date_str)
        .bind(&end_date_str)
        .fetch_one(&self.pool)
        .await
        .unwrap_or(0);

        let page_views: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM analytics_events WHERE event_type = 'page_view' AND created_at \
             >= ? AND created_at <= ?",
        )
        .bind(&start_date_str)
        .bind(&end_date_str)
        .fetch_one(&self.pool)
        .await
        .unwrap_or(0);

        let unique_users: i64 = sqlx::query_scalar(
            "SELECT COUNT(DISTINCT user_id) FROM analytics_events WHERE user_id IS NOT NULL AND \
             created_at >= ? AND created_at <= ?",
        )
        .bind(&start_date_str)
        .bind(&end_date_str)
        .fetch_one(&self.pool)
        .await
        .unwrap_or(0);

        let searches: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM analytics_events WHERE event_type = 'search' AND created_at >= \
             ? AND created_at <= ?",
        )
        .bind(&start_date_str)
        .bind(&end_date_str)
        .fetch_one(&self.pool)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_sqlite_analytics_store() {
        let store = SqliteAnalyticsStore::in_memory()
            .await
            .expect("failed to create sqlite analytics store");

        // Record events
        store
            .record_event(
                Some("proj-1"),
                Some("user-1"),
                "page_view",
                serde_json::json!({"path": "/docs/intro"}),
                Some("127.0.0.1"),
                Some("Mozilla/5.0"),
            )
            .await
            .unwrap();

        store
            .record_event(
                Some("proj-1"),
                Some("user-2"),
                "page_view",
                serde_json::json!({"path": "/docs/getting-started"}),
                Some("127.0.0.1"),
                Some("Mozilla/5.0"),
            )
            .await
            .unwrap();

        store
            .record_event(
                Some("proj-1"),
                Some("user-1"),
                "search",
                serde_json::json!({"query": "install"}),
                None,
                None,
            )
            .await
            .unwrap();

        // Query events
        let events = store
            .query_events(Some("proj-1"), None, None, None, None, None, None)
            .await
            .unwrap();
        assert_eq!(events.len(), 3);

        let pv_events = store
            .query_events(
                Some("proj-1"),
                None,
                Some("page_view"),
                None,
                None,
                None,
                None,
            )
            .await
            .unwrap();
        assert_eq!(pv_events.len(), 2);

        // Get summary
        let now = chrono::Utc::now();
        let summary = store
            .get_summary(
                now - chrono::Duration::hours(1),
                now + chrono::Duration::hours(1),
            )
            .await
            .unwrap();

        assert_eq!(summary["total_events"], 3);
        assert_eq!(summary["unique_users"], 2);
        assert_eq!(summary["page_views"], 2);
        assert_eq!(summary["searches"], 1);
    }

    #[tokio::test]
    async fn test_project_analytics_isolation() {
        let tmp = tempfile::tempdir().unwrap();
        let db_path = tmp.path().join("isolation.db");
        let store = SqliteAnalyticsStore::new(&db_path.to_string_lossy())
            .await
            .unwrap();

        // 1. Seed events for Project A
        store
            .record_event(
                Some("proj_a"),
                Some("user_a1"),
                "page_view",
                serde_json::json!({"path": "/docs/a1"}),
                Some("1.1.1.1"),
                None,
            )
            .await
            .unwrap();
        store
            .record_event(
                Some("proj_a"),
                Some("user_a2"),
                "page_view",
                serde_json::json!({"path": "/docs/a2"}),
                Some("1.1.1.2"),
                None,
            )
            .await
            .unwrap();

        // 2. Seed events for Project B
        store
            .record_event(
                Some("proj_b"),
                Some("user_b1"),
                "page_view",
                serde_json::json!({"path": "/docs/b1"}),
                Some("2.2.2.1"),
                None,
            )
            .await
            .unwrap();
        store
            .record_event(
                Some("proj_b"),
                Some("user_b2"),
                "search",
                serde_json::json!({"query": "secret_b"}),
                Some("2.2.2.2"),
                None,
            )
            .await
            .unwrap();

        // 3. Project A query returns ONLY Project A events
        let proj_a_events = store
            .query_events(Some("proj_a"), None, None, None, None, None, None)
            .await
            .unwrap();
        assert_eq!(
            proj_a_events.len(),
            2,
            "Project A must only see its own 2 events"
        );
        for event in &proj_a_events {
            assert_eq!(event.project_id.as_deref(), Some("proj_a"));
            assert_ne!(event.project_id.as_deref(), Some("proj_b"));
        }

        // 4. Project B query returns ONLY Project B events
        let proj_b_events = store
            .query_events(Some("proj_b"), None, None, None, None, None, None)
            .await
            .unwrap();
        assert_eq!(
            proj_b_events.len(),
            2,
            "Project B must only see its own 2 events"
        );
        for event in &proj_b_events {
            assert_eq!(event.project_id.as_deref(), Some("proj_b"));
            assert_ne!(event.project_id.as_deref(), Some("proj_a"));
        }

        // 5. Pagination
        let paginated_a = store
            .query_events(Some("proj_a"), None, None, None, None, Some(1), Some(1))
            .await
            .unwrap();
        assert_eq!(paginated_a.len(), 1);
        assert_eq!(paginated_a[0].project_id.as_deref(), Some("proj_a"));
    }
}
