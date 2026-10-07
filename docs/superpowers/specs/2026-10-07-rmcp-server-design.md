# Architectural Design: Enterprise-Grade Model Context Protocol (MCP) Server with `rmcp`

**Status:** Proposed  
**Author:** Principal Systems Architect (AI Infrastructure & Protocols)  
**Date:** 2026-10-07  
**Target:** `crates/cms-mcp`, `crates/cms-api`, `crates/cms-biz`  

---

## 1. Executive Overview

This specification outlines the production redesign and implementation of the Model Context Protocol (MCP) server for the CMS documentation platform. The implementation replaces the existing non-compliant, ad-hoc REST endpoints with an enterprise-grade MCP server built on [`rmcp`](https://docs.rs/rmcp/latest/rmcp/) (the official Rust SDK for the Model Context Protocol).

The architecture delivers:
1. **Strict Protocol Compliance:** Full adherence to the official Model Context Protocol specification (JSON-RPC 2.0 framing, lifecycle handshakes, tool discovery, resource resolution, and prompt templates).
2. **Dual-Transport Flexibility:** 
   - **Streamable HTTP / SSE Transport:** Seamlessly mounted in `cms-api` at `/api/mcp` for remote web agents, browser extensions, and cloud IDEs.
   - **Stdio Transport:** High-performance CLI binary (`cms-mcp`) connecting directly to the local database via `BizContext`, enabling zero-network local desktop agent integration (e.g., Claude Desktop, Cursor, Zed, Antigravity).
3. **Defense-in-Depth Security & Multi-Tenant RBAC:** Strict enforcement of project visibility, membership roles (`MemberRole`), API key scopes (`mcp:connect`, `projects:read`, `pages:read`, `search:read`), and audit logging.
4. **Advanced Capabilities:** Prompt templates, resource templates, automatic JSON Schema derivation via `schemars`, and robust token budgeting/truncation controls.

---

## 2. Architecture & System Topology

```mermaid
flowchart TD
    subgraph Clients["MCP Clients"]
        RemoteClient["Remote Agent / Webhook / IDE<br/>(Cursor, Claude Web, Custom Agent)"]
        LocalClient["Local Desktop Agent<br/>(Claude Desktop, Cursor Local, Antigravity)"]
    end

    subgraph HTTPLayer["CMS API Layer (apps/api + cms-api)"]
        AxumRouter["Axum HTTP Router (/api/mcp)"]
        AuthMiddleware["Auth & Scope Middleware<br/>(Bearer / API-Key / Cookie)"]
        AuditRestEndpoint["GET /api/mcp/audit-events<br/>(Admin & Telemetry Dashboard)"]
    end

    subgraph McpCrate["crates/cms-mcp"]
        HttpService["StreamableHttpService (Tower / SSE)"]
        StdioRunner["Stdio Transport Runner<br/>(stderr-only logging)"]
        CmsMcpHandler["CmsMcpHandler : rmcp::ServerHandler"]
        
        subgraph Handlers["MCP Protocol Handlers"]
            Tools["Tools: search, get_page, list_pages, get_project"]
            Resources["Resources & Templates: cms://projects/..."]
            Prompts["Prompts: explain_doc, summarize_project, review_changes"]
        end
    end

    subgraph BizLayer["crates/cms-biz + crates/cms-db"]
        BizContext["BizContext (PgPool + Authz + Tantivy)"]
        McpService["McpService (Business Logic & Audit)"]
        Postgres[(PostgreSQL)]
        Tantivy[(Tantivy FTS Index)]
    end

    RemoteClient -->|Streamable HTTP / SSE| AxumRouter
    AxumRouter --> AuthMiddleware
    AuthMiddleware --> HttpService
    AxumRouter --> AuditRestEndpoint

    LocalClient -->|Stdio (JSON-RPC 2.0)| StdioRunner
    StdioRunner --> CmsMcpHandler
    HttpService --> CmsMcpHandler

    CmsMcpHandler --> Tools
    CmsMcpHandler --> Resources
    CmsMcpHandler --> Prompts

    Tools --> McpService
    Resources --> McpService
    Prompts --> McpService
    McpService --> BizContext
    BizContext --> Postgres
    BizContext --> Tantivy
```

---

## 3. Detailed Component Design

### 3.1 Crate Restructuring & Dependencies

The crate `crates/cms-mcp` is elevated from an orphaned 100-line stub to a first-class workspace component exporting both a reusable library and a standalone binary.

**`crates/cms-mcp/Cargo.toml`:**
```toml
[package]
name = "cms-mcp"
version = "0.1.0"
edition = "2021"

[[bin]]
name = "cms-mcp"
path = "src/main.rs"

[dependencies]
# Official MCP SDK
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

# Internal workspace dependencies
cms-biz = { path = "../cms-biz" }
cms-config = { path = "../cms-config" }
cms-db = { path = "../cms-db" }
cms-authz = { path = "../cms-authz" }
cms-entity = { path = "../cms-entity" }
cms-error = { path = "../cms-error" }

[dev-dependencies]
tempfile = "3"
```

### 3.2 Security Context & Request Lifecycle

A critical requirement is propagating identity and permissions safely into the MCP server handlers:

```rust
/// Contextual identity passed to MCP operations
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

- **In Remote HTTP Transport:** Axum authentication middleware extracts `user_id`, `org_id`, and validated API key scopes (e.g. `mcp:connect`, `search:read`, `pages:read`), injecting `McpSecurityContext` as an HTTP request extension (`Extension<McpSecurityContext>`).
- **In Local Stdio Transport:** The CLI binary initializes with direct system / local developer privileges or reads an optional local user override from configuration.

---

## 4. MCP Tools Specification

All tool parameter schemas are derived via `schemars::JsonSchema` to ensure compile-time accuracy and zero documentation drift.

### 4.1 Tool Definitions

```rust
/// Search project documentation using Tantivy full-text search
#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct SearchParams {
    #[schemars(description = "Keyword search query or question")]
    pub query: String,
    #[schemars(description = "UUID of the documentation project to search")]
    pub project_id: String,
    #[schemars(description = "Maximum results to return (default: 10, max: 50)")]
    pub limit: Option<i64>,
}

/// Retrieve the full markdown content of a documentation page
#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct GetPageParams {
    #[schemars(description = "UUID of the project")]
    pub project_id: String,
    #[schemars(description = "Path to the page (e.g., '/getting-started/installation')")]
    pub path: String,
    #[schemars(description = "Optional branch ID (defaults to project default branch)")]
    pub branch_id: Option<String>,
    #[schemars(description = "Max character limit for content truncation (prevents context blowout)")]
    pub max_chars: Option<usize>,
}

/// List all available documentation pages in a project hierarchy
#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ListPagesParams {
    #[schemars(description = "UUID of the project")]
    pub project_id: String,
    #[schemars(description = "Optional branch ID")]
    pub branch_id: Option<String>,
    #[schemars(description = "Pagination limit (default: 50, max: 200)")]
    pub limit: Option<i64>,
}

/// Retrieve project metadata and configuration
#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct GetProjectParams {
    #[schemars(description = "UUID of the project")]
    pub project_id: String,
}
```

### 4.2 Error Handling & Result Formatting

- Results are returned as markdown text blocks with MIME hints.
- Errors never dump raw SQL or internal panics to the client. Business domain errors map to user-friendly messages with appropriate `is_error: true` flags.
- Permission errors explicitly indicate whether the project is private or the credentials lack required access.

---

## 5. MCP Resources & Resource Templates

Standard MCP clients can inspect and pull documentation resources using URI schemes:

1. **Direct Resources:**
   - URI Scheme: `cms://projects/{project_id}/pages{path}`
   - Dynamic enumeration via `resources/list`: Returns all accessible pages across user projects.
   - Resource read via `resources/read`: Returns markdown content with `mimeType: text/markdown`.

2. **Resource Templates (`resources/templates/list`):**
   - Template: `cms://projects/{project_id}/pages/{path}`
   - Description: "Read documentation page by project ID and relative path"
   - MIME Type: `text/markdown`

---

## 6. MCP Prompt Templates

To elevate the MCP server from a passive tool repository to an active AI assistant, `cms-mcp` exposes standard prompt templates (`prompts/list`, `prompts/get`):

1. **`troubleshoot_topic`**:
   - Arguments: `project_id`, `topic`
   - Description: "Provides a structured prompt asking the AI to search project documentation, identify related configuration and known issues, and provide step-by-step resolution."
2. **`explain_architecture`**:
   - Arguments: `project_id`
   - Description: "Generates an architectural overview prompt utilizing project summary and page trees."

---

## 7. Transports & Execution Entrypoints

### 7.1 Remote HTTP Transport (`crates/cms-api`)

- **Route:** Mounted at `/api/mcp` and `/mcp` via Tower's `StreamableHttpService`.
- **CORS & Headers:** Supports standard SSE headers (`text/event-stream`, `keep-alive`) and JSON-RPC over HTTP POST.
- **Audit Endpoint:** The existing REST endpoint `GET /api/mcp/audit-events` is retained for the admin console and telemetry dashboards.
- **Auth Enforcement:**
  - Validates `Authorization: Bearer <token>` or `X-API-Key: <key>`.
  - Checks required scope `mcp:connect`.
  - Rejects unauthorized requests with HTTP `401 Unauthorized`.

### 7.2 Stdio CLI Transport (`crates/cms-mcp/src/main.rs`)

- **Binary Target:** `cms-mcp`
- **I/O Discipline:** **Zero stdout pollution.** All logging via `tracing_subscriber` is strictly configured with `.with_writer(std::io::stderr)`. Writing any diagnostic log to `stdout` corrupts JSON-RPC 2.0 framing and terminates client sessions.
- **Configuration:** Reads `config.toml` or environment variables (`DATABASE_URL`, `POSTGRES_PORT`).
- **Usage Example:**
  ```json
  {
    "mcpServers": {
      "company-cms": {
        "command": "d:\\Workspace\\Software\\_working\\cms-rs-3\\target\\release\\cms-mcp.exe",
        "env": {
          "CONFIG_PATH": "d:\\Workspace\\Software\\_working\\cms-rs-3\\config.toml"
        }
      }
    }
  }
  ```

---

## 8. Audit Logging & Observability

Every tool execution and resource read is tracked:
1. **Database Audit Table (`mcp_audit_events`):**
   - Automatically writes `operation`, `user_id`, `project_id`, `request_id`, `response_status`, and latency.
2. **Structured Tracing:**
   - Tracing spans `#[tracing::instrument]` on all tool executions with sanitized parameters.
3. **OpenTelemetry Metrics:**
   - Counters for `mcp_tool_calls_total{tool="search", status="ok|error"}`.
   - Histograms for `mcp_tool_duration_seconds{tool="..."}`.

---

## 9. Verification & Testing Plan

1. **Unit Tests:**
   - Parameter deserialization and JSON Schema generation correctness.
   - Truncation logic and error mapping.
2. **Protocol Integration Tests:**
   - Handshake test: Verify `initialize` returns correct protocol version and capabilities.
   - Tool list & call test: Verify `tools/list` and `tools/call` for `search` and `get_page` using an in-memory client against a test DB.
   - Resource read test: Verify `cms://projects/{id}/pages/{path}` resolution.
3. **HTTP Transport Tests:**
   - Verify unauthenticated requests return `401`.
   - Verify authenticated requests establish SSE stream or handle POST JSON-RPC.
4. **Stdio Safety Test:**
   - Verify stdout contains only valid JSON-RPC lines and zero log text.

---

## 10. Implementation Phases

- **Phase 1: Foundation in `crates/cms-mcp`**
  - Add `rmcp` (v3.5.x) and `schemars` dependencies.
  - Implement `CmsMcpHandler`, tool argument structs, and error mappings.
  - Implement stdio runner in `crates/cms-mcp/src/main.rs`.
- **Phase 2: Streamable HTTP Integration in `crates/cms-api`**
  - Expose `create_mcp_http_service` in `cms-mcp`.
  - Wire authentication middleware and mount into Axum router at `/api/mcp`.
  - Retain REST `/api/mcp/audit-events`.
- **Phase 3: Resources & Prompt Templates**
  - Implement `cms://` resource resolution and prompt templates.
- **Phase 4: Verification & Documentation**
  - Write unit and integration tests.
  - Provide desktop client configuration docs for Claude Desktop / Cursor.
