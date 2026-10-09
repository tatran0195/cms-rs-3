use std::sync::Arc;
use clap::Parser;
use cms_biz::BizContext;
use cms_mcp::McpSecurityContext;

#[derive(Parser, Debug)]
#[command(
    name = "cms-mcp",
    version,
    about = "CMS Model Context Protocol (MCP) server for AI desktop agents"
)]
struct CliArgs {
    /// PostgreSQL connection string
    #[arg(short = 'd', long = "database-url")]
    database_url: Option<String>,

    /// Log level (error, warn, info, debug, trace)
    #[arg(short = 'l', long = "log-level", default_value = "info")]
    log_level: String,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let args = CliArgs::parse();

    // Zero stdout pollution: strictly direct logs to stderr
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new(&args.log_level)),
        )
        .init();

    let database_url = args
        .database_url
        .or_else(|| std::env::var("DATABASE_URL").ok())
        .ok_or_else(|| {
            eprintln!("Error: Database URL must be provided via --database-url or DATABASE_URL environment variable");
            std::io::Error::new(std::io::ErrorKind::InvalidInput, "missing database URL")
        })?;

    tracing::info!("Connecting to PostgreSQL database...");
    let pool = cms_db::create_pool(&database_url).await?;

    let gatehouse = Arc::new(cms_authz::GatehouseState::new(pool.clone(), vec![]));
    let ctx = Arc::new(BizContext::new(pool, gatehouse));
    let security = McpSecurityContext::system();

    tracing::info!("Starting cms-mcp stdio transport...");
    cms_mcp::run_stdio(ctx, security).await?;

    Ok(())
}
