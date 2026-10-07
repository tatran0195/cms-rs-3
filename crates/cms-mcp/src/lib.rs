//! CMS Model Context Protocol (MCP) Server.
//!
//! This crate provides the official Model Context Protocol (MCP) server implementation
//! powered by `rmcp`. It allows AI agents (e.g. Claude Desktop, Cursor, Antigravity) to query
//! and search CMS documentation programmatically via Streamable HTTP (Axum) or stdio transport.

pub mod handler;
pub mod types;

pub use handler::*;
pub use types::*;

use std::sync::Arc;
use cms_biz::BizContext;
use rmcp::service::ServiceExt;
use rmcp::transport::streamable_http_server::session::local::LocalSessionManager;
use rmcp::transport::streamable_http_server::tower::StreamableHttpService;
use rmcp::transport::streamable_http_server::StreamableHttpServerConfig;

/// Construct a Streamable HTTP Tower service for mounting into Axum routers.
pub fn create_mcp_http_service(
    ctx: Arc<BizContext>,
    security: McpSecurityContext,
) -> StreamableHttpService<CmsMcpHandler, LocalSessionManager> {
    let handler = CmsMcpHandler::new(ctx, security);
    StreamableHttpService::new(
        move || Ok(handler.clone()),
        Arc::new(LocalSessionManager::default()),
        StreamableHttpServerConfig::default().with_json_response(true),
    )
}

/// Run the MCP server over stdio transport.
pub async fn run_stdio(
    ctx: Arc<BizContext>,
    security: McpSecurityContext,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let handler = CmsMcpHandler::new(ctx, security);
    let running = handler.serve(rmcp::transport::stdio()).await?;
    running.waiting().await?;
    Ok(())
}

