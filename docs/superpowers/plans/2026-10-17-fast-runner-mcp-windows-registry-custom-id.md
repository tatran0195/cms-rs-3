# High-Performance Documentation Runner with MCP, Windows Registry Integration & Unique Custom ID Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a high-performance documentation site runner (`cms-site`) featuring dual-mode MCP (stdio + Streamable HTTP `/mcp`), Windows Registry self-installation & `cms-doc://` protocol scheme handler, sub-millisecond `/p/{*id}` redirects with group-to-child unwrapping, and project-scoped unique custom IDs across the database and export pipeline.

**Architecture:** 
- In `crates/cms-entity` and `crates/cms-db`, add `custom_id: Option<String>` to pages and groups with project-scoped unique constraint (`project_id, custom_id`).
- In `crates/cms-biz/src/export.rs`, persist `custom_id` in SQLite `pages` and Tantivy search indexes.
- In `apps/runner`, add native Windows user registry operations (`apps/runner/src/windows.rs`), Axum fast-path redirect route `/p/{*id_or_path}`, and embedded MCP server (`apps/runner/src/mcp.rs`) powered by `rmcp` exposing both `stdio` and `/mcp` HTTP transports.
- Enhance `cms-site` with `clap` subcommands: `serve`, `mcp`, `open`, `install`, and `uninstall`.

**Tech Stack:** Rust 2021, Axum 0.8, rmcp 0.1, Tantivy 0.22, SQLx 0.8 (SQLite), clap 4.5, Windows registry APIs (`winreg` / `windows-sys`).

## Global Constraints
- Target platform: Windows (with cross-platform fallbacks for non-Windows builds).
- Single binary portable execution for `cms-site`: zero runtime external daemon dependencies.
- Strict isolation: User-level registry operations only (`HKEY_CURRENT_USER`), avoiding UAC prompts.
- Zero stdio pollution in MCP mode: All logging must route to `stderr`.

---

### Task 1: Core Entity & Database Layer for Unique Custom ID

**Files:**
- Modify: `crates/cms-entity/src/page.rs`
- Modify: `crates/cms-db/src/page.rs`
- Test: `crates/cms-entity/src/page.rs` (inline tests)
- Test: `crates/cms-db/tests/page_custom_id_test.rs`

**Interfaces:**
- Produces:
  - `Page.custom_id: Option<String>`
  - `CreatePageRequest.custom_id: Option<String>`
  - `UpdatePageRequest.custom_id: Option<Option<String>>`
  - `find_by_custom_id(pool: &PgPool, project_id: &str, custom_id: &str) -> Result<Option<Page>, DbError>`

- [ ] **Step 1: Write failing entity test for custom_id format and validation**

In `crates/cms-entity/src/page.rs`:
```rust
#[test]
fn test_custom_id_validation() {
    let valid_req = CreatePageRequest {
        project_id: "proj-1".into(),
        branch_id: "main".into(),
        parent_id: None,
        slug: "intro".into(),
        title: "Introduction".into(),
        description: None,
        content: None,
        language_id: None,
        kind: None,
        is_published: true,
        position: None,
        translation_key: None,
        icon: None,
        config: None,
        custom_id: Some("quick-start_v1".into()),
    };
    assert!(valid_req.validate().is_ok());

    let invalid_chars = CreatePageRequest {
        custom_id: Some("quick start/invalid".into()),
        ..valid_req.clone()
    };
    assert!(invalid_chars.validate().is_err());

    let reserved = CreatePageRequest {
        custom_id: Some("api".into()),
        ..valid_req.clone()
    };
    assert!(reserved.validate().is_err());
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p cms-entity test_custom_id_validation`
Expected: FAIL compilation (`custom_id` field not found).

- [ ] **Step 3: Implement custom_id on Page entities and validation rules**

In `crates/cms-entity/src/page.rs`:
- Define `pub static CUSTOM_ID_REGEX: Lazy<Regex> = ...` (`^[a-zA-Z0-9_-]{1,64}$`).
- Add `pub const RESERVED_CUSTOM_IDS: &[&str] = &["api", "assets", "healthz", "mcp", "p", "sites", "app", "auth"];`
- Add custom validator function `validate_custom_id(&str) -> Result<(), ValidationError>`.
- Add `pub custom_id: Option<String>` to `Page`, `CreatePageRequest`, `PageListItem`, and `UpdatePageRequest`.

In `crates/cms-db/src/page.rs`:
- Add `custom_id` to `insert_page`, `update_page`, and query projection fields.
- Add `pub async fn find_by_custom_id(pool: &PgPool, project_id: &str, custom_id: &str) -> Result<Option<Page>, DbError>`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p cms-entity test_custom_id_validation`
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add crates/cms-entity/src/page.rs crates/cms-db/src/page.rs
git commit -m "feat(entity,db): add unique custom_id to page entity and queries"
```

---

### Task 2: Export Pipeline Support for Custom ID in SQLite & Tantivy

**Files:**
- Modify: `crates/cms-biz/src/export.rs`
- Test: `crates/cms-biz/tests/export_custom_id_test.rs`

**Interfaces:**
- Consumes: `Page.custom_id` from `cms-entity`.
- Produces:
  - SQLite table `pages` with `custom_id TEXT` and `idx_pages_custom_id` index.
  - Tantivy schema field `custom_id: Field` (STRING | STORED | FAST).

- [ ] **Step 1: Write failing test for custom_id presence in exported SQLite & Tantivy**

In `crates/cms-biz/tests/export_custom_id_test.rs`:
```rust
#[tokio::test]
async fn test_export_contains_custom_id() {
    let temp = tempfile::tempdir().unwrap();
    let db_path = temp.path().join("docs.sqlite");
    let pool = build_test_export_db(&db_path, Some("my-custom-guide")).await.unwrap();

    let row = sqlx::query("SELECT custom_id FROM pages WHERE custom_id = 'my-custom-guide'")
        .fetch_optional(&pool)
        .await
        .unwrap();
    assert!(row.is_some());
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p cms-biz --test export_custom_id_test`
Expected: FAIL (column `custom_id` does not exist).

- [ ] **Step 3: Update export schema and Tantivy builder**

In `crates/cms-biz/src/export.rs`:
- Update `CREATE TABLE pages`:
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
- Update `INSERT INTO pages (id, custom_id, version_id, parent_id, kind, slug, path, title, icon, sort_order, is_draft, openapi_url, link_url)` to bind `page.custom_id`.
- Update `build_tantivy_export_index` to index `custom_id`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p cms-biz --test export_custom_id_test`
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add crates/cms-biz/src/export.rs crates/cms-biz/tests/export_custom_id_test.rs
git commit -m "feat(export): include custom_id in SQLite schema and Tantivy index"
```

---

### Task 3: Native Windows Registry & Environment Module

**Files:**
- Create: `apps/runner/src/windows.rs`
- Modify: `apps/runner/Cargo.toml`
- Test: `apps/runner/src/windows.rs` (unit tests)

**Interfaces:**
- Produces:
  - `pub fn install_user_path(bin_dir: &Path) -> anyhow::Result<bool>`
  - `pub fn uninstall_user_path(bin_dir: &Path) -> anyhow::Result<bool>`
  - `pub fn register_protocol_handler(exe_path: &Path) -> anyhow::Result<()>`
  - `pub fn unregister_protocol_handler() -> anyhow::Result<()>`
  - `pub fn broadcast_environment_change() -> anyhow::Result<()>`
  - `pub fn open_url_in_browser(url: &str) -> anyhow::Result<()>`

- [ ] **Step 1: Add winreg or windows-sys dependencies to apps/runner/Cargo.toml**

```toml
[target.'cfg(windows)'.dependencies]
winreg = "0.52"
windows-sys = { version = "0.59", features = ["Win32_UI_WindowsAndMessaging", "Win32_Foundation"] }
```

- [ ] **Step 2: Write failing unit test for PATH string manipulation**

In `apps/runner/src/windows.rs`:
```rust
#[test]
fn test_path_string_manipulation() {
    let original = r"C:\Windows\System32;C:\Users\Admin\.cargo\bin";
    let target = r"C:\Users\Admin\AppData\Local\Programs\cms-site";

    let added = add_to_path_string(original, target);
    assert!(added.contains(target));
    assert_eq!(add_to_path_string(&added, target), added, "idempotent addition");

    let removed = remove_from_path_string(&added, target);
    assert!(!removed.contains(target));
    assert_eq!(removed, original);
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cargo test -p cms-runner test_path_string_manipulation`
Expected: FAIL (`add_to_path_string` not defined).

- [ ] **Step 4: Implement Windows registry operations**

In `apps/runner/src/windows.rs`:
- Implement `add_to_path_string` and `remove_from_path_string`.
- Implement `install_user_path` reading and updating `HKEY_CURRENT_USER\Environment\Path`.
- Implement `register_protocol_handler` creating `HKCU\Software\Classes\cms-doc`.
- Implement `unregister_protocol_handler` removing `HKCU\Software\Classes\cms-doc`.
- Implement `broadcast_environment_change` calling `SendMessageTimeoutW(HWND_BROADCAST, WM_SETTINGCHANGE, 0, "Environment")`.
- Implement `open_url_in_browser` launching default browser with fallback to `cmd /C start "" <url>`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cargo test -p cms-runner test_path_string_manipulation`
Expected: PASS.

- [ ] **Step 6: Commit changes**

```bash
git add apps/runner/Cargo.toml apps/runner/src/windows.rs
git commit -m "feat(runner): implement native Windows registry and path operations"
```

---

### Task 4: Fast-Path Direct ID & Group Redirects in Runner Server

**Files:**
- Modify: `apps/runner/src/main.rs`
- Test: `apps/runner/tests/fast_path_redirect_test.rs`

**Interfaces:**
- Produces:
  - Route: `GET /p/{*id_or_path}`
  - Handler: `fast_path_redirect(Path(id_or_path), Query(params), State(state)) -> Response`
  - Group resolution: Automatically resolves group nodes to their first child page (`kind == 'PAGE'`).

- [ ] **Step 1: Write failing test for fast-path redirect by ID, custom ID, and group**

In `apps/runner/tests/fast_path_redirect_test.rs`:
```rust
#[tokio::test]
async fn test_fast_path_redirects() {
    let pool = setup_mock_sqlite_with_custom_ids().await;
    let app = create_runner_router(AppState { db: pool, search: None }, None);

    // 1. Direct custom_id redirect
    let req = axum::http::Request::builder()
        .uri("/p/auth-guide")
        .body(axum::body::Body::empty())
        .unwrap();
    let res = app.clone().oneshot(req).await.unwrap();
    assert_eq!(res.status(), axum::http::StatusCode::TEMPORARY_REDIRECT);
    assert_eq!(res.headers().get("location").unwrap(), "/en/v1/auth/guide");

    // 2. Group unwrapping to first child page
    let req = axum::http::Request::builder()
        .uri("/p/api-group")
        .body(axum::body::Body::empty())
        .unwrap();
    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), axum::http::StatusCode::TEMPORARY_REDIRECT);
    assert_eq!(res.headers().get("location").unwrap(), "/en/v1/api/overview");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p cms-runner --test fast_path_redirect_test`
Expected: FAIL (route `/p/*` not handled, returns 404/SPA).

- [ ] **Step 3: Implement fast-path lookup and group unwrapping**

In `apps/runner/src/main.rs`:
- Define `fast_path_redirect` handler:
  ```rust
  async fn fast_path_redirect(
      State(state): State<AppState>,
      axum::extract::Path(target_id): axum::extract::Path<String>,
      Query(params): Query<HashMap<String, String>>,
  ) -> Response
  ```
- Lookup logic:
  - 1. `SELECT id, kind, path FROM pages WHERE id = ?1 LIMIT 1`
  - 2. `SELECT id, kind, path FROM pages WHERE custom_id = ?1 LIMIT 1`
  - 3. If `kind == 'GROUP'`, lookup first child:
    `SELECT path FROM pages WHERE parent_id = ?1 AND kind = 'PAGE' ORDER BY sort_order ASC LIMIT 1`
  - 4. Return `StatusCode::TEMPORARY_REDIRECT` with target path and preserved query parameters.
- Add `.route("/p/{*id_or_path}", get(fast_path_redirect))` to `create_runner_router`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p cms-runner --test fast_path_redirect_test`
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add apps/runner/src/main.rs apps/runner/tests/fast_path_redirect_test.rs
git commit -m "feat(runner): add fast-path ID redirects and group unwrapping"
```

---

### Task 5: Standalone Runner MCP Server (Stdio & HTTP Transports)

**Files:**
- Create: `apps/runner/src/mcp.rs`
- Modify: `apps/runner/Cargo.toml`
- Modify: `apps/runner/src/main.rs`
- Test: `apps/runner/tests/runner_mcp_test.rs`

**Interfaces:**
- Produces:
  - `RunnerMcpHandler` implementing `rmcp::ServerHandler`
  - Tools: `search_docs`, `get_page`, `list_pages`, `open_page`, `get_project_info`
  - `cms-site mcp` stdio subcommand
  - Axum mount: `/mcp` Streamable HTTP endpoint

- [ ] **Step 1: Add rmcp dependency to apps/runner/Cargo.toml**

```toml
rmcp = { workspace = true }
```

- [ ] **Step 2: Write failing test for Runner MCP tools**

In `apps/runner/tests/runner_mcp_test.rs`:
```rust
#[tokio::test]
async fn test_runner_mcp_tools() {
    let pool = setup_mock_sqlite().await;
    let handler = RunnerMcpHandler::new(pool, None, "http://localhost:8080".into());

    let list_res = handler.list_pages(ListPagesParams { version: None }).await.unwrap();
    assert!(!list_res.is_empty());

    let page_res = handler.get_page(GetPageParams {
        id_or_path: "auth-guide".into(),
        language: None,
        version: None,
        max_chars: None,
    }).await.unwrap();
    assert!(page_res.content.contains("# Authentication"));
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cargo test -p cms-runner --test runner_mcp_test`
Expected: FAIL (`RunnerMcpHandler` not found).

- [ ] **Step 4: Implement RunnerMcpHandler with rmcp**

In `apps/runner/src/mcp.rs`:
- Define `RunnerMcpHandler` struct wrapping `SqlitePool`, `Option<Arc<TantivySiteSearch>>`, and `server_url`.
- Implement `#[tool_router]` methods:
  - `search_docs`: queries Tantivy or SQLite FTS5.
  - `get_page`: fetches title, outline headings, and markdown by UUID, path, or `custom_id`.
  - `list_pages`: queries hierarchical tree of pages and groups.
  - `open_page`: triggers browser open.
  - `get_project_info`: queries `export_meta` and `project_config`.
- Implement `run_stdio(handler)` using `rmcp::transport::stdio()`.
- Implement `create_mcp_http_service(handler)` using `rmcp::transport::streamable_http_server`.

In `apps/runner/src/main.rs`:
- Mount `/mcp` in `create_runner_router`.
- Add CLI subcommands using `clap`: `Serve`, `Mcp`, `Open`, `Install`, `Uninstall`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cargo test -p cms-runner --test runner_mcp_test`
Expected: PASS.

- [ ] **Step 6: Commit changes**

```bash
git add apps/runner/src/mcp.rs apps/runner/src/main.rs apps/runner/Cargo.toml apps/runner/tests/runner_mcp_test.rs
git commit -m "feat(runner): implement dual-mode MCP server with Tantivy and SQLite"
```

---

### Task 6: CLI Subcommands Wiring & End-to-End Verification

**Files:**
- Modify: `apps/runner/src/main.rs`
- Modify: `README.md` / runner docs

**Interfaces:**
- Produces:
  - Fully wired `cms-site install`, `cms-site uninstall`, `cms-site open`, `cms-site mcp`, `cms-site serve`.

- [ ] **Step 1: Wire CLI commands in main()**

Implement subcommand execution dispatch:
- `Commands::Install`: calls `windows::install_user_path` and `windows::register_protocol_handler`.
- `Commands::Uninstall`: calls `windows::uninstall_user_path` and `windows::unregister_protocol_handler`.
- `Commands::Open { id }`: detects running server on port 8080 (or launches background server) and invokes `windows::open_url_in_browser`.
- `Commands::Mcp`: runs `mcp::run_stdio`.
- `Commands::Serve`: runs existing Axum documentation server with embedded `/mcp` service.

- [ ] **Step 2: Run all workspace tests**

Run: `cargo test -p cms-entity -p cms-db -p cms-biz -p cms-runner`
Expected: PASS with 0 failures.

- [ ] **Step 3: Verify CLI binary help screen**

Run: `cargo run --bin cms-site -- --help`
Expected: Shows `serve`, `mcp`, `open`, `install`, `uninstall` subcommands.

- [ ] **Step 4: Commit changes**

```bash
git add apps/runner/src/main.rs
git commit -m "feat(runner): wire CLI subcommands and complete runner feature suite"
```
