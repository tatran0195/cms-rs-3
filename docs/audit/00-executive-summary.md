# 00 - Executive Summary: Rust/Axum Workspace Audit

**Target Platform:** Internal Company Deployment (Exclusive Internal Use)  
**Date:** October 2026  
**Repository:** `cms-rs-3` / `tatran0195/cms-rs-5`  
**Toolchain:** Rust 1.85.0 / Edition 2021 / Windows x86_64  

---

## 1. Workspace Inventory

The workspace is an Axum-based content management and documentation publishing system deployed exclusively for internal company use. The workspace consists of **24 packages** (22 internal library crates and 2 application binary crates) configured with Cargo resolver `2`.

| Package / Crate | Directory | Type | Core Responsibility |
|---|---|---|---|
| `cms-config` | `crates/cms-config` | Library | Strongly typed configuration loader (TOML/environment variables) |
| `cms-error` | `crates/cms-error` | Library | Unified error types, HTTP status mapping, and sanitized client responses |
| `cms-i18n` | `crates/cms-i18n` | Library | Internationalization and localization message catalog |
| `cms-entity` | `crates/cms-entity` | Library | Core domain models, enums, DTOs, and TypeScript type bindings (`ts-rs`) |
| `cms-db` | `crates/cms-db` | Library | Database connection pool lifecycle and repository persistence layer |
| `cms-auth` | `crates/cms-auth` | Library | In-process password hashing (Argon2), JWT token generation, session cookies |
| `cms-authz` | `crates/cms-authz` | Library | Relationship-based authorization engine (ReBAC / Zanzibar-style relations) |
| `cms-authz-gate` | `crates/cms-authz-gate` | Library | Axum authorization middleware guards and parent resource permission checkers |
| `cms-api-keys` | `crates/cms-api-keys` | Library | Scoped API key generation, hashing (`cms_live_...`), and verification |
| `cms-mfa` | `crates/cms-mfa` | Library | Time-based one-time password (TOTP) multi-factor authentication |
| `cms-oauth` | `crates/cms-oauth` | Library | OAuth2 integrations (Google, GitHub, GitLab, Okta, Microsoft) |
| `cms-storage` | `crates/cms-storage` | Library | Pluggable object storage backends (Local disk and AWS S3) |
| `cms-search` | `crates/cms-search` | Library | Embedded search engine (Tantivy FTS and FastEmbed vector embeddings) |
| `cms-queue` | `crates/cms-queue` | Library | Durable database-backed and memory job queue implementations |
| `cms-analytics` | `crates/cms-analytics` | Library | In-process or ClickHouse event capture and query aggregation |
| `cms-mcp` | `crates/cms-mcp` | Library | Model Context Protocol server endpoints for AI agent tool execution |
| `cms-biz` | `crates/cms-biz` | Library | Core business services (Pages, Projects, Branches, Git, Search, OpenAPI) |
| `cms-sites` | `crates/cms-sites` | Library | Public reader viewer for published documentation sites |
| `cms-api` | `crates/cms-api` | Library | REST API routes, HTTP handlers, request validators, and DTO mapping |
| `cms-worker` | `crates/cms-worker` | Library | Background job runner (Publishing, Git sync, Exports, Search index) |
| `cms-middleware` | `crates/cms-middleware` | Library | Tower/Axum middleware (Security headers, CORS, tracing, rate limits) |
| `cms-mailer` | `crates/cms-mailer` | Library | Transactional email delivery (SMTP, Postmark, Resend, Mock) |
| `cms-server` (`api`) | `apps/api` | Binary | Main HTTP application entry point, composition root, and graceful shutdown |
| `cms-runner` (`runner`) | `apps/runner` | Binary | Dedicated standalone background worker binary |

---

## 2. Actual Verification Baseline

All baseline commands were executed against the checked-out source code:

| Command | Status | Result / Findings | Operational Impact |
|---|---|---|---|
| `cargo metadata --format-version 1` | **Passed** | Clean graph resolution across all 24 packages. | No resolution errors. |
| `cargo check --workspace --all-targets` | **Passed** | Clean compilation. Emitted non-fatal `ts-rs` serde attribute parse warnings. | Build passes; TS types need attribute cleanup. |
| `cargo fmt --all -- --check` | **Failed** | Formatting diffs in `apps/api/src/app_state.rs`, `crates/cms-i18n/src/locale.rs`, `crates/cms-oauth/src/lib.rs`, and `crates/cms-sites/src/handlers.rs`. Nightly-only flags in `rustfmt.toml`. | Code formatting drift across 4 files. |
| `cargo tree --workspace -d` | **Warning** | Duplicate crates detected: `tower-http` (0.6.11 vs 0.7.0), `unicode-width` (0.1.14 vs 0.2.2), `windows-sys` (0.59.0 vs 0.61.2), `zeroize` (1.8.1 vs 1.9.0). | Minor binary bloat; no ABI conflicts. |
| `cargo test --workspace` (concurrent) | **Failed (OS 1455)** | Concurrent linking of 24 test binaries exhausted Windows paging file memory. | **Workaround:** Always run with `-j 2` or per-crate. |
| `cargo test -p <crate> -j 2` | **Passed** | `cms-error` (6/6), `cms-authz` (2/2), `cms-authz-gate` (3/3), `cms-api-keys` (3/3), `cms-auth` (16/16). E2E integration tests in `cms-api` are marked `#[ignore]` requiring disposable Postgres. | Unit logic verified; DB E2E tests require Postgres instance. |
| `cargo clippy -p cms-error -j 2 -- -D warnings` | **Passed** | 0 warnings. | Baseline compiler hygiene verified on core crates. |

---

## 3. Top Confirmed Correctness and Security Risks

### 1. Broken Object-Level Authorization (BOLA/IDOR) on Standalone `/pages` and `/branches`
- **Location:** `crates/cms-api/src/page/handlers.rs` (lines 118–195), `crates/cms-api/src/branch/handlers.rs` (lines 89–188).
- **Risk:** While `/projects/{project_id}/pages` enforces `authorize_project`, the standalone `/pages/{page_id}` and `/branches/{branch_id}` endpoints (mounted at `/api/pages`, `/api/app/pages`, `/api/v1/pages`) only verify that a user has a valid session token. They perform **no project ownership or authorization checks**. `PageService` and `BranchService` ignore the `user_id` parameter. Any authenticated user in the internal company network can view, modify, or delete any page or branch across any project by ID.
- **Severity:** **Critical (P0)**.

### 2. Unauthenticated Project Member Privilege Escalation and Deletion
- **Location:** `crates/cms-api/src/project/handlers/members.rs` (lines 140–200).
- **Risk:** `update_project_member_role_handler` and `remove_project_member_handler` completely omit project authorization checks (the auth context is extracted but unused). Any authenticated user can modify user roles or remove project owners from projects they do not belong to.
- **Severity:** **High (P0)**.

### 3. Complete Absence of Authorization on Project Integrations
- **Location:** `crates/cms-api/src/project/handlers/integrations.rs` (lines 47–248).
- **Risk:** All 5 integration handlers (`list`, `create`, `update`, `delete`, `verify`) omit `cms_authz_gate::require_project_access`. Any internal user can create external webhook integrations or trigger arbitrary POST verification requests without permission.
- **Severity:** **High (P0)**.

### 4. Database Check Constraint Violation on Project Member Role Updates (HTTP 500)
- **Location:** `crates/cms-api/src/project/handlers/members.rs` (lines 146–160) vs migration `20260114000000_custom_roles_and_project_members.sql`.
- **Defect:** The database enforces `CHECK (role IN ('owner', 'member'))`. When updating roles, the handler sets `role` to strings such as `"editor"` or `"admin"`, triggering an immediate database constraint violation and returning HTTP 500. Custom roles must instead be linked via `role_id`.
- **Severity:** **High (P1)**.

### 5. Disconnected Background Workers (Silent Async Operation Loss)
- **Location:** `crates/cms-biz/src/git.rs` (lines 121–129), `crates/cms-biz/src/export.rs` (lines 106–109), `crates/cms-biz/src/deployment.rs` (lines 55–58).
- **Defect:** When a user initiates a Git sync operation or an export job, the service inserts a row with `Pending` status into the database but **never enqueues the job** into `job_queue`. The jobs remain permanently in `Pending` and are never executed by `cms-worker`. Only `JobType::Publish` was actively wired to the queue.
- **Severity:** **High (P1)**.

### 6. Synchronous Reindexing on Async Request Thread (Denial of Service Vector)
- **Location:** `crates/cms-api/src/project/handlers/search.rs` (lines 357–385) and `crates/cms-biz/src/search.rs` (lines 274–310).
- **Defect:** `reindex_project_search_handler` lacks authorization and iterates through every page in the project synchronously inside the HTTP handler, computing vector embeddings and disk writes directly on the Tokio runtime thread. This blocks worker threads, causing HTTP request timeouts and server unresponsiveness.
- **Severity:** **Medium (P1)**.

---

## 4. Highest-Impact Architectural Problems

1. **Dual Route Exposure & Split Authorization Logic:**
   The application exposes two parallel routing structures: `/api/projects/{project_id}/...` and `/api/...` (standalone routes for pages, branches, comments). While the project-scoped routes implement relationship authorization via `cms-authz-gate`, the standalone routes completely bypass authorization.
2. **Business Services Bypassing Domain Boundaries:**
   `PageService`, `BranchService`, and `CommentService` in `cms-biz` accept a `user_id` parameter in their signatures but discard it (`let _ = user_id;`), failing to enforce multi-tenant isolation or ownership checks at the domain service layer.
3. **Queue Interface Fragmentation:**
   Job types (`Git`, `Export`, `Search`, `Email`) are defined in `cms-entity` and handlers exist in `cms-worker`, but business services create database records without publishing queue events, resulting in disconnected asynchronous workflows.

---

## 5. Production-Readiness Blockers

1. **Security Vulnerabilities:** Standalone BOLA/IDOR on pages and branches must be patched by enforcing parent-link authorization gates or routing through project endpoints.
2. **Access Control Gaps:** Project members and integrations handlers must enforce project admin/owner relations.
3. **Database Runtime Errors:** Member role update logic must map to the database schema (`owner`/`member` vs `role_id`).
4. **Asynchronous Reliability:** Git sync and export operations must be wired to `JobQueue::enqueue`.
5. **Memory Constraint on Windows:** Full workspace test compilation must be managed with bounded concurrency (`-j 2`) in CI pipelines.

---

## 6. Key Unknowns and Environmental Limitations

- **E2E Test Execution:** E2E integration tests in `crates/cms-api/tests` require a live PostgreSQL database instance and are skipped during standard `cargo test`.
- **Search Embeddings Model:** Tantivy full-text search runs in-process; FastEmbed vector embedding requires onnxruntime binaries when vector search is enabled.
