# Native Migration & Seed Operations Architecture

## 1. Executive Summary

This specification establishes a first-class, single-binary operational workflow for database migrations and platform bootstrapping in the CMS platform. By extracting seeding logic into a dedicated crate (`crates/cms-seed`), elevating SQLx migrator introspection in `crates/cms-db`, and adding Clap CLI subcommands to `apps/api` (`cms-server`), operators can manage database schema migrations and bootstrap production instances without installing external tools (`sqlx-cli`, Node.js, Bun, or Python) on target deployment servers.

---

## 2. Platform Constraints & Architecture Boundaries

1. **Internal Company Platform**: Strictly internal deployment without public billing, pricing tiers, or SaaS landing pages.
2. **Layering Discipline**: 
   - `crates/cms-db`: Hand-written SQL queries, connection pool management, and SQLx migrator lifecycle. No higher-level business or auth logic.
   - `crates/cms-seed`: Sits at the business layer (`cms-biz` / `cms-db`), orchestrating platform bootstrapping, Argon2 password hashing, settings setup, and starter project initialization.
   - `apps/api` (`cms-server`): Binary entrypoint providing both daemon execution (`serve`) and operator CLI commands (`migrate`, `seed`).
3. **Deployment Target**: Single AWS Windows Server 2022 instance managed via NSSM Windows Service, local PostgreSQL, and PowerShell deployment scripts (`deploy/deploy.ps1`).
4. **Backward Compatibility**: Calling `cms-server.exe` with no arguments must run `serve` with existing defaults so existing NSSM service configurations and scripts do not break.

---

## 3. Crate Architecture & Specifications

### 3.1. `crates/cms-db` Enhancements

Currently, `crates/cms-db/src/lib.rs` executes `sqlx::migrate!("../../migrations").run(pool)`. We expand this into a reusable migration management module:

```rust
pub struct MigrationStatusItem {
    pub version: i64,
    pub description: String,
    pub applied: bool,
    pub checksum: Option<Vec<u8>>,
}

/// Static accessor to embedded SQLx Migrator instance
pub fn migrator() -> &'static sqlx::migrate::Migrator;

/// Run all pending embedded migrations
pub async fn run_migrations(pool: &PgPool) -> Result<(), AppError>;

/// Revert migrations down to a specified version (or the previous migration if None)
pub async fn revert_migration(pool: &PgPool, target_version: Option<i64>) -> Result<(), AppError>;

/// Introspect migrations against `_sqlx_migrations` table
pub async fn get_migration_status(pool: &PgPool) -> Result<Vec<MigrationStatusItem>, AppError>;
```

### 3.2. New Crate: `crates/cms-seed`

`crates/cms-seed` coordinates the initial platform bootstrap.

#### Package Definition (`crates/cms-seed/Cargo.toml`)
- Dependencies:
  - `cms-db = { workspace = true }`
  - `cms-biz = { workspace = true }`
  - `cms-entity = { workspace = true }`
  - `cms-error = { workspace = true }`
  - `cms-auth = { workspace = true }`
  - `cms-config = { workspace = true }`
  - `sqlx = { workspace = true }`
  - `tokio = { workspace = true }`
  - `uuid = { workspace = true }`
  - `chrono = { workspace = true }`
  - `tracing = { workspace = true }`
  - `serde = { workspace = true }`
  - `serde_json = { workspace = true }`
  - `argon2 = { workspace = true }`

#### Module Structure
- `src/lib.rs`: Entry point and public types.
- `src/bootstrap.rs`: Platform initialization logic.
- `src/starter_docs.rs`: Starter documentation project generation.

#### Data Models & Options
```rust
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

#[derive(Debug, Serialize)]
pub struct BootstrapSummary {
    pub user_id: String,
    pub email: String,
    pub workspace_name: String,
    pub starter_project_id: Option<String>,
    pub starter_project_slug: Option<String>,
    pub already_initialized: bool,
}
```

#### Bootstrap Execution Flow
1. **Idempotency Check**: Query `SystemSettings` for `is_initialized`. If `true` and `!options.force`:
   - If `options.skip_if_initialized == true`, exit early with `already_initialized: true`.
   - If `options.skip_if_initialized == false`, return error `AppError::Conflict("System already initialized")`.
2. **Begin DB Transaction**:
   - Create Superadmin user in `User` with `role = 'admin'` and `email_verified = true`.
   - Hash `admin_password` with Argon2 and insert into `Account` (`provider = 'credentials'`).
   - Create initial session in `Session`.
   - Insert/Upsert `WorkspaceSettings` (id `'default'`, name, slug).
   - Update `SystemSettings` (`is_initialized = true`, `initialized_at = now()`, `initialized_by = user_id`).
3. **Starter Documentation Project (Optional)**:
   - Create initial project record with name (default: `"Internal Documentation"`) and slug (`"internal-docs"`).
   - Assign user as Project Member with role `'owner'`.
   - Create default branch (`"main"`).
   - Create default language (`"en"`).
   - Create initial `/welcome` document with formatted markdown guides.
4. **Commit Transaction**.

---

## 4. CLI Interface Specification (`apps/api`)

`apps/api/main.rs` is upgraded using `clap` (derive parser).

```rust
#[derive(Parser, Debug)]
#[command(name = "cms-server", about = "CMS Platform Server & Management CLI")]
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

    /// Manage database migrations
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
    /// Run all pending migrations
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

---

## 5. Deployment Script & Tooling Integration

### 5.1. `deploy/deploy.ps1`
Add optional switches to orchestrate migrations and seeding as part of service deployment:
```powershell
param (
    [string]$Environment = "production",
    [string]$ServiceName = "CMSServer",
    [switch]$RunMigrations,
    [switch]$SeedInit
)

# Before starting/restarting NSSM service:
if ($RunMigrations) {
    Write-Host "Running database migrations via cms-server..."
    & $TargetBinary migrate run
    if ($LASTEXITCODE -ne 0) { throw "Migration failed!" }
}

if ($SeedInit) {
    Write-Host "Running platform bootstrap check via cms-server..."
    & $TargetBinary seed init --skip-if-initialized
}
```

### 5.2. `Makefile` Updates
Replace `$(SQLX)` reliance with cargo subcommands:
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

---

## 6. Verification & Test Plan

1. **Compilation Check**:
   - `cargo check --workspace --all-targets`
   - `cargo clippy --workspace --all-targets --all-features -- -D warnings`
2. **Crate Tests**:
   - `crates/cms-db`: Test `get_migration_status` returns ordered records matching embedded migrations.
   - `crates/cms-seed`: Test `bootstrap_platform` creating superadmin, verified password hash, workspace settings, and idempotent second run.
3. **CLI End-to-End**:
   - `cargo run -p cms-server -- --help`
   - `cargo run -p cms-server -- migrate status`
   - `cargo run -p cms-server -- migrate run`
   - `cargo run -p cms-server -- seed init --skip-if-initialized`
   - Verify server boots cleanly with default command (`cargo run -p cms-server -- serve --no-migrate` and bare `cargo run -p cms-server`).
