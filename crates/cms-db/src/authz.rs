//! Database queries for ProjectMember and Zanzibar ReBAC relation tuples.

use chrono::{DateTime, Utc};
use cms_entity::authz::ProjectMember;
use cms_error::AppError;
use sqlx::{FromRow, PgPool, Postgres, QueryBuilder};
use uuid::Uuid;

#[derive(Debug, FromRow)]
struct ProjectMemberRow {
    id: String,
    project_id: String,
    user_id: String,
    role: String,
    role_id: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl From<ProjectMemberRow> for ProjectMember {
    fn from(row: ProjectMemberRow) -> Self {
        Self {
            id: row.id,
            project_id: row.project_id,
            user_id: row.user_id,
            role: row.role,
            role_id: row.role_id,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

pub struct ProjectMemberQueries;

impl ProjectMemberQueries {
    pub async fn create(
        pool: &PgPool,
        project_id: &str,
        user_id: &str,
        role: &str,
        role_id: Option<&str>,
    ) -> Result<ProjectMember, AppError> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now();
        let row = sqlx::query_as::<_, ProjectMemberRow>(
            r#"
            INSERT INTO "ProjectMember" (id, project_id, user_id, role, role_id, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(project_id)
        .bind(user_id)
        .bind(role)
        .bind(role_id)
        .bind(now)
        .bind(now)
        .fetch_one(pool)
        .await
        .map_err(|e| {
            if e.to_string().contains("duplicate key") {
                AppError::Conflict("User is already a member of this project".to_string())
            } else {
                AppError::Database(e.into())
            }
        })?;

        Ok(row.into())
    }

    pub async fn get_by_user_and_project(
        pool: &PgPool,
        user_id: &str,
        project_id: &str,
    ) -> Result<Option<ProjectMember>, AppError> {
        let row = sqlx::query_as::<_, ProjectMemberRow>(
            r#"SELECT * FROM "ProjectMember" WHERE user_id = $1 AND project_id = $2"#,
        )
        .bind(user_id)
        .bind(project_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(row.map(Into::into))
    }

    pub async fn list_by_project(
        pool: &PgPool,
        project_id: &str,
    ) -> Result<Vec<ProjectMember>, AppError> {
        let rows = sqlx::query_as::<_, ProjectMemberRow>(
            r#"SELECT * FROM "ProjectMember" WHERE project_id = $1 ORDER BY created_at ASC"#,
        )
        .bind(project_id)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(rows.into_iter().map(Into::into).collect())
    }

    pub async fn update_role(
        pool: &PgPool,
        project_id: &str,
        user_id: &str,
        role: Option<&str>,
        role_id: Option<&str>,
    ) -> Result<ProjectMember, AppError> {
        let mut qb: QueryBuilder<Postgres> = QueryBuilder::new("UPDATE \"ProjectMember\" SET ");
        let mut has_updates = false;

        if let Some(role) = role {
            qb.push("role = ");
            qb.push_bind(role);
            has_updates = true;
        }
        if let Some(role_id) = role_id {
            if has_updates {
                qb.push(", ");
            }
            qb.push("role_id = ");
            qb.push_bind(role_id);
            has_updates = true;
        }

        if has_updates {
            qb.push(", updated_at = ");
            qb.push_bind(Utc::now());
        }

        qb.push(" WHERE project_id = ");
        qb.push_bind(project_id);
        qb.push(" AND user_id = ");
        qb.push_bind(user_id);
        qb.push(" RETURNING *");

        let row = qb
            .build_query_as::<ProjectMemberRow>()
            .fetch_one(pool)
            .await
            .map_err(|e| AppError::Database(e.into()))?;

        Ok(row.into())
    }

    pub async fn remove(pool: &PgPool, project_id: &str, user_id: &str) -> Result<bool, AppError> {
        let res =
            sqlx::query(r#"DELETE FROM "ProjectMember" WHERE project_id = $1 AND user_id = $2"#)
                .bind(project_id)
                .bind(user_id)
                .execute(pool)
                .await
                .map_err(|e| AppError::Database(e.into()))?;

        Ok(res.rows_affected() > 0)
    }
}

/// Zanzibar ReBAC relation tuple database row
#[derive(Debug, Clone, FromRow)]
pub struct RelationTupleRow {
    pub tuple_id: Uuid,
    pub tenant_id: Uuid,
    pub object_type: String,
    pub object_id: Uuid,
    pub relation: String,
    pub subject_type: String,
    pub subject_id: String,
    pub status: String,
    pub granted_by: Option<Uuid>,
    pub granted_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
}

pub struct RelationTupleQueries;

impl RelationTupleQueries {
    /// Check whether a subject holds any candidate relation on an object
    pub async fn check(
        pool: &PgPool,
        tenant_id: Uuid,
        object_type: &str,
        object_id: Uuid,
        candidate_relations: &[&str],
        subject_type: &str,
        subject_id: &str,
    ) -> Result<bool, AppError> {
        let relations: Vec<String> = candidate_relations
            .iter()
            .map(|s| (*s).to_string())
            .collect();
        let allowed: bool = sqlx::query_scalar(
            r#"
            SELECT EXISTS (
                SELECT 1 FROM relation_tuples
                WHERE tenant_id = $1
                  AND object_type = $2
                  AND object_id = $3
                  AND relation = ANY($4)
                  AND subject_type = $5
                  AND subject_id = $6
                  AND status = 'active'
                  AND (expires_at IS NULL OR expires_at > now())
            )
            "#,
        )
        .bind(tenant_id)
        .bind(object_type)
        .bind(object_id)
        .bind(&relations)
        .bind(subject_type)
        .bind(subject_id)
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(allowed)
    }

    /// Write or activate an explicit relation tuple
    pub async fn write(
        pool: &PgPool,
        tenant_id: Uuid,
        object_type: &str,
        object_id: Uuid,
        relation: &str,
        subject_type: &str,
        subject_id: &str,
        granted_by: Option<Uuid>,
        expires_at: Option<DateTime<Utc>>,
    ) -> Result<Uuid, AppError> {
        let tuple_id = sqlx::query_scalar::<_, Uuid>(
            r#"
            INSERT INTO relation_tuples (
                tenant_id, object_type, object_id, relation, subject_type, subject_id, status, granted_by, expires_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8)
            ON CONFLICT (tenant_id, object_type, object_id, relation, subject_type, subject_id)
            WHERE status = 'active'
            DO UPDATE SET expires_at = EXCLUDED.expires_at, granted_at = now()
            RETURNING tuple_id
            "#,
        )
        .bind(tenant_id)
        .bind(object_type)
        .bind(object_id)
        .bind(relation)
        .bind(subject_type)
        .bind(subject_id)
        .bind(granted_by)
        .bind(expires_at)
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(tuple_id)
    }

    /// Revoke a tuple by tuple_id
    pub async fn revoke(pool: &PgPool, tenant_id: Uuid, tuple_id: Uuid) -> Result<bool, AppError> {
        let rows = sqlx::query(
            r#"
            UPDATE relation_tuples
            SET status = 'revoked'
            WHERE tenant_id = $1 AND tuple_id = $2 AND status = 'active'
            "#,
        )
        .bind(tenant_id)
        .bind(tuple_id)
        .execute(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(rows.rows_affected() > 0)
    }

    /// Revoke a specific tuple by coordinates
    pub async fn revoke_specific(
        pool: &PgPool,
        tenant_id: Uuid,
        object_type: &str,
        object_id: Uuid,
        relation: &str,
        subject_type: &str,
        subject_id: &str,
    ) -> Result<bool, AppError> {
        let rows = sqlx::query(
            r#"
            UPDATE relation_tuples
            SET status = 'revoked'
            WHERE tenant_id = $1
              AND object_type = $2
              AND object_id = $3
              AND relation = $4
              AND subject_type = $5
              AND subject_id = $6
              AND status = 'active'
            "#,
        )
        .bind(tenant_id)
        .bind(object_type)
        .bind(object_id)
        .bind(relation)
        .bind(subject_type)
        .bind(subject_id)
        .execute(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(rows.rows_affected() > 0)
    }

    /// List object IDs of a given type accessible by a subject under any candidate relation
    pub async fn list_accessible(
        pool: &PgPool,
        tenant_id: Uuid,
        object_type: &str,
        candidate_relations: &[&str],
        subject_type: &str,
        subject_id: &str,
    ) -> Result<Vec<Uuid>, AppError> {
        let relations: Vec<String> = candidate_relations
            .iter()
            .map(|s| (*s).to_string())
            .collect();
        let ids = sqlx::query_scalar::<_, Uuid>(
            r#"
            SELECT object_id FROM relation_tuples
            WHERE tenant_id = $1
              AND object_type = $2
              AND relation = ANY($3)
              AND subject_type = $4
              AND subject_id = $5
              AND status = 'active'
              AND (expires_at IS NULL OR expires_at > now())
            "#,
        )
        .bind(tenant_id)
        .bind(object_type)
        .bind(&relations)
        .bind(subject_type)
        .bind(subject_id)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(ids)
    }
}
