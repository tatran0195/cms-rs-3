//! Platform bootstrap execution logic

use chrono::Utc;
use cms_db::PgPool;
use cms_error::AppError;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::starter_docs::create_starter_project;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformBootstrapOptions {
    pub admin_email: String,
    pub admin_password: String,
    pub admin_name: String,
    pub workspace_name: String,
    pub workspace_slug: String,
    pub default_locale: String,
    pub default_theme: String,
    pub create_starter_project: bool,
    pub starter_project_name: Option<String>,
    pub starter_project_slug: Option<String>,
    pub skip_if_initialized: bool,
    pub force: bool,
}

impl Default for PlatformBootstrapOptions {
    fn default() -> Self {
        Self {
            admin_email: "admin@company.local".to_string(),
            admin_password: "Password123!".to_string(),
            admin_name: "System Administrator".to_string(),
            workspace_name: "Company Documentation".to_string(),
            workspace_slug: "company-docs".to_string(),
            default_locale: "en".to_string(),
            default_theme: "system".to_string(),
            create_starter_project: true,
            starter_project_name: Some("Internal Documentation".to_string()),
            starter_project_slug: Some("internal-docs".to_string()),
            skip_if_initialized: true,
            force: false,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BootstrapSummary {
    pub user_id: String,
    pub email: String,
    pub workspace_name: String,
    pub starter_project_id: Option<String>,
    pub starter_project_slug: Option<String>,
    pub already_initialized: bool,
}

pub async fn bootstrap_platform(
    pool: &PgPool,
    options: PlatformBootstrapOptions,
) -> Result<BootstrapSummary, AppError> {
    // 1. Check existing initialization
    let is_initialized = sqlx::query_scalar::<_, bool>(
        r#"SELECT is_initialized FROM "SystemSettings" WHERE id = 'default' LIMIT 1"#,
    )
    .fetch_optional(pool)
    .await
    .map_err(AppError::Database)?
    .unwrap_or(false);

    let user_count: i64 = sqlx::query_scalar::<_, i64>(r#"SELECT COUNT(*) FROM "User""#)
        .fetch_one(pool)
        .await
        .map_err(AppError::Database)?;

    if (is_initialized || user_count > 0) && !options.force {
        if options.skip_if_initialized {
            tracing::info!("System is already initialized. Skipping bootstrap as requested.");
            return Ok(BootstrapSummary {
                user_id: String::new(),
                email: options.admin_email,
                workspace_name: options.workspace_name,
                starter_project_id: None,
                starter_project_slug: None,
                already_initialized: true,
            });
        }
        return Err(AppError::Conflict(
            "System is already initialized with existing users or settings".to_string(),
        ));
    }

    // 2. Hash password with Argon2 via cms-auth
    let password_hash = cms_auth::password::hash_password(&options.admin_password)?;

    let mut tx = pool.begin().await.map_err(AppError::Database)?;
    let now = Utc::now();
    let generated_user_id = Uuid::new_v4().to_string();

    // 3. Create Admin User
    let user_id = sqlx::query_scalar::<_, String>(
        r#"
        INSERT INTO "User" (id, email, name, email_verified, role, created_at, updated_at)
        VALUES ($1, $2, $3, true, 'admin', $4, $5)
        ON CONFLICT (email) DO UPDATE SET role = 'admin', updated_at = EXCLUDED.updated_at
        RETURNING id
        "#,
    )
    .bind(&generated_user_id)
    .bind(&options.admin_email)
    .bind(&options.admin_name)
    .bind(now)
    .bind(now)
    .fetch_one(&mut *tx)
    .await
    .map_err(AppError::Database)?;

    // 4. Create Account credentials
    let account_id = Uuid::new_v4().to_string();
    sqlx::query(
        r#"
        INSERT INTO "Account" (id, user_id, provider, provider_account_id, password, created_at, updated_at)
        VALUES ($1, $2, 'credentials', $3, $4, $5, $6)
        ON CONFLICT (provider, provider_account_id) DO UPDATE
        SET password = EXCLUDED.password, updated_at = EXCLUDED.updated_at
        "#,
    )
    .bind(&account_id)
    .bind(&user_id)
    .bind(&options.admin_email)
    .bind(&password_hash)
    .bind(now)
    .bind(now)
    .execute(&mut *tx)
    .await
    .map_err(AppError::Database)?;

    // 5. Update WorkspaceSettings
    sqlx::query(
        r#"
        INSERT INTO "WorkspaceSettings" (id, name, slug, description, updated_at)
        VALUES ('default', $1, $2, 'Primary Company Workspace', $3)
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name, slug = EXCLUDED.slug, updated_at = EXCLUDED.updated_at
        "#,
    )
    .bind(&options.workspace_name)
    .bind(&options.workspace_slug)
    .bind(now)
    .execute(&mut *tx)
    .await
    .map_err(AppError::Database)?;

    // 6. Update SystemSettings
    sqlx::query(
        r#"
        INSERT INTO "SystemSettings" (
            id, is_initialized, initialized_at, initialized_by,
            allow_public_signup, require_email_verification,
            default_theme, default_locale, updated_at
        )
        VALUES ('default', true, $1, $2, false, false, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE
        SET is_initialized = true,
            initialized_at = EXCLUDED.initialized_at,
            initialized_by = EXCLUDED.initialized_by,
            default_theme = EXCLUDED.default_theme,
            default_locale = EXCLUDED.default_locale,
            updated_at = EXCLUDED.updated_at
        "#,
    )
    .bind(now)
    .bind(&user_id)
    .bind(&options.default_theme)
    .bind(&options.default_locale)
    .bind(now)
    .execute(&mut *tx)
    .await
    .map_err(AppError::Database)?;

    tx.commit().await.map_err(AppError::Database)?;

    // 7. Create Starter Documentation Project if requested
    let mut starter_project_id = None;
    let mut starter_project_slug = None;

    if options.create_starter_project {
        let p_name = options.starter_project_name.as_deref().unwrap_or("Internal Documentation");
        let p_slug = options.starter_project_slug.as_deref().unwrap_or("internal-docs");
        match create_starter_project(pool, &user_id, p_name, p_slug).await {
            Ok((proj_id, proj_slug)) => {
                starter_project_id = Some(proj_id);
                starter_project_slug = Some(proj_slug);
            }
            Err(err) => {
                tracing::warn!(error = %err, "Starter project creation skipped due to conflict or error");
            }
        }
    }

    tracing::info!(
        admin_email = %options.admin_email,
        workspace = %options.workspace_name,
        starter_project = ?starter_project_slug,
        "Platform successfully bootstrapped"
    );

    Ok(BootstrapSummary {
        user_id,
        email: options.admin_email,
        workspace_name: options.workspace_name,
        starter_project_id,
        starter_project_slug,
        already_initialized: false,
    })
}
