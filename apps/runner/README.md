# CMS Documentation Site Runner (`cms-site`)

The **CMS Documentation Site Runner** (`cms-site`) is an ultra-fast, single-binary static documentation server, local search engine, Model Context Protocol (MCP) server, and automated sync daemon for documentation sites exported from the internal CMS platform.

It is distributed as both a standalone executable (`cms-site`) and an embeddable Rust library (`cms_runner`).

---

## 🚀 Key Capabilities

- **Single Portable Binary**: Zero-dependency executable packaging Axum HTTP server, embedded frontend viewer, Tantivy full-text & semantic search engine, and SQLite reader.
- **Library & Binary Modularization**: Core server, diagnostics, sync daemon, and MCP server exposed via `cms_runner` library (`apps/runner/src/lib.rs`) with a thin entrypoint in `cms-site` (`apps/runner/src/main.rs`).
- **Doctor Diagnostic Suite (`cms-site doctor`)**: Comprehensive health checks validating SQLite database integrity (`PRAGMA integrity_check`), schema v1 conformance, Tantivy search index & SQLite FTS5 fallback, Windows user PATH inclusion, `cms-doc://` URL protocol registration, and port collision detection.
- **Zero-Downtime Hot Reload (`POST /api/v1/reload`)**: Loopback-restricted hot-reloading endpoint that atomically replaces internal SQLite connection pools and Tantivy searcher instances in-memory without dropping active HTTP connections or requiring a process restart.
- **Automated Sync Daemon (`cms-site sync`)**: Continuously polls or one-shot downloads documentation SQLite exports from hosted API servers. Enforces pre-swap SQLite integrity checks into temporary storage (`.tmp`) before atomically replacing the active database and notifying the running runner server.
- **Deep Linking & Version Scoping (`cms-site open`)**: Resolves pages by UUID, slug, path, or human-readable custom IDs (`--version` and `--lang` aware). Supports direct shell invocation and `cms-doc://<custom-id>?version=<v>&lang=<lang>` Windows protocol activation.
- **Embedded MCP Server (`cms-site mcp`)**: Full Model Context Protocol server over stdio for Cursor, Claude Desktop, Antigravity, and AI agents. Exposes tools:
  - `list_versions`: Discovers all published documentation versions, page counts, and default statuses.
  - `get_site_meta`: Project details, languages, versions, and navigation tree.
  - `search_docs`: Full-text & hybrid vector search with version and language scoping.
  - `read_page`: Full Markdown content reader by document UUID, path, or custom ID.

---

## 🛠️ CLI Commands & Subcommands

### 1. `cms-site serve` (Default Command)

Starts the HTTP documentation server on localhost or exposed to the network.

```bash
# Serve current directory containing docs.sqlite
cms-site

# Serve explicit database or export directory
cms-site serve --dir /path/to/exported-site --port 8080

# Serve with network access (binds to 0.0.0.0 with optional CORS restriction)
cms-site serve --dir ./demo-site --network --cors-origin "https://internal-docs.company.corp"
```

#### Hot-Reloading Endpoint
When `docs.sqlite` or search index is updated on disk, notify the running server without restarting:
```bash
curl -X POST http://127.0.0.1:8080/api/v1/reload
```
*Note: For security, the reload endpoint strictly enforces loopback origin (`127.0.0.1`, `localhost`, `::1`). External requests receive `403 Forbidden`.*

---

### 2. `cms-site doctor` (Diagnostic Suite)

Runs automated health checks on documentation artifacts, local system configuration, and port status:

```bash
cms-site doctor --dir ./target/demo-site --port 8080
```

Sample output:
```text
╭──────────────────────────────────────────────────────────────╮
│             CMS Documentation Site Doctor                    │
╰──────────────────────────────────────────────────────────────╯

[✓] [Database] SQLite Integrity & Schema: 'Acme Cloud Platform' (schema v1) - 4 pages, 3 content rows, 1 versions, 2 languages (0.09 MB, PRAGMA ok)
[✓] [Search Engine] SQLite FTS5: SQLite FTS5 table operational (page_fts: 3 entries)
[✓] [Registry] User PATH: 'C:\Users\Admin\.local\bin' is present in HKCU\Environment PATH
[✓] [Registry] Protocol Scheme: 'cms-doc://' registered -> "C:\Users\Admin\.local\bin\cms-site.exe" open "%1"
[✓] [Network] HTTP Port: Port 8080 is available for binding

All critical diagnostic checks passed successfully.
```

---

### 3. `cms-site sync` (Automated Sync & Update)

Downloads the latest completed SQLite export artifact from the hosted CMS API, verifies integrity, swaps atomically, and pings the local runner to reload:

```bash
# Single sync from hosted server
cms-site sync --url https://cms.internal.company.corp --project acme-docs --token $CMS_API_TOKEN

# Continuous polling daemon (polls every 30 seconds)
cms-site sync --url https://cms.internal.company.corp --project acme-docs --watch 30
```

#### Safeguards:
- Writes downloaded payload to a `.tmp` file first.
- Executes `PRAGMA integrity_check` and schema v1 validation.
- Only performs atomic rename (`std::fs::rename`) if integrity check succeeds.
- If verification fails, the active database is left untouched.

---

### 4. `cms-site open` (Deep-Linking & Custom IDs)

Opens documentation pages directly in the user's default browser:

```bash
# Open by custom ID with specific version and language
cms-site open auth-guide --version v2.0 --lang ja

# Open via cms-doc:// protocol URL
cms-site open "cms-doc://billing-overview?version=v1.0"
```

---

### 5. `cms-site mcp` (Model Context Protocol for AI Agents)

Launches the stdio MCP server for agent integration:

```bash
cms-site mcp --dir ./demo-site --log-level warn
```

#### Available Tools:
1. `list_versions`: Returns JSON array of all available documentation versions and their page counts.
2. `get_site_meta`: Project metadata, site structure, and navigation hierarchy.
3. `search_docs`: Query Tantivy / FTS5 search index with optional `version` and `language` filters.
4. `read_page`: Fetches page content by UUID, path, or `custom_id` with version and language scoping.

#### Strict Stdio Protocol Hygiene:
All internal logging, diagnostic outputs, and warnings are redirected to `stderr` (`is_stdio_mcp = true`). Standard output (`stdout`) is strictly reserved for JSON-RPC 2.0 messages.

---

### 6. `cms-site install` / `cms-site uninstall` (Windows Desktop Integration)

Configures Windows user environment without requiring administrative elevation (operates strictly within `HKEY_CURRENT_USER`):

```bash
# Add current executable directory to HKCU\Environment PATH
# Register cms-doc:// URL protocol scheme in HKCU\Software\Classes\cms-doc
cms-site install

# Cleanly remove PATH entries and protocol registration
cms-site uninstall
```

---

### 7. `cms-site upgrade` (Self-Upgrade & Automated Binary Updates)

Upgrades the running `cms-site` binary directly from the hosted CMS server or public download directory:

```bash
# Check if an update is available without applying
cms-site upgrade --check

# Self-upgrade from hosted CMS API server (default: http://localhost:3000)
cms-site upgrade --url https://cms.internal.company.corp

# Force re-download and replacement even if already at latest version
cms-site upgrade --force
```

#### Windows & Unix Safe Atomic Swap:
- Downloads incoming binary to `.tmp.exe`.
- On Windows, safely renames active binary to `.old.exe` (bypassing Windows running executable file locks), moves `.tmp.exe` into place, and cleans up old artifacts.
- On Unix / macOS, ensures `chmod 0755` executable bit before atomic rename.

---

## 🔒 Security & Deployment Scope

- **Internal Company Deployment**: Built exclusively for internal enterprise documentation distribution. No public multi-tenant SaaS features, billing gateways, or subscription tiers.
- **Non-Elevated Scope**: Installs strictly to `HKEY_CURRENT_USER` (no UAC / elevation prompts).
- **Network Isolation**: Binds by default to `127.0.0.1`. When running with `--network`, use `--cors-origin` to restrict cross-origin access.
