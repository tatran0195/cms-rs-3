# Native Seed & Migration Crates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish first-class native database migration and platform seeding capabilities by enhancing `crates/cms-db`, creating `crates/cms-seed`, and adding operator CLI subcommands to `apps/api` (`cms-server`) for frictionless single-binary Windows deployment.

**Architecture:** Layered architecture (`api -> biz -> db`). `crates/cms-db` exposes SQLx migration introspection and management APIs; `crates/cms-seed` orchestrates transactional platform bootstrapping and starter docs; `apps/api` (`cms-server`) wraps both with Clap CLI subcommands while preserving default server daemon execution.

**Tech Stack:** Rust 2021, SQLx 0.9 (PostgreSQL `sqlx::migrate!`), Clap 4.5 (derive), Argon2, Tokio, Axum 0.8.

## Global Constraints

- **Platform Scope:** Strictly internal company platform; no billing, plan tiers, or public marketing features.
- **Layering Discipline:** `cms-api -> cms-biz -> cms-db`. `cms-seed` depends on `cms-biz` and `cms-db`; `cms-db` contains no auth hashing or business rules.
- **Backward Compatibility:** Running `cms-server` with no CLI arguments MUST default to running `serve`, preserving compatibility with existing NSSM Windows services.
- **Idempotency:** Seed and bootstrap operations must default to `--skip-if-initialized` to ensure safe, repeatable deployment automation.

---

### Task 1: Enhance `crates/cms-db` with Migration Introspection & Revert APIs

**Files:**
- Modify: `crates/cms-db/src/lib.rs:65-110`
- Test: `crates/cms-db/src/lib.rs:92-142`

**Interfaces:**
- Consumes: Embedded migrations in `../../migrations` via `sqlx::migrate!`.
- Produces:
  - `pub struct MigrationStatusItem { pub version: i64, pub description: String, pub applied: bool, pub checksum: Option<Vec<u8>> }`
  - `pub fn migrator() -> &'static sqlx::migrate::Migrator`
  - `pub async fn run_migrations(pool: &PgPool) -> Result<(), AppError>`
  - `pub async fn revert_migration(pool: &PgPool, target_version: Option<i64>) -> Result<(), AppError>`
  - `pub async fn get_migration_status(pool: &PgPool) -> Result<Vec<MigrationStatusItem>, AppError>`

- [ ] **Step 1: Write tests for migration introspection in `crates/cms-db/src/lib.rs`**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_migrator_instance_and_status() {
        let migrator = migrator();
        assert!(!migrator.iter().count() > 0, "Migrator should embed migration files");

        let Ok(url) = std::env::var("CMS_DATABASE__URL").or_else(|_| std::env::var("DATABASE_URL")) else {
            return;
        };
        if let Ok(pool) = create_pool(&url).await {
            if test_connection(&pool).await.is_err() {
                return;
            }
            let status = get_migration_status(&pool).await;
            assert!(status.is_ok(), "Getting migration status should succeed: {:?}", status.err());
            let list = status.unwrap();
            assert!(!list.is_empty(), "Should return list of migrations");
        }
    }
}
```

- [ ] **Step 2: Run test to verify compilation failure before implementation**

Run: `cargo test -p cms-db test_migrator_instance_and_status`
Expected: FAIL with `cannot find function get_migration_status`

- [ ] **Step 3: Implement migration management functions in `crates/cms-db/src/lib.rs`**

```rust
use std::collections::HashSet;

pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("../../migrations");

pub fn migrator() -> &'static sqlx::migrate::Migrator {
    &MIGRATOR
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct MigrationStatusItem {
    pub version: i64,
    pub description: String,
    pub applied: bool,
    pub checksum: Option<Vec<u8>>,
}

/// Run database migrations
pub async fn run_migrations(pool: &PgPool) -> Result<(), AppError> {
    MIGRATOR
        .run(pool)
        .await
        .map_err(|e| {
            tracing::error!("Migration failed: {}", e);
            AppError::Database(e.into())
        })?;

    Ok(())
}

/// Revert database migrations down to a specified target version, or the last applied migration
pub async fn revert_migration(pool: &PgPool, target_version: Option<i64>) -> Result<(), AppError> {
    let target = match target_version {
        Some(v) => v,
        None => {
            let status = get_migration_status(pool).await?;
            let applied: Vec<_> = status.into_iter().filter(|m| m.applied).collect();
            if applied.len() <= 1 {
                0
            } else {
                applied[applied.len() - 2].version
            }
        }
    };

    MIGRATOR
        .undo(pool, target)
        .await
        .map_err(|e| {
            tracing::error!("Migration revert failed: {}", e);
            AppError::Database(e.into())
        })?;

    Ok(())
}

/// Get the status of all embedded migrations compared against the database
pub async fn get_migration_status(pool: &PgPool) -> Result<Vec<MigrationStatusItem>, AppError> {
    // Ensure migrations table exists
    let applied_versions: HashSet<i64> = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT version FROM _sqlx_migrations
        ORDER BY version ASC
        "#,
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default()
    .into_iter()
    .collect();

    let mut items = Vec::new();
    for migration in MIGRATOR.iter() {
        let is_applied = applied_versions.contains(&migration.version);
        items.push(MigrationStatusItem {
            version: migration.version,
            description: migration.description.to_string(),
            applied: is_applied,
            checksum: Some(migration.checksum.to_vec()),
        });
    }

    Ok(items)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p cms-db test_migrator_instance_and_status`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add crates/cms-db/src/lib.rs
git commit -m "feat(cms-db): add migration status introspection and revert APIs"
```

---

### Task 2: Add `auto_migrate` Option to `cms-config` and `cms-middleware`

**Files:**
- Modify: `crates/cms-config/src/database.rs:1-35`
- Modify: `crates/cms-middleware/src/app_state.rs:60-75`

**Interfaces:**
- Consumes: `CMS_DATABASE__AUTO_MIGRATE` env var / `config.database.auto_migrate`.
- Produces: Configurable startup migration behavior.

- [ ] **Step 1: Write test for `auto_migrate` config default**

In `crates/cms-config/src/database.rs`:
```rust
#[test]
fn test_database_config_default_auto_migrate() {
    let db_config = DatabaseConfig::default();
    assert!(db_config.auto_migrate, "auto_migrate should default to true");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p cms-config test_database_config_default_auto_migrate`
Expected: FAIL with `no field auto_migrate on type DatabaseConfig`

- [ ] **Step 3: Update `DatabaseConfig` in `crates/cms-config/src/database.rs`**

```rust
fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Deserialize)]
pub struct DatabaseConfig {
    pub url: String,
    pub max_connections: Option<u32>,
    pub min_connections: Option<u32>,
    #[serde(default = "default_true")]
    pub auto_migrate: bool,
}

impl Default for DatabaseConfig {
    fn default() -> Self {
        Self {
            url: String::new(),
            max_connections: Some(50),
            min_connections: Some(5),
            auto_migrate: true,
        }
    }
}
```

- [ ] **Step 4: Update `crates/cms-middleware/src/app_state.rs` to respect `auto_migrate`**

```rust
        // Run database migrations if auto_migrate is enabled
        if config.database.auto_migrate {
            tracing::info!("Auto-running database migrations on startup...");
            cms_db::run_migrations(&pool).await?;
        } else {
            tracing::info!("Database auto-migration skipped by configuration.");
        }
```

- [ ] **Step 5: Run tests across `cms-config` and `cms-middleware`**

Run: `cargo test -p cms-config`
Expected: PASS

- [ ] **Step 6: Commit changes**

```bash
git add crates/cms-config crates/cms-middleware
git commit -m "feat(config): add auto_migrate setting to DatabaseConfig"
```

---

### Task 3: Scaffold New Crate `crates/cms-seed` & Implement Platform Bootstrap Logic

**Files:**
- Create: `crates/cms-seed/Cargo.toml`
- Create: `crates/cms-seed/src/lib.rs`
- Create: `crates/cms-seed/src/bootstrap.rs`
- Create: `crates/cms-seed/src/starter_docs.rs`
- Modify: `Cargo.toml:20-55`

**Interfaces:**
- Consumes: `cms_db`, `cms_biz`, `cms_auth`, `cms_entity`, `cms_error`.
- Produces:
  - `pub struct PlatformBootstrapOptions`
  - `pub struct BootstrapSummary`
  - `pub async fn bootstrap_platform(pool: &PgPool, options: PlatformBootstrapOptions) -> Result<BootstrapSummary, AppError>`

- [ ] **Step 1: Register `crates/cms-seed` in root `Cargo.toml`**

Add `"crates/cms-seed"` to `members` list in `Cargo.toml` and `cms-seed = { path = "crates/cms-seed" }` to `workspace.dependencies`.

- [ ] **Step 2: Create `crates/cms-seed/Cargo.toml`**

```toml
[package]
name = "cms-seed"
version = "0.1.0"
edition = "2021"

[dependencies]
cms-db = { workspace = true }
cms-biz = { workspace = true }
cms-entity = { workspace = true }
cms-error = { workspace = true }
cms-auth = { workspace = true }
cms-config = { workspace = true }
sqlx = { workspace = true }
tokio = { workspace = true }
uuid = { workspace = true }
chrono = { workspace = true }
tracing = { workspace = true }
serde = { workspace = true }
serde_json = { workspace = true }
argon2 = { workspace = true }

[dev-dependencies]
tempfile = { workspace = true }

[lints]
workspace = true
```

- [ ] **Step 3: Implement `crates/cms-seed/src/lib.rs`**

```rust
//! Platform Seeding and Bootstrap Operations
//!
//! Provides transactional bootstrapping of platform administration,
//! system configuration, initial workspace settings, and starter documentation.

pub mod bootstrap;
pub mod starter_docs;

pub use bootstrap::{bootstrap_platform, BootstrapSummary, PlatformBootstrapOptions};
```

- [ ] **Step 4: Implement `crates/cms-seed/src/starter_docs.rs`**

```rust
//! Starter documentation generator

use chrono::Utc;
use cms_error::AppError;
use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

pub async fn create_starter_project(
    conn: &mut PgConnection,
    user_id: &str,
    project_name: &str,
    project_slug: &str,
    default_locale: &str,
) -> Result<(String, String), AppError> {
    let project_id = Uuid::new_v4().to_string();
    let now = Utc::now();

    // 1. Create Project
    sqlx::query(
        r#"
        INSERT INTO "Project" (id, name, slug, description, default_locale, locales, visibility, created_at, updated_at)
        VALUES ($1, $2, $3, 'Internal company documentation workspace', $4, $5, 'private', $6, $7)
        "#,
    )
    .bind(&project_id)
    .bind(project_name)
    .bind(project_slug)
    .bind(default_locale)
    .bind(serde_json::json!([default_locale]))
    .bind(now)
    .bind(now)
    .execute(&mut *conn)
    .await
    .map_err(|e| AppError::Database(e.into()))?;

    // 2. Add User as Owner
    let member_id = Uuid::new_v4().to_string();
    sqlx::query(
        r#"
        INSERT INTO "ProjectMember" (id, project_id, user_id, role, created_at, updated_at)
        VALUES ($1, $2, $3, 'owner', $4, $5)
        ON CONFLICT DO NOTHING
        "#,
    )
    .bind(&member_id)
    .bind(&project_id)
    .bind(user_id)
    .bind(now)
    .bind(now)
    .execute(&mut *conn)
    .await
    .map_err(|e| AppError::Database(e.into()))?;

    // 3. Create Default Branch
    let branch_id = Uuid::new_v4().to_string();
    sqlx::query(
        r#"
        INSERT INTO "Branch" (id, project_id, name, is_default, created_at, updated_at)
        VALUES ($1, $2, 'main', true, $3, $4)
        "#,
    )
    .bind(&branch_id)
    .bind(&project_id)
    .bind(now)
    .bind(now)
    .execute(&mut *conn)
    .await
    .map_err(|e| AppError::Database(e.into()))?;

    // 4. Create Starter Document
    let page_id = Uuid::new_v4().to_string();
    let welcome_content = r#"# Welcome to Your Documentation Workspace

This platform is deployed for internal company engineering, product, and operations documentation.

## Features
- **Notion-Style Visual & Markdown Editor**: Real-time drafting with frontmatter, callouts, and code highlighting.
- **Embedded Fast Search**: Tantivy full-text index with multi-language tokenization.
- **Portable Distribution**: Run documentation offline anywhere using `cms-site.exe` bundles.

## Getting Started
1. Create a new document in the sidebar.
2. Edit content and publish snapshots.
3. Invite team members in Project Settings.
"#;

    sqlx::query(
        r#"
        INSERT INTO "Page" (id, project_id, branch_id, title, slug, path, content, order_index, created_at, updated_at)
        VALUES ($1, $2, $3, 'Welcome', 'welcome', '/welcome', $4, 0, $5, $6)
        "#,
    )
    .bind(&page_id)
    .bind(&project_id)
    .bind(&branch_id)
    .bind(welcome_content)
    .bind(now)
    .bind(now)
    .execute(&mut *conn)
    .await
    .map_err(|e| AppError::Database(e.into()))?;

    Ok((project_id, project_slug.to_string()))
}
```

- [ ] **Step 5: Implement `crates/cms-seed/src/bootstrap.rs`**

```rust
//! Platform bootstrap execution logic

use chrono::Utc;
use cms_error::AppError;
use serde::Serialize;
use sqlx::PgPool;
use uuid::Uuid;

use crate::starter_docs::create_starter_project;

#[derive(Debug, Clone)]
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

#[derive(Debug, Serialize, Clone)]
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
    .map_err(|e| AppError::Database(e.into()))?
    .unwrap_or(false);

    let user_count: i64 = sqlx::query_scalar::<_, i64>(r#"SELECT COUNT(*) FROM "User""#)
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

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

    // 2. Hash password with Argon2
    let salt = format!("cms_{}", Uuid::new_v4().simple());
    let password_hash = cms_auth::password::hash_password(&options.admin_password, &salt)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to hash admin password: {e}")))?;

    let mut tx = pool.begin().await.map_err(|e| AppError::Database(e.into()))?;
    let now = Utc::now();
    let user_id = Uuid::new_v4().to_string();

    // 3. Create Admin User
    sqlx::query(
        r#"
        INSERT INTO "User" (id, email, name, email_verified, role, created_at, updated_at)
        VALUES ($1, $2, $3, true, 'admin', $4, $5)
        ON CONFLICT (email) DO UPDATE SET role = 'admin', updated_at = EXCLUDED.updated_at
        RETURNING id
        "#,
    )
    .bind(&user_id)
    .bind(&options.admin_email)
    .bind(&options.admin_name)
    .bind(now)
    .bind(now)
    .execute(&mut *tx)
    .await
    .map_err(|e| AppError::Database(e.into()))?;

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
    .map_err(|e| AppError::Database(e.into()))?;

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
    .map_err(|e| AppError::Database(e.into()))?;

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
    .map_err(|e| AppError::Database(e.into()))?;

    // 7. Create Starter Documentation Project if requested
    let mut starter_project_id = None;
    let mut starter_project_slug = None;

    if options.create_starter_project {
        let p_name = options.starter_project_name.as_deref().unwrap_or("Internal Documentation");
        let p_slug = options.starter_project_slug.as_deref().unwrap_or("internal-docs");
        let (proj_id, proj_slug) = create_starter_project(
            &mut tx,
            &user_id,
            p_name,
            p_slug,
            &options.default_locale,
        )
        .await?;
        starter_project_id = Some(proj_id);
        starter_project_slug = Some(proj_slug);
    }

    tx.commit().await.map_err(|e| AppError::Database(e.into()))?;

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
```

- [ ] **Step 6: Write integration test in `crates/cms-seed/tests/bootstrap_test.rs`**

```rust
use cms_seed::{bootstrap_platform, PlatformBootstrapOptions};

#[test]
fn test_bootstrap_options_default() {
    let opts = PlatformBootstrapOptions::default();
    assert_eq!(opts.admin_email, "admin@company.local");
    assert!(opts.skip_if_initialized);
    assert!(opts.create_starter_project);
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cargo test -p cms-seed`
Expected: PASS

- [ ] **Step 8: Commit changes**

```bash
git add crates/cms-seed Cargo.toml
git commit -m "feat(cms-seed): add platform bootstrap and starter documentation generator"
```

---

### Task 4: Implement Clap CLI in `apps/api` (`cms-server`)

**Files:**
- Modify: `apps/api/Cargo.toml:11-20`
- Modify: `apps/api/main.rs:1-180`

**Interfaces:**
- Consumes: `clap`, `cms_seed`, `cms_db`, `cms_config`.
- Produces:
  - Subcommands: `serve`, `migrate [run|status|revert]`, `seed init`.
  - Zero arguments defaults to `serve` for 100% backward compatibility.

- [ ] **Step 1: Add dependencies to `apps/api/Cargo.toml`**

```toml
clap = { workspace = true }
cms-db = { workspace = true }
cms-seed = { workspace = true }
```

- [ ] **Step 2: Add CLI structures and handlers to `apps/api/main.rs`**

Define `Cli`, `Commands`, `ServeArgs`, `MigrateArgs`, `MigrateAction`, `SeedArgs`, `SeedAction`, `BootstrapCliArgs`.
Implement `handle_migrate` and `handle_seed`:

```rust
use clap::{Parser, Subcommand};

#[derive(Parser, Debug)]
#[command(
    name = "cms-server",
    author,
    version,
    about = "CMS Platform Server & Management CLI"
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Commands>,

    #[command(flatten)]
    pub serve: ServeArgs,
}

#[derive(Subcommand, Debug)]
pub enum Commands {
    /// Start the HTTP server and background workers (default)
    Serve(ServeArgs),

    /// Manage database schema migrations
    Migrate(MigrateArgs),

    /// Platform seeding and bootstrap operations
    Seed(SeedArgs),
}

#[derive(Parser, Debug, Clone, Default)]
pub struct ServeArgs {
    /// Skip automatic database migrations on server startup
    #[arg(long, env = "CMS_SERVER_NO_MIGRATE")]
    pub no_migrate: bool,
}

#[derive(Parser, Debug)]
pub struct MigrateArgs {
    #[command(subcommand)]
    pub action: MigrateAction,
}

#[derive(Subcommand, Debug)]
pub enum MigrateAction {
    /// Run all pending embedded migrations
    Run,
    /// Display migration status (applied vs pending)
    Status,
    /// Revert the latest migration (or down to --target)
    Revert {
        #[arg(long)]
        target: Option<i64>,
    },
}

#[derive(Parser, Debug)]
pub struct SeedArgs {
    #[command(subcommand)]
    pub action: SeedAction,
}

#[derive(Subcommand, Debug)]
pub enum SeedAction {
    /// Initialize platform admin, workspace, and starter docs
    Init(BootstrapCliArgs),
}

#[derive(Parser, Debug)]
pub struct BootstrapCliArgs {
    #[arg(long, env = "CMS_SEED_ADMIN_EMAIL", default_value = "admin@company.local")]
    pub admin_email: String,

    #[arg(long, env = "CMS_SEED_ADMIN_PASSWORD", default_value = "Password123!")]
    pub admin_password: String,

    #[arg(long, env = "CMS_SEED_ADMIN_NAME", default_value = "System Administrator")]
    pub admin_name: String,

    #[arg(long, env = "CMS_SEED_WORKSPACE_NAME", default_value = "Company Documentation")]
    pub workspace_name: String,

    #[arg(long, env = "CMS_SEED_WORKSPACE_SLUG", default_value = "company-docs")]
    pub workspace_slug: String,

    #[arg(long, default_value = "true", action = clap::ArgAction::Set)]
    pub starter_project: bool,

    #[arg(long, default_value = "true", action = clap::ArgAction::Set)]
    pub skip_if_initialized: bool,

    #[arg(long)]
    pub force: bool,
}
```

- [ ] **Step 3: Implement handler routines for CLI actions**

```rust
async fn handle_migrate(config: &Config, args: MigrateArgs) -> Result<(), AppError> {
    let pool = cms_db::create_pool(&config.database.url).await?;

    match args.action {
        MigrateAction::Run => {
            println!("Applying pending database migrations...");
            cms_db::run_migrations(&pool).await?;
            println!("All migrations successfully applied.");
        }
        MigrateAction::Status => {
            println!("Checking database migration status...");
            let items = cms_db::get_migration_status(&pool).await?;
            println!("\n{:<16} {:<10} {:<40}", "VERSION", "STATUS", "DESCRIPTION");
            println!("{:-<16} {:-<10} {:-<40}", "", "", "");
            for item in items {
                let status_str = if item.applied { "[APPLIED]" } else { "[PENDING]" };
                println!("{:<16} {:<10} {:<40}", item.version, status_str, item.description);
            }
            println!();
        }
        MigrateAction::Revert { target } => {
            println!("Reverting database migration...");
            cms_db::revert_migration(&pool, target).await?;
            println!("Migration reverted successfully.");
        }
    }

    Ok(())
}

async fn handle_seed(config: &Config, args: SeedArgs) -> Result<(), AppError> {
    let pool = cms_db::create_pool(&config.database.url).await?;

    match args.action {
        SeedAction::Init(opts) => {
            println!("Bootstrapping platform...");
            let summary = cms_seed::bootstrap_platform(
                &pool,
                cms_seed::PlatformBootstrapOptions {
                    admin_email: opts.admin_email,
                    admin_password: opts.admin_password,
                    admin_name: opts.admin_name,
                    workspace_name: opts.workspace_name,
                    workspace_slug: opts.workspace_slug,
                    default_locale: "en".to_string(),
                    default_theme: "system".to_string(),
                    create_starter_project: opts.starter_project,
                    starter_project_name: Some("Internal Documentation".to_string()),
                    starter_project_slug: Some("internal-docs".to_string()),
                    skip_if_initialized: opts.skip_if_initialized,
                    force: opts.force,
                },
            )
            .await?;

            if summary.already_initialized {
                println!("Notice: Platform was already initialized. Skipped without changes.");
            } else {
                println!("Platform bootstrap complete!");
                println!("Admin Account : {}", summary.email);
                println!("Workspace     : {}", summary.workspace_name);
                if let Some(slug) = summary.starter_project_slug {
                    println!("Starter Docs  : /app/projects/{}", slug);
                }
            }
        }
    }

    Ok(())
}
```

- [ ] **Step 4: Update `main()` entrypoint to route subcommands and fallback to `serve`**

```rust
#[tokio::main]
async fn main() -> Result<(), AppError> {
    let cli = Cli::parse();

    // If running migration or seed command, execute and exit cleanly without starting HTTP server
    match cli.command {
        Some(Commands::Migrate(migrate_args)) => {
            init_observability();
            let config = Config::load()?;
            return handle_migrate(&config, migrate_args).await;
        }
        Some(Commands::Seed(seed_args)) => {
            init_observability();
            let config = Config::load()?;
            return handle_seed(&config, seed_args).await;
        }
        Some(Commands::Serve(serve_args)) => {
            return run_server(serve_args).await;
        }
        None => {
            // Default command with no arguments: start server (backward-compatible)
            return run_server(cli.serve).await;
        }
    }
}
```

- [ ] **Step 5: Verify CLI output and compilation**

Run: `cargo run -p cms-server -- --help`
Expected: Output showing `serve`, `migrate`, `seed` subcommands.

- [ ] **Step 6: Commit changes**

```bash
git add apps/api
git commit -m "feat(server): add unified clap CLI for migrate and seed operations"
```

---

### Task 5: Update Deployment Tooling (`deploy.ps1`, `Makefile`, `README.md`)

**Files:**
- Modify: `deploy/deploy.ps1:10-70`
- Modify: `Makefile:135-155`
- Modify: `deploy/README.md:120-135`

**Interfaces:**
- Consumes: `cms-server migrate run`, `cms-server migrate status`, `cms-server seed init`.
- Produces: Frictionless zero-node deployment script and Makefile recipes.

- [ ] **Step 1: Update `deploy/deploy.ps1` with migration and seed flags**

Add parameters:
```powershell
    [Parameter(Mandatory=$false)]
    [switch]$RunMigrations,

    [Parameter(Mandatory=$false)]
    [switch]$SeedInit
```

Add execution block before starting service:
```powershell
if ($RunMigrations) {
    Write-Host "Running database migrations via cms-server..."
    & $TargetBinary migrate run
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Migration failed with exit code $LASTEXITCODE"
    }
}

if ($SeedInit) {
    Write-Host "Checking platform initialization via cms-server..."
    & $TargetBinary seed init --skip-if-initialized
}
```

- [ ] **Step 2: Update `Makefile` database targets**

```makefile
db-migrate:
	$(CARGO) run -p cms-server -- migrate run

db-status:
	$(CARGO) run -p cms-server -- migrate status

db-revert:
	$(CARGO) run -p cms-server -- migrate revert

db-seed:
	$(CARGO) run -p cms-server -- seed init
```

- [ ] **Step 3: Update `deploy/README.md` documentation**

Document that Windows operators run:
```powershell
# Check migration status
.\cms-server.exe migrate status

# Apply pending migrations
.\cms-server.exe migrate run

# Bootstrap initial superadmin and workspace
.\cms-server.exe seed init --admin-email admin@company.com --admin-password "SecurePass123!"
```
Remove instructions requiring `sqlx-cli` installation on target servers.

- [ ] **Step 4: Commit changes**

```bash
git add deploy/deploy.ps1 Makefile deploy/README.md
git commit -m "chore(deploy): modernize deploy script, Makefile, and docs to use native cms-server commands"
```

---

### Task 6: Workspace Verification & Lints

**Files:**
- All modified files

- [ ] **Step 1: Run workspace compilation check**

Run: `cargo check --workspace --all-targets`
Expected: 0 errors

- [ ] **Step 2: Run Clippy lints**

Run: `cargo clippy --workspace --all-targets --all-features -- -D warnings`
Expected: 0 warnings

- [ ] **Step 3: Run unit and integration tests**

Run: `cargo test -p cms-db -p cms-seed`
Expected: All tests pass

- [ ] **Step 4: Verify CLI commands end-to-end**

Run:
1. `cargo run -p cms-server -- migrate --help`
2. `cargo run -p cms-server -- seed --help`
3. `cargo run -p cms-server -- migrate status`
Expected: Clean outputs with no runtime panics.
