//! MCP database queries

use chrono::{DateTime, Utc};
use cms_entity::mcp::McpAuditEvent;
use cms_error::AppError;
use sqlx::{FromRow, PgPool, Postgres, QueryBuilder, Row};
use uuid::Uuid;

/// Database representation of an MCP audit event row
#[derive(Debug, FromRow)]
struct McpAuditEventRow {
    id: String,
    project_id: Option<String>,
    user_id: Option<String>,
    operation: String,
    request_id: Option<String>,
    response_status: Option<i32>,
    error_message: Option<String>,
    created_at: DateTime<Utc>,
}

impl From<McpAuditEventRow> for McpAuditEvent {
    fn from(row: McpAuditEventRow) -> Self {
        Self {
            id: row.id,
            project_id: row.project_id,
            user_id: row.user_id,
            operation: row.operation,
            request_id: row.request_id,
            response_status: row.response_status,
            error_message: row.error_message,
            created_at: row.created_at,
        }
    }
}

/// MCP audit event queries
pub struct McpAuditEventQueries;

impl McpAuditEventQueries {
    /// Get an MCP audit event by ID
    pub async fn get_by_id(
        pool: &PgPool,
        event_id: &str,
    ) -> Result<Option<McpAuditEvent>, AppError> {
        let row =
            sqlx::query_as::<_, McpAuditEventRow>("SELECT * FROM \"McpAuditEvent\" WHERE id = $1")
                .bind(event_id)
                .fetch_optional(pool)
                .await
                .map_err(|e| AppError::Database(e.into()))?;

        Ok(row.map(|r| r.into()))
    }

    /// List MCP audit events
    pub async fn list(
        pool: &PgPool,
        project_id: Option<&str>,
        user_id: Option<&str>,
        operation: Option<&str>,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<McpAuditEvent>, AppError> {
        let mut query_builder: QueryBuilder<Postgres> =
            QueryBuilder::new("SELECT * FROM \"McpAuditEvent\" WHERE 1=1");

        if let Some(project_id) = project_id {
            query_builder.push(" AND project_id = ");
            query_builder.push_bind(project_id);
        }

        if let Some(user_id) = user_id {
            query_builder.push(" AND user_id = ");
            query_builder.push_bind(user_id);
        }

        if let Some(operation) = operation {
            query_builder.push(" AND operation = ");
            query_builder.push_bind(operation);
        }

        query_builder.push(" ORDER BY created_at DESC");

        if let Some(limit) = limit {
            query_builder.push(" LIMIT ");
            query_builder.push_bind(limit);
        }

        if let Some(offset) = offset {
            query_builder.push(" OFFSET ");
            query_builder.push_bind(offset);
        }

        let rows = query_builder
            .build_query_as::<McpAuditEventRow>()
            .fetch_all(pool)
            .await
            .map_err(|e| AppError::Database(e.into()))?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    /// Count MCP audit events
    pub async fn count(
        pool: &PgPool,
        project_id: Option<&str>,
        user_id: Option<&str>,
        operation: Option<&str>,
    ) -> Result<i64, AppError> {
        let mut query_builder: QueryBuilder<Postgres> =
            QueryBuilder::new("SELECT COUNT(*) FROM \"McpAuditEvent\" WHERE 1=1");

        if let Some(project_id) = project_id {
            query_builder.push(" AND project_id = ");
            query_builder.push_bind(project_id);
        }

        if let Some(user_id) = user_id {
            query_builder.push(" AND user_id = ");
            query_builder.push_bind(user_id);
        }

        if let Some(operation) = operation {
            query_builder.push(" AND operation = ");
            query_builder.push_bind(operation);
        }

        let count: i64 = query_builder
            .build()
            .fetch_one(pool)
            .await
            .map_err(|e| AppError::Database(e.into()))?
            .get::<i64, _>(0);

        Ok(count)
    }

    /// Create a new MCP audit event
    pub async fn create(
        pool: &PgPool,
        project_id: Option<&str>,
        user_id: Option<&str>,
        operation: &str,
        request_id: Option<&str>,
        response_status: Option<i32>,
        error_message: Option<&str>,
    ) -> Result<McpAuditEvent, AppError> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now();

        let row = sqlx::query_as::<_, McpAuditEventRow>(
            r#"
            INSERT INTO "McpAuditEvent" (id, project_id, user_id, operation, request_id, response_status, error_message, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
            "#
        )
        .bind(&id)
        .bind(project_id)
        .bind(user_id)
        .bind(operation)
        .bind(request_id)
        .bind(response_status)
        .bind(error_message)
        .bind(now)
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(row.into())
    }

    /// Delete an MCP audit event
    pub async fn delete(pool: &PgPool, event_id: &str) -> Result<bool, AppError> {
        let result = sqlx::query("DELETE FROM \"McpAuditEvent\" WHERE id = $1")
            .bind(event_id)
            .execute(pool)
            .await
            .map_err(|e| AppError::Database(e.into()))?;

        Ok(result.rows_affected() > 0)
    }
}
