//! Database queries for platform setup and system settings

use chrono::Utc;
use cms_entity::auth::User;
use cms_entity::setup::CompleteSetupRequest;
use cms_error::AppError;
use sqlx::PgPool;
use uuid::Uuid;

use crate::auth::UserRow;

pub struct SetupQueries;

impl SetupQueries {
    /// Check whether the platform requires initial setup
    pub async fn get_setup_status(pool: &PgPool) -> Result<(bool, bool), AppError> {
        let is_initialized = sqlx::query_scalar::<_, bool>(
            r#"SELECT is_initialized FROM "SystemSettings" WHERE id = 'default' LIMIT 1"#,
        )
        .fetch_optional(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?
        .unwrap_or(false);

        let user_count = sqlx::query_scalar::<_, i64>(r#"SELECT COUNT(*) FROM "User""#)
            .fetch_one(pool)
            .await
            .map_err(|e| AppError::Database(e.into()))?;

        let requires_setup = !is_initialized || user_count == 0;
        Ok((is_initialized, requires_setup))
    }

    /// Check if public signup is allowed
    pub async fn is_public_signup_allowed(pool: &PgPool) -> Result<bool, AppError> {
        let allowed = sqlx::query_scalar::<_, bool>(
            r#"SELECT allow_public_signup FROM "SystemSettings" WHERE id = 'default' LIMIT 1"#,
        )
        .fetch_optional(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?
        .unwrap_or(false);

        Ok(allowed)
    }

    /// Execute atomic setup completion
    pub async fn complete_setup(
        pool: &PgPool,
        req: &CompleteSetupRequest,
        hashed_password: &str,
        session_token: &str,
    ) -> Result<User, AppError> {
        let mut tx = pool.begin().await.map_err(|e| AppError::Database(e.into()))?;

        // 1. Transactional lock check
        let initialized: bool = sqlx::query_scalar(
            r#"SELECT is_initialized FROM "SystemSettings" WHERE id = 'default' FOR UPDATE"#,
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        if initialized {
            return Err(AppError::Conflict(
                "System setup has already been completed".to_string(),
            ));
        }

        let user_count: i64 = sqlx::query_scalar(r#"SELECT COUNT(*) FROM "User""#)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.into()))?;

        if user_count > 0 {
            return Err(AppError::Conflict(
                "System already contains registered users".to_string(),
            ));
        }

        // 2. Create primary superadmin user
        let user_id = Uuid::new_v4().to_string();
        let now = Utc::now();
        let user_row = sqlx::query_as::<_, UserRow>(
            r#"
            INSERT INTO "User" (id, email, name, email_verified, role, created_at, updated_at)
            VALUES ($1, $2, $3, true, 'admin', $4, $5)
            RETURNING id, email, name, image, email_verified, created_at, updated_at
            "#,
        )
        .bind(&user_id)
        .bind(&req.admin_email)
        .bind(&req.admin_name)
        .bind(now)
        .bind(now)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        // 3. Create credentials account
        let account_id = Uuid::new_v4().to_string();
        sqlx::query(
            r#"
            INSERT INTO "Account" (id, user_id, provider, provider_account_id, password, created_at, updated_at)
            VALUES ($1, $2, 'credentials', $3, $4, $5, $6)
            "#,
        )
        .bind(&account_id)
        .bind(&user_id)
        .bind(&req.admin_email)
        .bind(hashed_password)
        .bind(now)
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        // 4. Update WorkspaceSettings
        sqlx::query(
            r#"
            INSERT INTO "WorkspaceSettings" (id, name, slug, logo_url, description, updated_at)
            VALUES ('default', $1, $2, $3, $4, $5)
            ON CONFLICT (id) DO UPDATE
            SET name = EXCLUDED.name,
                slug = EXCLUDED.slug,
                logo_url = EXCLUDED.logo_url,
                description = EXCLUDED.description,
                updated_at = EXCLUDED.updated_at
            "#,
        )
        .bind(&req.workspace_name)
        .bind(&req.workspace_slug)
        .bind(&req.workspace_logo_url)
        .bind(&req.workspace_description)
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        // 5. Update SystemSettings
        let auth_providers = serde_json::to_value(&req.enabled_oauth_providers).unwrap_or_default();
        sqlx::query(
            r#"
            UPDATE "SystemSettings"
            SET is_initialized = true,
                initialized_at = $1,
                initialized_by = $2,
                allow_public_signup = $3,
                require_email_verification = $4,
                auth_providers = $5,
                default_theme = $6,
                default_locale = $7,
                updated_at = $8
            WHERE id = 'default'
            "#,
        )
        .bind(now)
        .bind(&user_id)
        .bind(req.allow_public_signup)
        .bind(req.require_email_verification)
        .bind(auth_providers)
        .bind(&req.default_theme)
        .bind(&req.default_locale)
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        // 6. Create initial admin session
        let expires_at = now + chrono::Duration::days(30);
        sqlx::query(
            r#"
            INSERT INTO "Session" (id, user_id, session_token, expires_at, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            "#,
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&user_id)
        .bind(session_token)
        .bind(expires_at)
        .bind(now)
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        tx.commit().await.map_err(|e| AppError::Database(e.into()))?;

        Ok(user_row.into())
    }
}
