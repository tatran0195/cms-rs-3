# Model Context Protocol (rmcp) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace legacy, non-compliant MCP REST endpoints with an enterprise-grade Model Context Protocol server powered by the official `rmcp` Rust SDK, supporting both remote Streamable HTTP (Axum) and local `stdio` CLI execution.

**Architecture:** A dedicated `crates/cms-mcp` library and binary that implements `rmcp::ServerHandler`, using `schemars` for JSON Schema generation, backed by `cms-biz` for data retrieval and PostgreSQL audit logging. Mounted into `cms-api` as a Tower/Axum service with API key authentication, and compiled as a standalone CLI for local desktop agent connections.

**Tech Stack:** Rust 2021, `rmcp` 3.5, `schemars` 1.0, `axum` 0.8, `tower`, `tokio`, `clap` 4.5, `tracing`, `sqlx`, Tantivy.

## Global Constraints

- **Strict Protocol Compliance:** Adhere to official JSON-RPC 2.0 and MCP specification (protocol version `2024-11-05` / latest).
- **Zero Stdout Pollution in Stdio Mode:** All logging and diagnostics in stdio mode must go to `stderr`. Never write to `stdout`.
- **Compile-Time Schemas:** Tool argument schemas must be derived via `schemars::JsonSchema`, never hand-coded JSON strings.
- **Security & Authorization:** Enforce project visibility and `MemberRole` checks via `cms-authz` for all operations.
- **Audit Logging:** Every tool call and resource read must log an audit record to `mcp_audit_events`.
- **KISS & YAGNI:** Minimum necessary abstractions; reuse existing `cms-biz::mcp::McpService` query methods.

---

### Task 1: Scaffolding `crates/cms-mcp` Dependencies & Cargo Configuration

**Files:**
- Modify: `crates/cms-mcp/Cargo.toml`
- Modify: `Cargo.toml` (root workspace if needed)

**Interfaces:**
- Consumes: Workspace dependencies (`axum`, `serde`, `tokio`, `tracing`, `cms-biz`, `cms-config`, `cms-db`, `cms-authz`, `cms-entity`, `cms-error`).
- Produces: `cms-mcp` crate with `rmcp` (features: `server`, `macros`, `transport-streamable-http-server`, `transport-stdio`), `schemars`, and `clap` configured.

- [ ] **Step 1: Update `crates/cms-mcp/Cargo.toml`**

Add required dependencies and declare the `[[bin]]` target:

```toml
[package]
name = "cms-mcp"
version = "0.1.0"
edition = "2021"

[[bin]]
name = "cms-mcp"
path = "src/main.rs"

[dependencies]
rmcp = { version = "3.5", features = [
    "server",
    "macros",
    "transport-streamable-http-server",
    "transport-stdio"
] }
schemars = "1.0"
axum = { workspace = true }
tower = { workspace = true }
tower-http = { workspace = true }
tokio = { workspace = true, features = ["full"] }
serde = { workspace = true }
serde_json = { workspace = true }
tracing = { workspace = true }
tracing-subscriber = { workspace = true, features = ["env-filter"] }
clap = { version = "4.5", features = ["derive", "env"] }

cms-biz = { path = "../cms-biz" }
cms-config = { path = "../cms-config" }
cms-db = { path = "../cms-db" }
cms-authz = { path = "../cms-authz" }
cms-entity = { path = "../cms-entity" }
cms-error = { path = "../cms-error" }

[dev-dependencies]
tempfile = "3"

[lints]
workspace = true
```

- [ ] **Step 2: Verify crate manifests compile**

Run: `cargo check -p cms-mcp`  
Expected: Clean resolution of dependencies and successful build check.

---

### Task 2: Parameter Schemas & Security Context

**Files:**
- Create: `crates/cms-mcp/src/types.rs`
- Modify: `crates/cms-mcp/src/lib.rs`

**Interfaces:**
- Consumes: `schemars`, `serde`.
- Produces: `SearchParams`, `GetPageParams`, `ListPagesParams`, `GetProjectParams`, `McpSecurityContext`.

- [ ] **Step 1: Write unit test for schema generation in `crates/cms-mcp/src/types.rs`**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use schemars::schema_for;

    #[test]
    fn test_search_params_schema() {
        let schema = schema_for!(SearchParams);
        let json = serde_json::to_string(&schema).unwrap();
        assert!(json.contains("query"));
        assert!(json.contains("project_id"));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p cms-mcp -- test_search_params_schema`  
Expected: FAIL (types not defined).

- [ ] **Step 3: Implement parameter structs and `McpSecurityContext` in `types.rs`**

```rust
use serde::Deserialize;

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct SearchParams {
    /// Keyword search query or question
    pub query: String,
    /// UUID of the documentation project to search
    pub project_id: String,
    /// Maximum results to return (default: 10, max: 50)
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct GetPageParams {
    /// UUID of the project
    pub project_id: String,
    /// Path to the page (e.g., "/getting-started/installation")
    pub path: String,
    /// Optional branch ID (defaults to project default branch)
    pub branch_id: Option<String>,
    /// Max character limit for content truncation (prevents context blowout)
    pub max_chars: Option<usize>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ListPagesParams {
    /// UUID of the project
    pub project_id: String,
    /// Optional branch ID
    pub branch_id: Option<String>,
    /// Pagination limit (default: 50, max: 200)
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct GetProjectParams {
    /// UUID of the project
    pub project_id: String,
}

#[derive(Debug, Clone)]
pub struct McpSecurityContext {
    pub user_id: Option<String>,
    pub org_id: Option<String>,
    pub scopes: Vec<String>,
    pub is_admin: bool,
}

impl McpSecurityContext {
    pub fn anonymous() -> Self {
        Self {
            user_id: None,
            org_id: None,
            scopes: vec![],
            is_admin: false,
        }
    }

    pub fn system() -> Self {
        Self {
            user_id: Some("system".to_string()),
            org_id: None,
            scopes: vec!["*".to_string()],
            is_admin: true,
        }
    }

    pub fn has_scope(&self, required: &str) -> bool {
        self.is_admin || self.scopes.iter().any(|s| s == required || s == "*")
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p cms-mcp -- test_search_params_schema`  
Expected: PASS.

---

### Task 3: Core MCP Handler (`rmcp::ServerHandler`) Implementation

**Files:**
- Create: `crates/cms-mcp/src/handler.rs`
- Modify: `crates/cms-mcp/src/lib.rs`

**Interfaces:**
- Consumes: `BizContext`, `McpService`, `McpSecurityContext`, `rmcp::ServerHandler`.
- Produces: `CmsMcpHandler` implementing tools, resources, and prompt templates.

- [ ] **Step 1: Write integration test for handler lifecycle**

Create test verifying `initialize`, `tools/list`, and `tools/call` for `search` and `get_page`:
File: `crates/cms-mcp/tests/handler_test.rs`

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p cms-mcp --test handler_test`  
Expected: FAIL (handler not implemented).

- [ ] **Step 3: Implement `CmsMcpHandler` in `crates/cms-mcp/src/handler.rs`**

- Implement `rmcp::ServerHandler`:
  - `get_info`: returns `ServerInfo` with `tools`, `resources`, `prompts` capabilities.
  - Tools handling:
    - `search`: parses `SearchParams`, checks scope `search:read`, calls `McpService::execute_tool`.
    - `get_page`: parses `GetPageParams`, checks scope `pages:read`, calls `McpService::execute_tool`, applies optional `max_chars` truncation.
    - `list_pages`: parses `ListPagesParams`, checks scope `pages:read`, calls `McpService::execute_tool`.
    - `get_project`: parses `GetProjectParams`, checks scope `projects:read`, calls `McpService::execute_tool`.
  - Resources handling:
    - `list_resources`: calls `McpService::list_resources`.
    - `read_resource`: calls `McpService::read_resource`.
    - `list_resource_templates`: provides `cms://projects/{project_id}/pages/{path}`.
  - Prompts handling:
    - `list_prompts`: returns `troubleshoot_topic` and `explain_architecture`.
    - `get_prompt`: formats instructions for AI model.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p cms-mcp --test handler_test`  
Expected: PASS.

---

### Task 4: Stdio CLI Binary Target

**Files:**
- Create: `crates/cms-mcp/src/main.rs`
- Modify: `crates/cms-mcp/src/lib.rs`

**Interfaces:**
- Consumes: `Config::load`, `BizContext`, `run_stdio`.
- Produces: Standalone `cms-mcp` binary running on stdio transport.

- [ ] **Step 1: Implement `run_stdio` in `crates/cms-mcp/src/lib.rs`**

```rust
pub async fn run_stdio(ctx: Arc<BizContext>, sec: McpSecurityContext) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let handler = CmsMcpHandler::new(ctx, sec);
    rmcp::transport::stdio::serve(handler).await?;
    Ok(())
}
```

- [ ] **Step 2: Implement `src/main.rs` with strict stderr logging**

```rust
use std::sync::Arc;
use clap::Parser;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Parser, Debug)]
#[command(name = "cms-mcp", about = "Model Context Protocol (MCP) server for CMS")]
struct Cli {
    #[arg(long, env = "CONFIG_PATH")]
    config: Option<std::path::PathBuf>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // CRITICAL: All logs must be written to stderr, never stdout.
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer().with_writer(std::io::stderr))
        .init();

    let config = match Cli::parse().config {
        Some(path) => cms_config::Config::from_file(&path)?,
        None => cms_config::Config::load()?,
    };

    let pool = cms_db::PgPool::connect(&config.database.url).await?;
    let authz = Arc::new(cms_authz::DbAuthz::new(pool.clone()));
    let ctx = Arc::new(cms_biz::BizContext::new(pool, authz));

    cms_mcp::run_stdio(ctx, cms_mcp::McpSecurityContext::system()).await?;
    Ok(())
}
```

- [ ] **Step 3: Test compilation of `cms-mcp` binary**

Run: `cargo build -p cms-mcp --bin cms-mcp`  
Expected: Successful build with binary generated at `target/debug/cms-mcp.exe`.

---

### Task 5: Axum HTTP Service Integration in `crates/cms-api`

**Files:**
- Modify: `crates/cms-api/Cargo.toml`
- Modify: `crates/cms-api/src/lib.rs`
- Modify: `crates/cms-api/src/mcp/mod.rs`
- Modify: `crates/cms-api/src/mcp/handlers.rs`

**Interfaces:**
- Consumes: `cms-mcp::create_mcp_http_router`.
- Produces: `/api/mcp` route serving Streamable HTTP / SSE with auth, and `/api/mcp/audit-events` for dashboard telemetry.

- [ ] **Step 1: Add `cms-mcp` dependency to `crates/cms-api/Cargo.toml`**

```toml
cms-mcp = { path = "../cms-mcp" }
```

- [ ] **Step 2: Update `crates/cms-api/src/mcp/mod.rs`**

Mount the `cms-mcp` router alongside the audit log handler:

```rust
use std::sync::Arc;
use axum::{routing::get, Router};
use cms_middleware::app_state::AppState;

pub fn router(state: Arc<AppState>) -> Router {
    let mcp_service = cms_mcp::create_mcp_http_router(state.biz_context.clone());

    Router::new()
        .route("/audit-events", get(handlers::list_mcp_audit_events_handler))
        .merge(mcp_service)
        .with_state(state)
}
```

- [ ] **Step 3: Deprecate/cleanup legacy REST handlers in `crates/cms-api/src/mcp/handlers.rs`**

Keep `list_mcp_audit_events_handler` and remove obsolete custom REST routes (`list_mcp_tools_handler`, `call_mcp_tool_handler`, `get_mcp_server_info_handler`, `list_mcp_resources_handler`, `read_mcp_resource_handler`) which are now fully handled by standard MCP.

- [ ] **Step 4: Verify workspace compilation and test suite**

Run: `cargo check -p cms-api`  
Expected: Clean compilation.

---

### Task 6: End-to-End Verification & Documentation

**Files:**
- Create: `crates/cms-mcp/tests/e2e_mcp_test.rs`
- Create: `docs/mcp-setup.md`

**Interfaces:**
- Consumes: Running test instance or in-memory transport.
- Produces: Passing E2E test suite and operator documentation for configuring Claude Desktop / Cursor.

- [ ] **Step 1: Write E2E test verifying MCP client handshake and tool call**

Test connects via in-memory or HTTP client, requests `initialize`, requests `tools/list`, and calls `search`.

- [ ] **Step 2: Run test suite**

Run: `cargo test -p cms-mcp`  
Expected: All tests PASS.

- [ ] **Step 3: Create `docs/mcp-setup.md` documentation**

Document:
1. Connecting Claude Desktop via `stdio` (`claude_desktop_config.json`).
2. Connecting remote agents via HTTP/SSE (`https://<domain>/api/mcp` with `X-API-Key`).
3. Available tools, schemas, and prompts.
