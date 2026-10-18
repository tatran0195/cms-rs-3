//! CMS Server - Composition Root
//!
//! This is the main entry point for the cms-server binary.
//! It composes all the crates together, starts the Axum HTTP server,
//! and provides database migration and platform seeding CLI subcommands.

use std::{net::SocketAddr, sync::Arc, time::Duration};

use axum::{http::StatusCode, Router};
use clap::{Parser, Subcommand};
use cms_api::api_router;
use cms_config::Config;
use cms_error::AppError;
use cms_middleware::{
    app_state::AppState,
    observability::{init_observability, metrics_handler},
};
use cms_sites::sites_router;
use cms_worker::app_state::WorkerState;
use tokio::net::TcpListener;
use tracing::info;

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

async fn shutdown_signal() {
    tokio::signal::ctrl_c()
        .await
        .expect("failed to install CTRL+C signal handler");
    tracing::info!("Received graceful shutdown signal. Starting shutdown...");
}

/// Build a CORS layer from the configured admin/app origin allow-list.
fn build_cors(config: &cms_config::Config) -> tower_http::cors::CorsLayer {
    use axum::http::{header, HeaderName, Method};
    use tower_http::cors::{AllowOrigin, CorsLayer};

    let allow_localhost = config.admin_origin.allow_localhost;
    let allowed = config.admin_origin.allowed_origins.clone();

    let allow_origin = AllowOrigin::predicate(move |origin: &axum::http::HeaderValue, _| {
        let Some(origin) = origin.to_str().ok() else {
            return false;
        };
        if allowed.iter().any(|a| a == origin) {
            return true;
        }
        if allow_localhost {
            let is_localhost = origin.starts_with("http://localhost:")
                || origin.starts_with("http://127.0.0.1:")
                || origin.starts_with("http://[::1]:");
            if is_localhost {
                return true;
            }
        }
        false
    });

    CorsLayer::new()
        .allow_origin(allow_origin)
        .allow_credentials(true)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
            Method::HEAD,
        ])
        .allow_headers([
            header::AUTHORIZATION,
            header::CONTENT_TYPE,
            header::ACCEPT,
            header::ORIGIN,
            header::COOKIE,
            header::SET_COOKIE,
            header::CONTENT_LENGTH,
            HeaderName::from_static("x-requested-with"),
            HeaderName::from_static("x-api-key"),
            HeaderName::from_static("x-locale"),
        ])
        .max_age(std::time::Duration::from_secs(86400))
}

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

async fn run_server(serve_args: ServeArgs) -> Result<(), AppError> {
    // Initialize observability (logging, tracing, metrics)
    init_observability();

    info!("Starting CMS Server...");

    // Load configuration
    let mut config = Config::load()?;
    if serve_args.no_migrate {
        config.database.auto_migrate = false;
    }
    info!("Configuration loaded");

    // Startup check: verify frontend assets directory
    let asset_root = cms_sites::spa::get_asset_root();
    if config.is_production() {
        cms_sites::validate_frontend_assets(&asset_root).map_err(|e| {
            AppError::Validation(format!("Frontend assets startup check failed: {e}"))
        })?;
        info!("Frontend assets verified at {}", asset_root.display());
    } else {
        match cms_sites::validate_frontend_assets(&asset_root) {
            Ok(canonical) => info!("Frontend assets verified at {}", canonical.display()),
            Err(err) => {
                tracing::warn!(
                    "Frontend assets check: {err}. In dev mode, SPA requests will return 500 \
                     until frontend is built."
                );
            }
        }
    }

    // Build application state
    let state = Arc::new(AppState::from_config(&config).await?);
    info!("Application state initialized");

    // Run real job processors over the same durable queue used by API handlers.
    let worker_state = Arc::new(WorkerState::from_app_state(&state).await?);
    let (worker_shutdown_tx, worker_shutdown_rx) = tokio::sync::watch::channel(false);
    let worker_handles = cms_worker::start_consumers_with_shutdown(
        state.job_queue.clone(),
        worker_state,
        worker_shutdown_rx,
    )
    .await?;

    // Build the full router with all middleware
    let api_router = api_router(state.clone());
    let sites_router = sites_router(state.clone());

    let cors = build_cors(&config);

    let app = Router::new()
        .route("/metrics", axum::routing::get(metrics_handler))
        .nest("/api", api_router)
        .merge(sites_router)
        .layer(axum::Extension(state.clone()))
        .layer(tower_http::trace::TraceLayer::new_for_http())
        .layer(tower_http::compression::CompressionLayer::new())
        .layer(cors)
        .layer(tower_http::catch_panic::CatchPanicLayer::new())
        .layer(tower_http::timeout::TimeoutLayer::with_status_code(
            StatusCode::REQUEST_TIMEOUT,
            Duration::from_secs(30),
        ));

    // Bind to socket
    let addr = SocketAddr::from(([0, 0, 0, 0], config.server.port));
    info!("Listening on {}", addr);

    let listener = TcpListener::bind(addr)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    info!("HTTP server drained; signaling background workers to terminate...");
    let _ = worker_shutdown_tx.send(true);
    for handle in worker_handles {
        let _ = handle.await;
    }
    info!("All background workers terminated cleanly.");
    Ok(())
}

#[tokio::main]
async fn main() -> Result<(), AppError> {
    let cli = Cli::parse();

    match cli.command {
        Some(Commands::Migrate(migrate_args)) => {
            init_observability();
            let config = Config::load()?;
            handle_migrate(&config, migrate_args).await
        }
        Some(Commands::Seed(seed_args)) => {
            init_observability();
            let config = Config::load()?;
            handle_seed(&config, seed_args).await
        }
        Some(Commands::Serve(serve_args)) => run_server(serve_args).await,
        None => run_server(cli.serve).await,
    }
}
