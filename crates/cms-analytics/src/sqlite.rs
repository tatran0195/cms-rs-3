use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use cms_error::AppError;

use crate::traits::AnalyticsStore;

/// Embedded SQLite analytics store for self-contained, high-performance local analytics.
pub struct SqliteAnalyticsStore {
    conn: Arc<Mutex<rusqlite::Connection>>,
}

impl SqliteAnalyticsStore {
    /// Initialize embedded SQLite analytics store (file path or ":memory:")
    pub fn new(path: &str) -> Result<Self, AppError> {
        if let Some(parent) = std::path::Path::new(path).parent() {
            if !parent.as_os_str().is_empty() {
                let _ = std::fs::create_dir_all(parent);
            }
        }

        let conn = rusqlite::Connection::open(path)
            .map_err(|e| AppError::Storage(format!("Failed to open SQLite analytics db: {}", e)))?;

        conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;

            CREATE TABLE IF NOT EXISTS analytics_events (
                id TEXT PRIMARY KEY,
                organization_id TEXT,
                project_id TEXT,
                user_id TEXT,
                event_type TEXT NOT NULL,
                metadata TEXT NOT NULL,
                ip_address TEXT,
                user_agent TEXT,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_analytics_org_created ON analytics_events(organization_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_analytics_proj_created ON analytics_events(project_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics_events(event_type);
            "#,
        )
        .map_err(|e| AppError::Storage(format!("Failed to initialize SQLite analytics schema: {}", e)))?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    /// In-memory SQLite analytics store for testing
    pub fn in_memory() -> Result<Self, AppError> {
        Self::new(":memory:")
    }
}

#[async_trait]
impl AnalyticsStore for SqliteAnalyticsStore {
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
        let conn = self.conn.clone();
        let id = uuid::Uuid::new_v4().to_string();
        let org_id = org_id.map(String::from);
        let project_id = project_id.map(String::from);
        let user_id = user_id.map(String::from);
        let event_type = event_type.to_string();
        let metadata_str = metadata.to_string();
        let ip_address = ip_address.map(String::from);
        let user_agent = user_agent.map(String::from);
        let created_at = chrono::Utc::now().to_rfc3339();

        tokio::task::spawn_blocking(move || -> Result<(), AppError> {
            let conn = conn.lock().map_err(|_| AppError::Internal(anyhow::anyhow!("SQLite mutex poisoned")))?;
            conn.execute(
                r#"
                INSERT INTO analytics_events (
                    id, organization_id, project_id, user_id, event_type, metadata, ip_address, user_agent, created_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                "#,
                rusqlite::params![
                    id,
                    org_id,
                    project_id,
                    user_id,
                    event_type,
                    metadata_str,
                    ip_address,
                    user_agent,
                    created_at,
                ],
            )
            .map_err(|e| AppError::Storage(format!("Failed to insert analytics event into SQLite: {}", e)))?;

            Ok(())
        })
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("SQLite record task panicked: {}", e)))??;

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
        let org_id_str = org_id.map(String::from).ok_or_else(|| {
            AppError::Validation("organization_id is required for analytics queries".to_string())
        })?;
        let conn = self.conn.clone();
        let project_id = project_id.map(String::from);
        let user_id = user_id.map(String::from);
        let event_type = event_type.map(String::from);
        let start_date_str = start_date.map(|t| t.to_rfc3339());
        let end_date_str = end_date.map(|t| t.to_rfc3339());
        let limit = limit.unwrap_or(100);
        let offset = offset.unwrap_or(0);

        let events = tokio::task::spawn_blocking(
            move || -> Result<Vec<cms_entity::analytics::AnalyticsEvent>, AppError> {
                let conn = conn
                    .lock()
                    .map_err(|_| AppError::Internal(anyhow::anyhow!("SQLite mutex poisoned")))?;

                let mut query = String::from(
                    "SELECT id, organization_id, project_id, user_id, event_type, metadata, \
                     ip_address, user_agent, created_at FROM analytics_events WHERE organization_id = ?",
                );
                let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(org_id_str)];

                if let Some(ref proj) = project_id {
                    query.push_str(" AND project_id = ?");
                    params.push(Box::new(proj.clone()));
                }
                if let Some(ref uid) = user_id {
                    query.push_str(" AND user_id = ?");
                    params.push(Box::new(uid.clone()));
                }
                if let Some(ref et) = event_type {
                    query.push_str(" AND event_type = ?");
                    params.push(Box::new(et.clone()));
                }
                if let Some(ref st) = start_date_str {
                    query.push_str(" AND created_at >= ?");
                    params.push(Box::new(st.clone()));
                }
                if let Some(ref et) = end_date_str {
                    query.push_str(" AND created_at <= ?");
                    params.push(Box::new(et.clone()));
                }

                query.push_str(" ORDER BY created_at DESC LIMIT ? OFFSET ?");
                params.push(Box::new(limit));
                params.push(Box::new(offset));

                let rusqlite_params: Vec<&dyn rusqlite::ToSql> =
                    params.iter().map(|p| p.as_ref()).collect();

                let mut stmt = conn
                    .prepare(&query)
                    .map_err(|e| AppError::Storage(format!("Failed to prepare query: {}", e)))?;

                let rows = stmt
                    .query_map(rusqlite_params.as_slice(), |row| {
                        let id: String = row.get(0)?;
                        let organization_id: Option<String> = row.get(1)?;
                        let project_id: Option<String> = row.get(2)?;
                        let user_id: Option<String> = row.get(3)?;
                        let event_type: String = row.get(4)?;
                        let metadata_str: String = row.get(5)?;
                        let ip_address: Option<String> = row.get(6)?;
                        let user_agent: Option<String> = row.get(7)?;
                        let created_at_str: String = row.get(8)?;

                        let metadata: serde_json::Value =
                            serde_json::from_str(&metadata_str).unwrap_or(serde_json::Value::Null);
                        let created_at = chrono::DateTime::parse_from_rfc3339(&created_at_str)
                            .map(|dt| dt.with_timezone(&chrono::Utc))
                            .unwrap_or_else(|_| chrono::Utc::now());

                        Ok(cms_entity::analytics::AnalyticsEvent {
                            id,
                            organization_id,
                            project_id,
                            user_id,
                            event_type,
                            metadata,
                            ip_address,
                            user_agent,
                            created_at,
                        })
                    })
                    .map_err(|e| AppError::Storage(format!("Failed to query analytics: {}", e)))?;

                let mut result = Vec::new();
                for event in rows.flatten() {
                    result.push(event);
                }

                Ok(result)
            },
        )
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("SQLite query task panicked: {}", e)))??;

        Ok(events)
    }

    async fn get_summary(
        &self,
        org_id: &str,
        start_date: chrono::DateTime<chrono::Utc>,
        end_date: chrono::DateTime<chrono::Utc>,
    ) -> Result<serde_json::Value, AppError> {
        let conn = self.conn.clone();
        let org_id = org_id.to_string();
        let start_date_str = start_date.to_rfc3339();
        let end_date_str = end_date.to_rfc3339();

        let summary =
            tokio::task::spawn_blocking(move || -> Result<serde_json::Value, AppError> {
                let conn = conn
                    .lock()
                    .map_err(|_| AppError::Internal(anyhow::anyhow!("SQLite mutex poisoned")))?;

                let total_events: i64 = conn
                    .query_row(
                        "SELECT COUNT(*) FROM analytics_events WHERE organization_id = ?1 AND \
                         created_at >= ?2 AND created_at <= ?3",
                        rusqlite::params![org_id, start_date_str, end_date_str],
                        |row| row.get(0),
                    )
                    .unwrap_or(0);

                let page_views: i64 = conn
                    .query_row(
                        "SELECT COUNT(*) FROM analytics_events WHERE organization_id = ?1 AND \
                         event_type = 'page_view' AND created_at >= ?2 AND created_at <= ?3",
                        rusqlite::params![org_id, start_date_str, end_date_str],
                        |row| row.get(0),
                    )
                    .unwrap_or(0);

                let unique_users: i64 = conn
                    .query_row(
                        "SELECT COUNT(DISTINCT user_id) FROM analytics_events WHERE \
                         organization_id = ?1 AND user_id IS NOT NULL AND created_at >= ?2 AND \
                         created_at <= ?3",
                        rusqlite::params![org_id, start_date_str, end_date_str],
                        |row| row.get(0),
                    )
                    .unwrap_or(0);

                let searches: i64 = conn
                    .query_row(
                        "SELECT COUNT(*) FROM analytics_events WHERE organization_id = ?1 AND \
                         event_type = 'search' AND created_at >= ?2 AND created_at <= ?3",
                        rusqlite::params![org_id, start_date_str, end_date_str],
                        |row| row.get(0),
                    )
                    .unwrap_or(0);

                Ok(serde_json::json!({
                    "total_events": total_events,
                    "unique_users": unique_users,
                    "page_views": page_views,
                    "searches": searches,
                }))
            })
            .await
            .map_err(|e| {
                AppError::Internal(anyhow::anyhow!("SQLite summary task panicked: {}", e))
            })??;

        Ok(summary)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_sqlite_analytics_store() {
        let store =
            SqliteAnalyticsStore::in_memory().expect("failed to create sqlite analytics store");

        // Record events
        store
            .record_event(
                Some("org-1"),
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
                Some("org-1"),
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
                Some("org-1"),
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
            .query_events(Some("org-1"), None, None, None, None, None, None, None)
            .await
            .unwrap();
        assert_eq!(events.len(), 3);

        let pv_events = store
            .query_events(
                Some("org-1"),
                None,
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
                "org-1",
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
    async fn test_cross_tenant_analytics_isolation() {
        let tmp = tempfile::tempdir().unwrap();
        let db_path = tmp.path().join("isolation.db");
        let store = SqliteAnalyticsStore::new(&db_path.to_string_lossy()).unwrap();

        // 1. Seed events for Organization A
        store
            .record_event(
                Some("org_a"),
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
                Some("org_a"),
                Some("proj_a"),
                Some("user_a2"),
                "page_view",
                serde_json::json!({"path": "/docs/a2"}),
                Some("1.1.1.2"),
                None,
            )
            .await
            .unwrap();

        // 2. Seed events for Organization B
        store
            .record_event(
                Some("org_b"),
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
                Some("org_b"),
                Some("proj_b"),
                Some("user_b2"),
                "search",
                serde_json::json!({"query": "secret_b"}),
                Some("2.2.2.2"),
                None,
            )
            .await
            .unwrap();

        // 3. Org A organization-wide query (empty project filter) returns ONLY Org A events
        let org_a_events = store
            .query_events(Some("org_a"), None, None, None, None, None, None, None)
            .await
            .unwrap();
        assert_eq!(
            org_a_events.len(),
            2,
            "Org A must only see its own 2 events"
        );
        for event in &org_a_events {
            assert_eq!(event.organization_id.as_deref(), Some("org_a"));
            assert_ne!(event.organization_id.as_deref(), Some("org_b"));
        }

        // 4. Org B organization-wide query (empty project filter) returns ONLY Org B events
        let org_b_events = store
            .query_events(Some("org_b"), None, None, None, None, None, None, None)
            .await
            .unwrap();
        assert_eq!(
            org_b_events.len(),
            2,
            "Org B must only see its own 2 events"
        );
        for event in &org_b_events {
            assert_eq!(event.organization_id.as_deref(), Some("org_b"));
            assert_ne!(event.organization_id.as_deref(), Some("org_a"));
        }

        // 5. Org A cannot retrieve events by querying Org B's project_id
        let org_a_query_proj_b = store
            .query_events(
                Some("org_a"),
                Some("proj_b"),
                None,
                None,
                None,
                None,
                None,
                None,
            )
            .await
            .unwrap();
        assert!(
            org_a_query_proj_b.is_empty(),
            "Org A cannot retrieve Org B project events"
        );

        // 6. Missing tenant context (org_id: None) is rejected
        let unscoped_query = store
            .query_events(None, None, None, None, None, None, None, None)
            .await;
        assert!(
            unscoped_query.is_err(),
            "Unscoped analytics queries without tenant context must be rejected"
        );

        // 7. Aggregations (get_summary) for Org A exclude Org B entirely
        let now = chrono::Utc::now();
        let summary_a = store
            .get_summary(
                "org_a",
                now - chrono::Duration::hours(1),
                now + chrono::Duration::hours(1),
            )
            .await
            .unwrap();
        assert_eq!(summary_a["total_events"], 2);
        assert_eq!(summary_a["page_views"], 2);
        assert_eq!(
            summary_a["searches"], 0,
            "Org B search must not bleed into Org A summary"
        );

        // 8. Aggregations (get_summary) for Org B exclude Org A entirely
        let summary_b = store
            .get_summary(
                "org_b",
                now - chrono::Duration::hours(1),
                now + chrono::Duration::hours(1),
            )
            .await
            .unwrap();
        assert_eq!(summary_b["total_events"], 2);
        assert_eq!(summary_b["page_views"], 1);
        assert_eq!(summary_b["searches"], 1);

        // 9. Pagination cannot leak another tenant's records
        let paginated_a = store
            .query_events(
                Some("org_a"),
                None,
                None,
                None,
                None,
                None,
                Some(1),
                Some(1),
            )
            .await
            .unwrap();
        assert_eq!(paginated_a.len(), 1);
        assert_eq!(paginated_a[0].organization_id.as_deref(), Some("org_a"));
    }
}
