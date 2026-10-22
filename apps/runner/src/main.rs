use clap::Parser;
use cms_runner::{
    init_tracing, run_doctor_cmd, run_install, run_mcp, run_open, run_server, run_sync,
    run_uninstall, run_upgrade, Cli, Commands,
};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    match cli.command {
        None => {
            init_tracing(false, "info");
            run_server(cli.serve).await?;
        }
        Some(Commands::Serve(serve_args)) => {
            init_tracing(false, "info");
            run_server(serve_args).await?;
        }
        Some(Commands::Doctor(doctor_args)) => {
            init_tracing(false, "warn");
            let ok = run_doctor_cmd(doctor_args).await?;
            if !ok {
                std::process::exit(1);
            }
        }
        Some(Commands::Sync(sync_args)) => {
            init_tracing(false, "info");
            run_sync(sync_args).await?;
        }
        Some(Commands::Mcp(mcp_args)) => {
            init_tracing(true, &mcp_args.log_level);
            run_mcp(mcp_args).await?;
        }
        Some(Commands::Open(open_args)) => {
            run_open(open_args).await?;
        }
        Some(Commands::Install) => {
            run_install().await?;
        }
        Some(Commands::Uninstall) => {
            run_uninstall().await?;
        }
        Some(Commands::Upgrade(upgrade_args)) => {
            init_tracing(false, "info");
            run_upgrade(upgrade_args).await?;
        }
    }

    Ok(())
}
