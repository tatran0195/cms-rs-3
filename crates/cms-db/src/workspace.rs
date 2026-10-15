//! Workspace database queries
//!
//! Queries for workspace settings, member management, and workspace invitations.

use chrono::{DateTime, Utc};
use cms_error::AppError;
use sqlx::{FromRow, PgPool};

/// Database representation of workspace settings
#[derive(Debug, Clone, FromRow)]
pub struct WorkspaceSettingsRow {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub logo_url: Option<String>,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Database representation of workspace member user
#[derive(Debug, Clone, FromRow)]
pub struct WorkspaceUserRow {
    pub id: String,
    pub email: String,
    pub name: Option<String>,
    pub image: Option<String>,
    pub role: String,
    pub created_at: DateTime<Utc>,
}

/// Database representation of a workspace invitation
#[derive(Debug, Clone, FromRow)]
pub struct WorkspaceInvitationRow {
    pub id: String,
    pub email: String,
    pub role: String,
    pub token: String,
    pub invited_by: Option<String>,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

pub struct WorkspaceQueries;

impl WorkspaceQueries {
    /// Get workspace settings (default row)
    pub async fn get_settings(pool: &PgPool) -> Result<Option<WorkspaceSettingsRow>, AppError> {
        let row = sqlx::query_as::<_, WorkspaceSettingsRow>(
            r#"SELECT id, name, slug, logo_url, description, created_at, updated_at FROM "WorkspaceSettings" WHERE id = 'default' LIMIT 1"#,
        )
        .fetch_optional(pool)
        .await
        .map_err(AppError::Database)?;

        Ok(row)
    }

    /// Update workspace settings
    pub async fn update_settings(
        pool: &PgPool,
        name: Option<&str>,
        logo_url: Option<&str>,
        description: Option<&str>,
    ) -> Result<(), AppError> {
        sqlx::query(
            r#"
            UPDATE "WorkspaceSettings"
            SET name = COALESCE($1, name),
                logo_url = COALESCE($2, logo_url),
                description = COALESCE($3, description),
                updated_at = NOW()
            WHERE id = 'default'
            "#,
        )
        .bind(name)
        .bind(logo_url)
        .bind(description)
        .execute(pool)
        .await
        .map_err(AppError::Database)?;

        Ok(())
    }

    /// Count total registered users in workspace
    pub async fn count_members(pool: &PgPool) -> Result<i64, AppError> {
        let count = sqlx::query_scalar::<_, i64>(r#"SELECT COUNT(*) FROM "User""#)
            .fetch_one(pool)
            .await
            .map_err(AppError::Database)?;

        Ok(count)
    }

    /// Retrieve the owner user ID (the first registered user)
    pub async fn get_owner_user_id(pool: &PgPool) -> Result<Option<String>, AppError> {
        let id = sqlx::query_scalar::<_, String>(
            r#"SELECT id FROM "User" ORDER BY created_at ASC LIMIT 1"#,
        )
        .fetch_optional(pool)
        .await
        .map_err(AppError::Database)?;

        Ok(id)
    }

    /// List all workspace members
    pub async fn list_members(pool: &PgPool) -> Result<Vec<WorkspaceUserRow>, AppError> {
        let rows = sqlx::query_as::<_, WorkspaceUserRow>(
            r#"SELECT id, email, name, image, role, created_at FROM "User" ORDER BY created_at ASC"#,
        )
        .fetch_all(pool)
        .await
        .map_err(AppError::Database)?;

        Ok(rows)
    }

    /// List active workspace invitations
    pub async fn list_pending_invitations(
        pool: &PgPool,
    ) -> Result<Vec<WorkspaceInvitationRow>, AppError> {
        let rows = sqlx::query_as::<_, WorkspaceInvitationRow>(
            r#"SELECT id, email, role, token, invited_by, expires_at, created_at FROM "WorkspaceInvitation" WHERE expires_at > NOW() ORDER BY created_at DESC"#,
        )
        .fetch_all(pool)
        .await
        .map_err(AppError::Database)?;

        Ok(rows)
    }

    /// Insert or update a workspace invitation
    pub async fn upsert_invitation(
        pool: &PgPool,
        id: &str,
        email: &str,
        role: &str,
        token: &str,
        invited_by: &str,
        expires_at: DateTime<Utc>,
        created_at: DateTime<Utc>,
    ) -> Result<(), AppError> {
        sqlx::query(
            r#"
            INSERT INTO "WorkspaceInvitation" (id, email, role, token, invited_by, expires_at, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (email) DO UPDATE SET
                id = EXCLUDED.id,
                role = EXCLUDED.role,
                token = EXCLUDED.token,
                invited_by = EXCLUDED.invited_by,
                expires_at = EXCLUDED.expires_at,
                created_at = EXCLUDED.created_at
            "#,
        )
        .bind(id)
        .bind(email)
        .bind(role)
        .bind(token)
        .bind(invited_by)
        .bind(expires_at)
        .bind(created_at)
        .execute(pool)
        .await
        .map_err(AppError::Database)?;

        Ok(())
    }

    /// Count admins (explicit admin role or initial owner)
    pub async fn count_admins(pool: &PgPool) -> Result<i64, AppError> {
        let count = sqlx::query_scalar::<_, i64>(
            r#"SELECT COUNT(*) FROM "User" WHERE role = 'admin' OR id = (SELECT id FROM "User" ORDER BY created_at ASC LIMIT 1)"#,
        )
        .fetch_one(pool)
        .await
        .map_err(AppError::Database)?;

        Ok(count)
    }

    /// Update user role
    pub async fn update_user_role(pool: &PgPool, id: &str, role: &str) -> Result<(), AppError> {
        sqlx::query(r#"UPDATE "User" SET role = $1, updated_at = NOW() WHERE id = $2"#)
            .bind(role)
            .bind(id)
            .execute(pool)
            .await
            .map_err(AppError::Database)?;

        Ok(())
    }

    /// Delete user
    pub async fn delete_user(pool: &PgPool, id: &str) -> Result<bool, AppError> {
        let res = sqlx::query(r#"DELETE FROM "User" WHERE id = $1"#)
            .bind(id)
            .execute(pool)
            .await
            .map_err(AppError::Database)?;

        Ok(res.rows_affected() > 0)
    }

    /// Delete invitation by id, email, or token
    pub async fn delete_invitation(pool: &PgPool, id_or_token: &str) -> Result<u64, AppError> {
        let res = sqlx::query(
            r#"DELETE FROM "WorkspaceInvitation" WHERE id = $1 OR email = $1 OR token = $1"#,
        )
        .bind(id_or_token)
        .execute(pool)
        .await
        .map_err(AppError::Database)?;

        Ok(res.rows_affected())
    }

    /// Reset workspace: deletes all projects and invitations atomically
    pub async fn reset_workspace(pool: &PgPool) -> Result<(), AppError> {
        let mut tx = pool.begin().await.map_err(AppError::Database)?;
        sqlx::query(r#"DELETE FROM "Project""#)
            .execute(&mut *tx)
            .await
            .map_err(AppError::Database)?;
        sqlx::query(r#"DELETE FROM "WorkspaceInvitation""#)
            .execute(&mut *tx)
            .await
            .map_err(AppError::Database)?;
        tx.commit().await.map_err(AppError::Database)?;
        Ok(())
    }
}
