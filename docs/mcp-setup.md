# CMS Model Context Protocol (MCP) Server Setup & Integration Guide

This guide documents the enterprise-grade Model Context Protocol (MCP) server implementation for the internal CMS platform built using the official [`rmcp`](https://docs.rs/rmcp/latest/rmcp/) Rust SDK (v3.5.1).

---

## Architecture Overview

The CMS MCP server exposes project documentation, hierarchical pages, Tantivy search indexing, and troubleshooting prompt workflows to AI agents. It provides dual-transport access:

1. **Local Desktop Stdio Transport (`cms-mcp` CLI binary)**:
   - Direct PostgreSQL connection via `cms_db` pool.
   - Ideal for desktop AI agents: Claude Desktop, Cursor, and Antigravity.
   - **Zero stdout pollution**: stdout is reserved strictly for JSON-RPC 2.0 frames; all diagnostic logs and traces are directed to `stderr`.

2. **Remote Streamable HTTP Transport (`cms-api`)**:
   - Mounted at `/api/mcp` via Tower/Axum service (`create_mcp_http_service`).
   - Supports both SSE streams (`text/event-stream`) and standard JSON responses.
   - Enforces multi-tenant RBAC via `McpSecurityContext` with granular API key scopes.
   - Retains operational audit logs via `GET /api/mcp/audit-events`.

---

## 1. Local Desktop Integration (Claude Desktop, Cursor, Antigravity)

### Building the CLI Binary
```bash
cargo build --release -p cms-mcp --bin cms-mcp
```
The binary will be compiled to `target/release/cms-mcp.exe` (Windows) or `target/release/cms-mcp` (Linux/macOS).

### Claude Desktop Configuration
Add the server to your `claude_desktop_config.json`:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "cms-docs": {
      "command": "d:\\Workspace\\Software\\_working\\cms-rs-3\\target\\release\\cms-mcp.exe",
      "args": [
        "--database-url",
        "postgres://postgres:postgres@localhost:5432/cms_db",
        "--log-level",
        "info"
      ],
      "env": {
        "RUST_LOG": "info"
      }
    }
  }
}
```

### Cursor & Antigravity MCP Setup
In Cursor or Antigravity Settings -> MCP:
- **Name**: `cms-docs`
- **Type**: `command`
- **Command**: `cargo run --release -p cms-mcp --bin cms-mcp -- --database-url postgres://postgres:postgres@localhost:5432/cms_db`

---

## 2. Remote Streamable HTTP Integration

Remote agents connect to the Streamable HTTP endpoint mounted inside `cms-api`.

### Endpoint & Authentication
- **Endpoint**: `https://<cms-domain>/api/mcp`
- **Headers**:
  - `Content-Type: application/json`
  - `Accept: application/json, text/event-stream`
  - `X-API-Key: <CMS_API_KEY>` (or `Authorization: Bearer <JWT>`)

### Required API Key Scopes
The security context verifies API key scopes:
- `mcp:connect`: Grants connection to the MCP server.
- `search:read`: Required for `search_docs` tool.
- `pages:read`: Required for `get_page` and `list_pages` tools, and `read_resource`.
- `projects:read`: Required for `get_project` tool.

---

## 3. Available Tools & Compile-time Schemas

All tool schemas are generated dynamically from Rust structs implementing `schemars::JsonSchema`.

### `search_docs`
Searches documentation pages across projects using Tantivy full-text index.
- **Scope required**: `search:read`
- **Input parameters**:
  - `query` (string, required): Full-text search query.
  - `project_id` (string, optional): Target project ID.
  - `limit` (integer, optional, default: 10, max: 50): Number of matches to return.

### `get_page`
Fetches Markdown content and metadata for a specific documentation page.
- **Scope required**: `pages:read`
- **Input parameters**:
  - `project_id` (string, required): Target project ID.
  - `path` (string, required): Document path (e.g., `/architecture/overview`).
  - `branch_id` (string, optional): Target branch ID (defaults to default branch).
  - `max_chars` (integer, optional): Maximum characters of Markdown content to return.

### `list_pages`
Lists available documentation pages within a project hierarchy.
- **Scope required**: `pages:read`
- **Input parameters**:
  - `project_id` (string, required): Target project ID.
  - `branch_id` (string, optional): Target branch ID.
  - `limit` (integer, optional): Maximum items to return.

### `get_project`
Retrieves project details, description, visibility, and default branch configuration.
- **Scope required**: `projects:read`
- **Input parameters**:
  - `project_id` (string, required): Target project ID.

---

## 4. Prompt Templates

Prompt templates provide standardized prompts for LLMs:

### `troubleshoot_topic`
Searches documentation and produces step-by-step root-cause analysis and resolution.
- **Arguments**:
  - `project_id` (required): Target project ID.
  - `topic` (required): Error message, symptom, or topic to troubleshoot.

### `explain_architecture`
Inspects documentation hierarchy and synthesizes a high-level architecture overview.
- **Arguments**:
  - `project_id` (required): Target project ID.

---

## 5. Resources

Direct URI resource access:
- `cms://projects/{project_id}/pages/{path}`: Reads live documentation page content.

---

## 6. Audit & Telemetry

Internal company administrators can audit MCP usage, operations, and tool calls:
- **Endpoint**: `GET /api/mcp/audit-events`
- **Query Parameters**: `organization_id`, `project_id`, `user_id`, `operation`, `start_date`, `end_date`, `limit`, `offset`.
