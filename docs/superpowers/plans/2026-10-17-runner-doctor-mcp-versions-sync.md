# CMS Runner Doctor, RMCP Version Selection, Auto-Sync & Crate Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a modular `cms_runner` library, implement the `cms-site doctor` diagnostic command, add `list_versions` to the embedded MCP server, support version/language scoped deep-links in `cms-site open`, and build the `cms-site sync` client with zero-downtime hot-reload (`POST /api/v1/reload`).

**Architecture:** Add `[lib]` to `apps/runner/Cargo.toml` (`cms_runner`) alongside binary `cms-site`. Extract domain modules (`diagnostics.rs`, `sync.rs`). State is wrapped in an atomic handle (`tokio::sync::RwLock`) to support hot-reloading via loopback `POST /api/v1/reload`. `cms-site doctor` evaluates registry keys, PATH, SQLite `PRAGMA integrity_check`, Tantivy doc count parity, and port collision status.

**Tech Stack:** Rust 2021, Axum 0.8, rmcp 3.5, winreg 0.52, windows-sys 0.59, sqlx (sqlite), tantivy 0.26, reqwest, tokio, clap 4.5.

## Global Constraints

- Platform Purpose: Exclusively internal company deployment (no multi-tenant SaaS billing, plans, tiers, or public marketing).
- Registry scope: Confined strictly to `HKEY_CURRENT_USER` (no UAC / administrative elevation required).
- MCP stdio hygiene: All logging strictly directed to `stderr`; zero protocol pollution on `stdout`.
- Fast redirects: Must issue `307 Temporary Redirect` and preserve query parameters.
- Reload endpoint: Must enforce loopback-only authorization (`is_loopback_host`).

---

### Task 1: Crate Architecture & Library Modularization (`apps/runner`)

**Files:**
- Modify: `apps/runner/Cargo.toml`
- Create: `apps/runner/src/lib.rs`
- Modify: `apps/runner/src/main.rs`

**Interfaces:**
- Produces:
  - Library `cms_runner` exposing: `windows`, `mcp`, `AppState`, `create_runner_router`, `resolve_runner_paths`, `Args`, `ServeArgs`, `Cli`, `Commands`.
  - Binary `cms-site` consuming `cms_runner`.

- [x] **Step 1: Update apps/runner/Cargo.toml to define [lib] and [dependencies]**

Add `[lib]` entry and `reqwest` for sync:
```toml
[lib]
name = "cms_runner"
path = "src/lib.rs"

[[bin]]
name = "cms-site"
path = "src/main.rs"

[dependencies]
reqwest = { workspace = true, features = ["json", "rustls"], default-features = false }
```

- [x] **Step 2: Create apps/runner/src/lib.rs with module exports**

Export core modules:
```rust
pub mod windows;
pub mod mcp;

// Re-export router, app state, and utility functions
```

- [x] **Step 3: Update apps/runner/src/main.rs to use cms_runner**

Refactor `main.rs` to import from `cms_runner::*`.

- [x] **Step 4: Run tests to verify compilation and library resolution**

Run: `cargo test -p cms-runner`
Expected: PASS (all 20 unit tests continue to pass).

- [x] **Step 5: Commit changes**

```bash
git add apps/runner/Cargo.toml apps/runner/src/lib.rs apps/runner/src/main.rs
git commit -m "refactor(runner): define cms_runner library and modularize crate structure"
```

---

### Task 2: RMCP Version Discovery Tool & Extended `cms-site open`

**Files:**
- Modify: `apps/runner/src/mcp.rs`
- Modify: `apps/runner/src/main.rs`
- Test: `apps/runner/tests/mcp_versions_test.rs` (or inside `apps/runner/src/main.rs`)

**Interfaces:**
- Produces:
  - RMCP tool `list_versions`: returns `Vec<VersionSummary>` with joined `page_count`.
  - CLI `cms-site open <id>`: supports `--version <slug>`, `--lang <code>`, and parses `cms-doc://<id>?version=...&lang=...`.

- [x] **Step 1: Write failing test for list_versions tool and open parameter parsing**

```rust
#[tokio::test]
async fn test_list_versions_tool() {
    let pool = setup_test_db().await;
    let handler = mcp::RunnerMcpHandler::new(pool, None, "http://localhost:8080".into());
    let res = handler.list_versions(rmcp::handler::server::wrapper::Parameters(mcp::ListVersionsParams::default())).await.unwrap();
    let text = res.content[0].as_text().unwrap();
    assert!(text.contains("v1.0"));
    assert!(text.contains("pageCount"));
}
```

- [x] **Step 2: Run test to verify it fails**

Run: `cargo test -p cms-runner test_list_versions_tool`
Expected: FAIL (`list_versions` not implemented).

- [x] **Step 3: Implement list_versions in apps/runner/src/mcp.rs**

```rust
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema, Default)]
pub struct ListVersionsParams {}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionSummary {
    pub id: String,
    pub slug: String,
    pub label: String,
    pub is_default: bool,
    pub sort_order: i64,
    pub page_count: i64,
}

#[tool(description = "List all available documentation versions and branches with page counts")]
pub async fn list_versions(
    &self,
    Parameters(_args): Parameters<ListVersionsParams>,
) -> Result<CallToolResult, ErrorData> {
    let rows = sqlx::query(
        "SELECT v.id, v.slug, v.label, v.is_default, v.sort_order, COUNT(p.id) \
         FROM versions v \
         LEFT JOIN pages p ON p.version_id = v.id \
         GROUP BY v.id \
         ORDER BY v.sort_order ASC",
    )
    .fetch_all(&self.db)
    .await
    .map_err(|e| mcp_err(ErrorCode::INTERNAL_ERROR, e.to_string()))?;

    let mut versions = Vec::new();
    for r in rows {
        versions.push(VersionSummary {
            id: r.try_get(0).unwrap_or_default(),
            slug: r.try_get(1).unwrap_or_default(),
            label: r.try_get(2).unwrap_or_default(),
            is_default: r.try_get::<i32, _>(3).unwrap_or(0) == 1,
            sort_order: r.try_get(4).unwrap_or(0),
            page_count: r.try_get(5).unwrap_or(0),
        });
    }

    let json_text = serde_json::to_string_pretty(&versions)
        .map_err(|e| mcp_err(ErrorCode::INTERNAL_ERROR, e.to_string()))?;
    Ok(CallToolResult::success(vec![ContentBlock::text(json_text)]))
}
```

- [x] **Step 4: Update OpenArgs and run_open in apps/runner/src/main.rs**

Add `--version` and `--lang` to `OpenArgs`. Parse query params from URI or flags:
```rust
#[derive(Parser, Debug, Clone)]
pub struct OpenArgs {
    pub id: String,
    #[arg(short, long)]
    pub version: Option<String>,
    #[arg(short, long)]
    pub lang: Option<String>,
    #[arg(short, long, default_value_t = 8080)]
    pub port: u16,
    #[arg(long, default_value = "http://localhost:8080")]
    pub server_url: String,
}
```

- [x] **Step 5: Run tests to verify they pass**

Run: `cargo test -p cms-runner test_list_versions_tool`
Expected: PASS.

- [x] **Step 6: Commit changes**

```bash
git add apps/runner/src/mcp.rs apps/runner/src/main.rs
git commit -m "feat(runner): add list_versions MCP tool and --version/--lang flags to open command"
```

---

### Task 3: `cms-site doctor` Diagnostic & Health Suite

**Files:**
- Create: `apps/runner/src/diagnostics.rs`
- Modify: `apps/runner/src/lib.rs`
- Modify: `apps/runner/src/main.rs`
- Test: `apps/runner/src/diagnostics.rs` (unit tests)

**Interfaces:**
- Produces:
  - `pub async fn run_doctor(db_path: &Path, idx_dir: Option<&Path>, port: u16) -> anyhow::Result<bool>`
  - CLI subcommand `cms-site doctor`.

- [x] **Step 1: Write failing test for diagnostic checks**

```rust
#[tokio::test]
async fn test_doctor_sqlite_integrity_check() {
    let temp = tempfile::tempdir().unwrap();
    let db_path = temp.path().join("docs.sqlite");
    std::fs::write(&db_path, b"not a valid sqlite file").unwrap();
    let res = check_sqlite_integrity(&db_path).await;
    assert!(res.is_err() || !res.unwrap().passed);
}
```

- [x] **Step 2: Run test to verify it fails**

Run: `cargo test -p cms-runner test_doctor_sqlite_integrity_check`
Expected: FAIL (`check_sqlite_integrity` not found).

- [x] **Step 3: Implement diagnostic checks in apps/runner/src/diagnostics.rs**

Implement:
1. `check_windows_registry`:
   - Checks `HKCU\Environment\Path` contains current executable directory.
   - Checks `HKCU\Software\Classes\cms-doc` exists.
   - Checks `shell\open\command` target executable exists and equals `current_exe`.
2. `check_sqlite_integrity`:
   - Runs `PRAGMA integrity_check`.
   - Checks `export_meta` (schema_version == 1).
   - Counts pages and content rows.
3. `check_search_engine`:
   - If Tantivy index present, opens reader and compares doc count with page count.
   - If SQLite FTS5, checks `page_fts` can be queried.
4. `check_port_collision`:
   - Tests `TcpListener::bind("127.0.0.1:port")`.
   - If port busy, probes `http://127.0.0.1:port/healthz` to determine if another `cms-site` is running.
5. `run_doctor`: Formats terminal table with `[✓]`, `[!]`, `[✗]`.

- [x] **Step 4: Wire doctor subcommand in apps/runner/src/main.rs**

Add `Commands::Doctor(DoctorArgs)`.

- [x] **Step 5: Run tests to verify they pass**

Run: `cargo test -p cms-runner diagnostics`
Expected: PASS.

- [x] **Step 6: Commit changes**

```bash
git add apps/runner/src/diagnostics.rs apps/runner/src/lib.rs apps/runner/src/main.rs
git commit -m "feat(runner): implement cms-site doctor diagnostic health suite"
```

---

### Task 4: Zero-Downtime Hot Reload in `cms-site serve` (`POST /api/v1/reload`)

**Files:**
- Modify: `apps/runner/src/lib.rs` / `apps/runner/src/main.rs`
- Test: `apps/runner/tests/hot_reload_test.rs` (or inside crate)

**Interfaces:**
- Produces:
  - Route: `POST /api/v1/reload`
  - Reopens SQLite read-only connection pool and Tantivy reader, atomically swapping references.

- [x] **Step 1: Write failing test for /api/v1/reload endpoint**

```rust
#[tokio::test]
async fn test_hot_reload_endpoint() {
    let pool = setup_test_db().await;
    let state = AppState::new(pool, None);
    let app = create_runner_router(state.clone(), None);

    let req = axum::http::Request::builder()
        .method("POST")
        .uri("/api/v1/reload")
        .body(axum::body::Body::empty())
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
}
```

- [x] **Step 2: Run test to verify it fails**

Run: `cargo test -p cms-runner test_hot_reload_endpoint`
Expected: FAIL (route `/api/v1/reload` not found, returns 404).

- [x] **Step 3: Implement AppState atomic reload and reload handler**

Wrap internal state in `Arc<tokio::sync::RwLock<InnerState>>` or `arc_swap`:
```rust
async fn api_reload(
    State(state): State<AppState>,
) -> Response {
    match state.reload().await {
        Ok(stats) => Json(serde_json::json!({ "reloaded": true, "stats": stats })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}
```
Mount `.route("/api/v1/reload", post(api_reload))` in router.

- [x] **Step 4: Run test to verify it passes**

Run: `cargo test -p cms-runner test_hot_reload_endpoint`
Expected: PASS.

- [x] **Step 5: Commit changes**

```bash
git add apps/runner/src/lib.rs apps/runner/src/main.rs
git commit -m "feat(runner): add zero-downtime hot-reload via POST /api/v1/reload"
```

---

### Task 5: `cms-site sync` Auto-Update Client

**Files:**
- Create: `apps/runner/src/sync.rs`
- Modify: `apps/runner/src/lib.rs`
- Modify: `apps/runner/src/main.rs`
- Test: `apps/runner/src/sync.rs` (unit tests)

**Interfaces:**
- Produces:
  - `pub async fn run_sync(args: SyncArgs) -> anyhow::Result<()>`
  - CLI subcommand `cms-site sync`.

- [x] **Step 1: Write failing test for sync atomic unpacking and integrity verification**

```rust
#[tokio::test]
async fn test_sync_atomic_replace_verifies_integrity() {
    let temp = tempfile::tempdir().unwrap();
    let target_db = temp.path().join("docs.sqlite");
    let corrupt_bytes = b"invalid";
    let res = verify_and_swap_sqlite(&target_db, corrupt_bytes).await;
    assert!(res.is_err());
    assert!(!target_db.exists(), "Target file must not be created if integrity check fails");
}
```

- [x] **Step 2: Run test to verify it fails**

Run: `cargo test -p cms-runner test_sync_atomic_replace_verifies_integrity`
Expected: FAIL (`verify_and_swap_sqlite` not found).

- [x] **Step 3: Implement sync client in apps/runner/src/sync.rs**

Implement:
1. `fetch_latest_export`: Calls hosted CMS `/api/v1/export/jobs?limit=1&format=sqlite` with `Bearer <token>`.
2. `download_and_verify`: Streams into `docs.sqlite.tmp`, performs `PRAGMA integrity_check`.
3. `atomic_swap`: Atomically renames `.tmp` to final path.
4. `notify_reload`: Sends `POST http://localhost:{port}/api/v1/reload`.
5. `run_sync`: Dispatches one-shot sync or `--watch` interval loop.

- [x] **Step 4: Wire sync subcommand in apps/runner/src/main.rs**

Add `Commands::Sync(SyncArgs)` and dispatch to `sync::run_sync`.

- [x] **Step 5: Run tests to verify they pass**

Run: `cargo test -p cms-runner sync`
Expected: PASS.

- [x] **Step 6: Commit changes**

```bash
git add apps/runner/src/sync.rs apps/runner/src/lib.rs apps/runner/src/main.rs
git commit -m "feat(runner): implement cms-site sync auto-updater and hot-reload notifier"
```

---

### Task 6: Workspace Integration Verification & Documentation

**Files:**
- Modify: `README.md` / `apps/runner/README.md`
- Test: Full workspace test suite

- [x] **Step 1: Run complete workspace test suite**

Run: `cargo test -p cms-entity -p cms-db -p cms-biz -p cms-runner`
Expected: PASS with 0 failures across all crates.

- [x] **Step 2: Verify CLI help and commands**

Run: `cargo run --bin cms-site -- --help`
Verify `doctor`, `sync`, `serve`, `mcp`, `open`, `install`, `uninstall` are documented.

- [x] **Step 3: Commit documentation and plan updates**

```bash
git add README.md apps/runner/README.md docs/superpowers/plans/2026-10-17-runner-doctor-mcp-versions-sync.md
git commit -m "docs(runner): document doctor, sync, mcp versions, and crate architecture"
```
