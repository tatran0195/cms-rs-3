# CMS Documentation Engine & Viewer (`cms-docs`)

The **CMS Documentation Engine & Viewer** (`cms-docs`) is an ultra-fast, single-binary static documentation server, local search engine, Model Context Protocol (MCP) server, and automated sync daemon for documentation sites exported from the internal CMS platform.

It is distributed as both a standalone executable (`cms-docs`) and an embeddable Rust library (`cms_docs`).

---

## 🚀 Key Capabilities

- **Single Portable Binary**: Zero-dependency executable packaging Axum HTTP server, embedded frontend viewer, Tantivy full-text & semantic search engine, and SQLite reader.
- **Library & Binary Modularization**: Core server, diagnostics, sync daemon, and MCP server exposed via `cms_docs` library (`apps/docs/src/lib.rs`) with a thin entrypoint in `cms-docs` (`apps/docs/src/main.rs`).
- **Doctor Diagnostic Suite (`cms-docs doctor`)**: Comprehensive health checks validating SQLite database integrity (`PRAGMA integrity_check`), schema v1 conformance, Tantivy search index & SQLite FTS5 fallback, Windows user PATH inclusion, `cms-doc://` URL protocol registration, and port collision detection.
- **Zero-Downtime Hot Reload (`POST /api/v1/reload`)**: Loopback-restricted hot-reloading endpoint that atomically replaces internal SQLite connection pools and Tantivy searcher instances in-memory without dropping active HTTP connections or requiring a process restart.
- **Automated Sync Daemon (`cms-docs sync`)**: Continuously polls or one-shot downloads documentation SQLite exports from hosted API servers. Enforces pre-swap SQLite integrity checks into temporary storage (`.tmp`) before atomically replacing the active database and notifying the running server.
- **Deep Linking & Version Scoping (`cms-docs open`)**: Resolves pages by UUID, slug, path, or human-readable custom IDs (`--version` and `--lang` aware). Supports direct shell invocation and `cms-doc://<custom-id>?version=<v>&lang=<lang>` Windows protocol activation.
- **Embedded MCP Server (`cms-docs mcp`)**: Full Model Context Protocol server over stdio for Cursor, Claude Desktop, Antigravity, and AI agents. Exposes tools:
  - `list_versions`: Discovers all published documentation versions, page counts, and default statuses.
  - `get_site_meta`: Project details, languages, versions, and navigation tree.
  - `search_docs`: Full-text & hybrid vector search with version and language scoping.
  - `read_page`: Full Markdown content reader by document UUID, path, or custom ID.

---

## 🛠️ CLI Commands & Subcommands

### 1. `cms-docs serve` (Default Command)

Starts the HTTP documentation server on localhost or exposed to the network.

```bash
# Serve current directory containing docs.sqlite
cms-docs

# Serve explicit database or export directory
cms-docs serve --dir /path/to/exported-site --port 8080

# Serve with network access (binds to 0.0.0.0 with optional CORS restriction)
cms-docs serve --dir ./demo-site --network --cors-origin "https://internal-docs.company.corp"

# Serve with background auto-sync worker enabled (polls main CMS server and hot-reloads on new documentation/branch exports)
cms-docs serve --sync --sync-url http://localhost:3000 --sync-interval 30 --sync-project my-docs
```

#### Background Auto-Sync Worker (`--sync` / `--sync-url`)
When enabled, spawns a lightweight background worker that continuously polls the central CMS server for new completed SQLite exports or branch revisions. When a newer export is detected, it automatically downloads it, verifies SQLite integrity, swaps the database atomically, and hot-reloads the in-memory state with zero downtime.

Configuration:
- `--sync` / `CMS_AUTO_SYNC=true`: Enable background sync worker (disabled by default).
- `--sync-url <URL>` / `CMS_SYNC_URL`: Main CMS server URL (default: `http://localhost:3000`) or direct artifact URL.
- `--sync-interval <SEC>` / `CMS_SYNC_INTERVAL`: Polling interval in seconds (default: `30`).
- `--sync-project <ID>` / `CMS_SYNC_PROJECT`: Filter to a specific project ID or slug.
- `--sync-branch <NAME>` / `CMS_SYNC_BRANCH`: Filter to a specific documentation branch / version.
- `--sync-token <TOKEN>` / `CMS_SYNC_TOKEN`: Bearer token for authenticated CMS API servers.

Inspection & Management Endpoints:
```bash
# Check current background worker status, last polled/synced timestamps, and job ID:
curl http://127.0.0.1:8080/api/v1/sync/status

# Trigger an immediate on-demand sync check right now:
curl -X POST http://127.0.0.1:8080/api/v1/sync
```

#### Hot-Reloading Endpoint
When `docs.sqlite` or search index is updated on disk manually, notify the running server without restarting:
```bash
curl -X POST http://127.0.0.1:8080/api/v1/reload
```
*Note: For security, the reload and sync trigger endpoints strictly enforce loopback origin (`127.0.0.1`, `localhost`, `::1`). External requests receive `403 Forbidden`.*

---

### 2. `cms-docs doctor` (Diagnostic Suite)

Runs automated health checks on documentation artifacts, local system configuration, and port status:

```bash
cms-docs doctor --dir ./target/demo-site --port 8080
```

Sample output:
```text
╭──────────────────────────────────────────────────────────────╮
│             CMS Documentation Site Doctor                    │
╰──────────────────────────────────────────────────────────────╯

[✓] [Database] SQLite Integrity & Schema: 'Acme Cloud Platform' (schema v1) - 4 pages, 3 content rows, 1 versions, 2 languages (0.09 MB, PRAGMA ok)
[✓] [Search Engine] SQLite FTS5: SQLite FTS5 table operational (page_fts: 3 entries)
[✓] [Registry] User PATH: 'C:\Users\Admin\.local\bin' is present in HKCU\Environment PATH
[✓] [Registry] Protocol Scheme: 'cms-doc://' registered -> "C:\Users\Admin\.local\bin\cms-docs.exe" open "%1"
[✓] [Network] HTTP Port: Port 8080 is available for binding

All critical diagnostic checks passed successfully.
```

---

### 3. `cms-docs sync` (Automated Sync & Update)

Downloads the latest completed SQLite export artifact from the hosted CMS API, verifies integrity, swaps atomically, and pings the local runner to reload:

```bash
# Single sync from hosted server
cms-docs sync --url https://cms.internal.company.corp --project acme-docs --token $CMS_API_TOKEN

# Continuous polling daemon (polls every 30 seconds)
cms-docs sync --url https://cms.internal.company.corp --project acme-docs --watch 30
```

#### Safeguards & Production Architecture:
- **First-Class Sync Manifest Protocol**: Probes `/api/runner/sync/manifest` using standard HTTP `If-None-Match` headers. If documentation has not changed, the server responds with `304 Not Modified` fast-path (zero DB churn, zero bandwidth wasted).
- **Persistent Local State (`<db_path>.sync.json`)**: Tracks `last_etag`, `last_sha256`, `last_export_id`, and `last_synced_at` on disk so runner process restarts retain sync history and avoid redundant re-downloads.
- **Cryptographic SHA-256 Verification**: Computes in-flight SHA-256 hash over downloaded bytes and matches against the server manifest before touching disk.
- **Atomic SQLite Integrity Swap**: Writes to a `.tmp` file and runs `PRAGMA integrity_check` plus schema v1 table validation before atomically renaming (`std::fs::rename`) to the active database.
- **Resilient Worker with Exponential Backoff & Jitter**: Automatically backs off on network or server errors (`base * 2^(errors-1)` + random jitter up to 300s) to prevent hammering failing infrastructure, with cooperative cancellation on process shutdown.

---

### 4. `cms-docs bundle` (Single-Binary Executable Packaging)

Bundles an exported SQLite documentation database directly into the `cms-docs` binary to produce a 100% self-contained single executable:

```bash
# Bundle docs.sqlite into a standalone single executable
cms-docs bundle --db docs.sqlite --output my-docs.exe

# Bundle with an explicit base executable and overwrite existing target
cms-docs bundle --db docs.sqlite --exe ./cms-docs.exe --output ./release/my-docs.exe --force
```

#### How Single-Binary Packaging Works:
- **Zero Startup Overhead**: Appends the SQLite database payload to the executable with a 56-byte footer:
  `[payload_len: 8 bytes LE] + [sha256: 32 bytes] + [magic: "CMS_SQLITE_PACK_": 16 bytes]`.
- **Integrity Pre-flight**: Automatically runs `PRAGMA integrity_check` on the database prior to packaging to ensure zero corrupted payloads are packaged.
- **Instant Extraction & Caching**: When launched with zero arguments (or double-clicked in Windows Explorer / desktop GUI), checks for the embedded footer, verifies the cryptographic SHA-256 checksum, unpacks to `%TEMP%/cms-docs-embed-<sha256>/docs.sqlite`, and starts the server immediately. Subsequent runs verify and reuse the cached database in under 1ms.
- **Single File Distribution**: The resulting binary requires no companion files, SQLite drivers, or runtime installations.

---

### 5. `cms-docs open` (Deep-Linking & Custom IDs)

Opens documentation pages directly in the user's default browser:

```bash
# Open by custom ID with specific version and language
cms-docs open auth-guide --version v2.0 --lang ja

# Open via cms-doc:// protocol URL
cms-docs open "cms-doc://billing-overview?version=v1.0"
```

---

### 6. `cms-docs mcp` (Model Context Protocol for AI Agents)

Launches the stdio MCP server for agent integration:

```bash
cms-docs mcp --dir ./demo-site --log-level warn
```

#### Available Tools:
1. `list_versions`: Returns JSON array of all available documentation versions and their page counts.
2. `get_site_meta`: Project metadata, site structure, and navigation hierarchy.
3. `search_docs`: Query Tantivy / FTS5 search index with optional `version` and `language` filters.
4. `read_page`: Fetches page content by UUID, path, or `custom_id` with version and language scoping.

#### Strict Stdio Protocol Hygiene:
All internal logging, diagnostic outputs, and warnings are redirected to `stderr` (`is_stdio_mcp = true`). Standard output (`stdout`) is strictly reserved for JSON-RPC 2.0 messages.

---

### 7. `cms-docs install` / `cms-docs uninstall` (Windows Desktop Integration)

Configures Windows user environment without requiring administrative elevation (operates strictly within `HKEY_CURRENT_USER`):

```bash
# Add current executable directory to HKCU\Environment PATH
# Register cms-doc:// URL protocol scheme in HKCU\Software\Classes\cms-doc
cms-docs install

# Cleanly remove PATH entries and protocol registration
cms-docs uninstall
```

---

### 8. Self-Upgrade & Update Commands (Cargo, Rustup & axoupdater)

`cms-docs` provides dual update pathways: direct CMS server-directed binary self-replacement and industry-standard **axoupdater** (`cargo-dist` / GitHub releases).

#### A. Automated In-Place Self-Upgrade (`cms-docs self update` / `cms-docs upgrade`)
Downloads and replaces the binary directly from the hosted CMS server or public download directory:

```bash
# Check if an update is available without applying (like 'rustup check')
cms-docs self update --check
# or: cms-docs upgrade --check

# Self-upgrade from hosted CMS API server (like 'rustup self update')
cms-docs self update --url https://cms.internal.company.corp
# or: cms-docs upgrade --url https://cms.internal.company.corp

# Force re-download and replacement even if already at latest version
cms-docs self update --force
```

#### B. axoupdater (`cargo-dist` / GitHub Releases) Integration:
For installations distributed via `cargo-dist` or GitHub releases:
```bash
# Check if a new release is available via axoupdater
cms-docs upgrade --axo --check

# Apply self-update via axoupdater
cms-docs upgrade --axo
```

#### C. Safe Windows & Unix Atomic Swap:
- Downloads incoming binary to `.tmp.exe`.
- Validates the target executable magic header (`MZ` on Windows, `\x7fELF` on Linux, Mach-O on macOS) before replacing.
- On Windows, uses `self-replace` crate to safely rename the running binary to `.old.exe` (bypassing Windows file locking) and move the new executable in place.
- On Unix / macOS, ensures `chmod 0755` executable permissions before atomic replacement.

#### D. Local Development Build via Cargo:
For engineers building from source within this workspace:
```bash
# Rebuild and install directly into user ~/.cargo/bin:
cargo install --path apps/docs --force

# Or compile release binary directly:
cargo build --release -p cms-docs
```

---

## 🔒 Security & Deployment Scope

- **Internal Company Deployment**: Built exclusively for internal enterprise documentation distribution. No public multi-tenant SaaS features, billing gateways, or subscription tiers.
- **Non-Elevated Scope**: Installs strictly to `HKEY_CURRENT_USER` (no UAC / elevation prompts).
- **Network Isolation**: Binds by default to `127.0.0.1`. When running with `--network`, use `--cors-origin` to restrict cross-origin access.
