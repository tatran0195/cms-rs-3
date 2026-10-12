//! Security audit logger ported from MedBrains.
//!
//! Provides tamper-resistant, structured audit logs for authentication,
//! access control changes, and security events.

use chrono::{DateTime, Utc};
use cms_error::AppError;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEntry {
    pub tenant_id: Uuid,
    pub user_id: Option<String>,
    pub action: String,
    pub entity_type: String,
    pub entity_id: Option<String>,
    pub ip_address: Option<String>,
    pub details: Option<serde_json::Value>,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct SecurityAuditRow {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub user_id: Option<String>,
    pub action: String,
    pub entity_type: String,
    pub entity_id: Option<String>,
    pub ip_address: Option<String>,
    pub details: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
}

pub struct AuditLogger;

impl AuditLogger {
    /// Write an immutable audit log entry to `security_audit_logs`.
    pub async fn log(pool: &PgPool, entry: &AuditEntry) -> Result<Uuid, AppError> {
        let id = sqlx::query_scalar::<_, Uuid>(
            r#"
            INSERT INTO security_audit_logs (
                tenant_id, user_id, action, entity_type, entity_id, ip_address, details
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
            "#,
        )
        .bind(entry.tenant_id)
        .bind(&entry.user_id)
        .bind(&entry.action)
        .bind(&entry.entity_type)
        .bind(&entry.entity_id)
        .bind(&entry.ip_address)
        .bind(&entry.details)
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        tracing::info!(
            audit_id = %id,
            action = %entry.action,
            entity_type = %entry.entity_type,
            user_id = ?entry.user_id,
            "security audit log recorded"
        );

        Ok(id)
    }

    /// Query recent audit logs for an entity or user.
    pub async fn query_recent(
        pool: &PgPool,
        action: Option<&str>,
        user_id: Option<&str>,
        limit: i64,
    ) -> Result<Vec<SecurityAuditRow>, AppError> {
        let rows = sqlx::query_as::<_, SecurityAuditRow>(
            r#"
            SELECT id, tenant_id, user_id, action, entity_type, entity_id, ip_address, details, created_at
            FROM security_audit_logs
            WHERE ($1::text IS NULL OR action = $1)
              AND ($2::text IS NULL OR user_id = $2)
            ORDER BY created_at DESC
            LIMIT $3
            "#,
        )
        .bind(action)
        .bind(user_id)
        .bind(limit)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(rows)
    }
}
