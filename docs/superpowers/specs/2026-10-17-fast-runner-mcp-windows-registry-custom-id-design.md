# High-Performance Documentation Runner with MCP, Windows Registry Integration & Unique Custom ID Design

## 1. Executive Summary

This specification defines the architecture, data model, protocols, and implementation for:
1. **Ultra-Fast Standalone Runner MCP Server (`cms-site mcp`)**: Embedding Model Context Protocol (MCP) support into `apps/runner` with dual transport modes: stdio for offline desktop AI tools (Claude Desktop, Cursor, Antigravity) and Streamable HTTP (`/mcp`) on the Axum documentation web server.
2. **CLI Ergonomics & Windows Registry Integration**: Self-installation/uninstallation updating Windows User `PATH` (`HKCU\Environment`), registration of `cms-doc://` custom URL protocol scheme in Windows Registry (`HKCU\Software\Classes\cms-doc`), and zero-flash Windows shell execution.
3. **Instantaneous Redirect & Open by ID (`/p/{*id}`)**: Direct indexed resolution of UUIDs, unique custom IDs, and hierarchical group paths in <0.1ms, automatically unwrapping group nodes to their first child documentation page.
4. **End-to-End Unique Custom ID System**: Project-scoped unique identifiers for pages and groups across PostgreSQL, `crates/cms-entity`, `crates/cms-db`, SQLite export schema, and Tantivy full-text search indexes.

---

## 2. CLI Architecture & Windows Registry Operations

### 2.1 CLI Subcommands (`apps/runner/src/main.rs`)

The `cms-site` binary uses `clap` subcommands with fallback to `serve` when executed without a subcommand:

```text
cms-site [COMMAND] [OPTIONS]

Commands:
  serve       Run the documentation web server and /mcp HTTP endpoint (default)
  mcp         Run the standalone MCP server over stdio for AI developer tools
  open        Open a documentation page by UUID or custom ID in default browser
  install     Install cms-site to User PATH and register cms-doc:// URL protocol
  uninstall   Remove cms-site from User PATH and unregister protocol handler
```

#### Command Specifications

1. **`cms-site serve` (or root default)**:
   - Starts the Axum web server hosting the single-page application reader, REST API (`/api/v1/*`), and Streamable HTTP MCP service (`/mcp`).
   - Flags:
     - `--db <path>`: SQLite database file (default: `docs.sqlite`).
     - `--dir <path>`: Directory containing `docs.sqlite` and `search_index/`.
     - `--bundle <path>`: Compressed `.tar.gz` site bundle archive.
     - `--port <u16>`: Port to bind (default: `8080`).
     - `--bind <ip>`: Bind address (default: `127.0.0.1`).
     - `--network`: Expose on `0.0.0.0`.
     - `--cors-origin <origin>`: Allowed CORS origin header.

2. **`cms-site mcp`**:
   - Runs the MCP server directly over standard input/output (`stdio`).
   - Disables all `stdout` log messages (routes all tracing logs to `stderr`) to prevent JSON-RPC protocol corruption.
   - Accepts `--db <path>`, `--dir <path>`, `--index-dir <path>`.

3. **`cms-site open <id_or_custom_id>`**:
   - Resolves the provided page ID, custom ID, or full `cms-doc://<id>` URL.
   - Checks if a runner server is running on `127.0.0.1:8080` via a fast `GET /healthz` check (150ms timeout).
   - If running, launches the default browser to `http://127.0.0.1:8080/p/<id>`.
   - If not running, launches a background server process (or starts the server) and opens the browser.

4. **`cms-site install`**:
   - Resolves current executable location or copies the binary to `%LOCALAPPDATA%\Programs\cms-site\cms-site.exe`.
   - Reads the user's `PATH` from `HKEY_CURRENT_USER\Environment`.
   - If the install directory is not present, appends it and updates the registry value.
   - Registers the `cms-doc://` URL protocol:
     - Key: `HKCU\Software\Classes\cms-doc` -> `(Default) = "URL:CMS Documentation Protocol"`, `"URL Protocol" = ""`
     - Key: `HKCU\Software\Classes\cms-doc\shell\open\command` -> `(Default) = "\"<path_to_cms_site.exe>\" open \"%1\""`
   - Broadcasts `WM_SETTINGCHANGE` with `lParam = "Environment"` using `SendNotifyMessageW` / `SendMessageTimeoutW` so all running Windows shells and apps recognize `cms-site` immediately without system reboot.

5. **`cms-site uninstall`**:
   - Removes the install directory from `HKCU\Environment\Path`.
   - Deletes `HKCU\Software\Classes\cms-doc`.
   - Broadcasts `WM_SETTINGCHANGE`.

### 2.2 Native Windows Registry Module (`apps/runner/src/windows.rs`)
- Operates entirely within `HKEY_CURRENT_USER` (HKCU), requiring zero administrator elevation or UAC prompts.
- Employs safe string parsing to preserve existing PATH components without reordering or duplication.

---

## 3. High-Performance MCP Server Engine

### 3.1 Architecture & Transport Modes

The runner implements the Model Context Protocol using `rmcp`. It provides two access modes:
1. **Stdio Transport**: Executed via `cms-site mcp --db docs.sqlite`, facilitating local agent tools (Antigravity, Cursor, Claude Desktop).
2. **Streamable HTTP Transport**: Mounted at `/mcp` on the Axum web server, allowing local and remote agents to interact over HTTP/SSE.

### 3.2 Tool Definitions

| Tool Name | Parameters | Description |
|:---|:---|:---|
| `search_docs` | `query: String`, `language?: String`, `version?: String`, `limit?: usize` | Performs zero-copy BM25 full-text search with highlight snippets via Tantivy. Falls back to SQLite FTS5 if index is absent. |
| `get_page` | `id_or_path: String`, `language?: String`, `version?: String`, `max_chars?: usize` | Retrieves full markdown source, title, metadata, and extracted heading outline by UUID, canonical path, or `custom_id`. |
| `list_pages` | `version?: String` | Returns the complete navigation hierarchy including groups, pages, titles, paths, kinds, and custom IDs. |
| `open_page` | `id_or_path: String` | Opens the target page or group in the user's default desktop browser via the runner server. |
| `get_project_info` | None | Returns project name, slug, description, available languages, versions, and export timestamp. |

### 3.3 Latency Optimizations
- SQLite pool configured in read-only mode (`SQLITE_OPEN_READONLY`) with memory-mapped I/O enabled (`PRAGMA mmap_size = 268435456`).
- Tantivy `MmapDirectory` keeps hot search segments in the Windows OS page cache, eliminating disk round-trips (<1ms query latency).

---

## 4. Direct Fast-Path ID Resolution & Hierarchical Group Routing

### 4.1 Fast-Path Endpoint: `GET /p/{*id_or_path}`

The runner web server exposes an ultra-fast redirect route `/p/{*id_or_path}` that resolves identifiers in <0.1ms:

```
Request: GET /p/auth-quickstart?lang=en
                  │
                  ▼
  ┌─────────────────────────────────┐
  │ 1. Match pages.id (UUID)        │──Match──┐
  └─────────────────────────────────┘         │
                  │ No                        │
                  ▼                           │
  ┌─────────────────────────────────┐         │
  │ 2. Match pages.custom_id        │──Match──┤
  └─────────────────────────────────┘         │
                  │ No                        │
                  ▼                           │
  ┌─────────────────────────────────┐         │
  │ 3. Match hierarchical path      │──Match──┤
  │    (group_custom_id/child_id)   │         │
  └─────────────────────────────────┘         │
                  │ No                        │
                  ▼                           │
               404 Not Found                  │
                                              ▼
                                 ┌────────────────────────┐
                                 │ Check kind == 'GROUP'? │
                                 └────────────────────────┘
                                      │ Yes            │ No
                                      ▼                ▼
                             ┌─────────────────┐  Emit HTTP 307
                             │ Find 1st child  │  Redirect to
                             │ page in group   │  canonical path
                             └─────────────────┘
                                      │
                                      ▼
                               Emit HTTP 307
                               Redirect to child
```

### 4.2 Group Child Unwrapping
When a group identifier is resolved (e.g. `/p/api-reference` or `/p/guides`), the runner does not render a blank shell. Instead, it queries:
```sql
SELECT path FROM pages
WHERE parent_id = ?1 AND kind = 'PAGE' AND is_draft = 0
ORDER BY sort_order ASC LIMIT 1;
```
It immediately issues a `307 Temporary Redirect` to that child page's canonical URL path.

---

## 5. End-to-End Unique Custom ID Data Model & Pipeline

### 5.1 Core Entity Updates (`crates/cms-entity/src/page.rs`)
- `Page`:
  ```rust
  pub custom_id: Option<String>,
  ```
- `CreatePageRequest`:
  ```rust
  #[validate(regex(path = "*CUSTOM_ID_REGEX", message = "custom_id must be 1-64 alphanumeric, hyphens, or underscores"))]
  pub custom_id: Option<String>,
  ```
- `UpdatePageRequest`:
  ```rust
  pub custom_id: Option<Option<String>>,
  ```
- Validation rules:
  - Allowed characters: `^[a-zA-Z0-9_-]{1,64}$`.
  - Reserved keywords: cannot be `api`, `assets`, `healthz`, `mcp`, `p`, `sites`, `app`, `auth`.
  - Applicable to both `PAGE` and `GROUP` node kinds.

### 5.2 PostgreSQL Database Layer (`crates/cms-db`)
- Column: `pages.custom_id VARCHAR(64)`.
- Project-Scoped Unique Index:
  ```sql
  CREATE UNIQUE INDEX IF NOT EXISTS idx_pages_project_custom_id
  ON pages (project_id, custom_id)
  WHERE custom_id IS NOT NULL;
  ```
- In `crates/cms-db/src/page.rs`: update create, update, and fetch operations to handle `custom_id`.

### 5.3 Export Pipeline (`crates/cms-biz/src/export.rs`)
- SQLite Table Schema:
  ```sql
  CREATE TABLE pages (
      id          TEXT PRIMARY KEY,
      custom_id   TEXT,
      version_id  TEXT NOT NULL,
      parent_id   TEXT,
      kind        TEXT NOT NULL DEFAULT 'PAGE',
      slug        TEXT NOT NULL,
      path        TEXT NOT NULL,
      title       TEXT NOT NULL,
      icon        TEXT,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      is_draft    INTEGER NOT NULL DEFAULT 0,
      openapi_url TEXT,
      link_url    TEXT,
      FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES pages(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_pages_custom_id ON pages(custom_id);
  ```
- Tantivy Search Schema:
  Add `custom_id` text field (`STRING | STORED | FAST`) to enable instant direct search matching on custom permalinks.

---

## 6. Testing & Quality Verification

1. **Unit Tests**:
   - `test_windows_registry_path_normalization`: Verifies PATH parsing, addition, and removal idempotency.
   - `test_custom_id_format_validation`: Asserts valid slug patterns and rejects invalid characters or reserved names.
   - `test_group_child_unwrapping`: Verifies resolving a group ID redirects to its first leaf child page.
2. **Integration Tests**:
   - `test_runner_mcp_stdio_roundtrip`: Simulates stdio JSON-RPC handshake, `search_docs`, and `get_page`.
   - `test_runner_mcp_http_service`: Validates `/mcp` endpoint over Axum test client.
   - `test_fast_path_redirect_307`: Tests `GET /p/:id` returns 307 with correct `Location` header.
3. **Database Uniqueness Tests**:
   - Asserts inserting two pages with the same `custom_id` in the same project fails with a conflict error, while distinct projects allow identical custom IDs.
