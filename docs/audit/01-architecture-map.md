# 01 - Architecture Map & Cross-Crate Analysis

**Workspace:** `cms-rs-3` / `tatran0195/cms-rs-5`  
**Architecture Style:** Layered Hexagonal / Modular Monolith  
**Scope:** Internal Company Documentation Platform  

---

## 1. Crate Responsibility Matrix

The workspace is structured into 22 library crates and 2 application binary crates. The intended vs. actual responsibilities are detailed below:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            APPLICATIONS (Binaries)                          │
│     apps/api (HTTP API & Admin Server)      apps/runner (Standalone Worker) │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                              API & PRESENTATION                             │
│     crates/cms-api (REST Handlers)          crates/cms-sites (Public Reader)│
│     crates/cms-middleware (Tower Middlewares, Security, CORS)               │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                                BUSINESS LOGIC                               │
│     crates/cms-biz (Services: Page, Project, Branch, Git, OpenAPI, etc.)    │
│     crates/cms-worker (Job Handlers: Publish, Git, Export, Indexing)        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                           CROSS-CUTTING DOMAIN SERVICES                     │
│  cms-auth (AuthN)        cms-authz (ReBAC)         cms-authz-gate (Guards)  │
│  cms-api-keys (Keys)     cms-oauth (OAuth2)        cms-mfa (TOTP)           │
│  cms-search (Tantivy)    cms-storage (S3/Disk)     cms-queue (Postgres/Mem) │
│  cms-analytics (Events)  cms-mailer (Email)        cms-mcp (AI Agent MCP)   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                            DATA & INFRASTRUCTURE                            │
│     crates/cms-db (SQLx Pool & Queries)    crates/cms-entity (Models & DTOs)│
│     crates/cms-config (Config Loader)      crates/cms-error (Error Taxonomy)│
│     crates/cms-i18n (Localization)                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Detailed Responsibility Table

| Crate | Layer | Declared Purpose | Actual Observed Behavior | Responsibility Adherence |
|---|---|---|---|---|
| `cms-entity` | Domain Core | Pure data models, DTOs, Enums | Contains domain structs and `ts-rs` export derive macros. Mostly clean. | **High** |
| `cms-error` | Infrastructure | Cross-cutting error types | Maps domain errors to HTTP statuses and redacts database internals with UUID correlation IDs. | **High** |
| `cms-config` | Infrastructure | Configuration loading | Loads TOML and ENV configurations. Pure configuration domain. | **High** |
| `cms-db` | Persistence | Database connection pools & queries | Wraps SQLx Postgres pools, transactions, and migration execution. | **High** |
| `cms-auth` | Security | In-process user authentication | Handles password hashing (Argon2), JWT issue/verify, and session cookies. | **High** |
| `cms-authz` | Security | Zanzibar-style authorization | Implements relationship-based access control engine (`Tuple`, `Relation`, `Role`). | **High** |
| `cms-authz-gate` | Security | Axum authorization middleware | Provides `require_project_access`, `require_parent_access`, and permission extractors. | **High** |
| `cms-biz` | Domain Service | Core business orchestration | Orchestrates projects, pages, branches, git operations, and search. **Defect:** Discards `user_id` in several services and fails to enqueue background jobs. | **Medium** (Logic leaks and missing enqueues) |
| `cms-api` | Transport/HTTP | Axum HTTP routes and handlers | Maps HTTP requests to `cms-biz` calls. **Defect:** Exposes standalone routes that bypass `cms-authz-gate`. | **Medium** (Dual-router bypasses) |
| `cms-worker` | Asynchronous | Job processing workers | Implements job runners for `Publish`, `Git`, `Export`. **Defect:** Underutilized because services do not enqueue `Git` and `Export` jobs. | **Medium** (Disconnected from callers) |
| `cms-sites` | Presentation | Public documentation viewer | Serves rendered HTML/markdown for published sites. | **High** |
| `apps/api` | Composition | HTTP Server binary | Initializes configuration, database pools, search engine, storage backends, and starts Axum. | **High** |
| `apps/runner` | Composition | Dedicated worker binary | Initializes connection pools and runs background queue workers independently. | **High** |

---

## 2. Dependency Flow and Integrity

The dependency graph strictly adheres to the rule:
`cms-api` → `cms-biz` → `cms-db` / `cms-entity`.

No circular crate dependencies exist in `Cargo.toml`. However, conceptual coupling and boundary leaks were observed:
1. **Direct SQLx leakage into Handlers:** Certain handlers (e.g., `crates/cms-api/src/project/handlers/members.rs`) execute raw SQL queries (`sqlx::query!`) directly instead of delegating to `cms-biz` or `cms-db`.
2. **Entity Duplication across Crates:** `cms-entity` defines core types, but `cms-biz` and `cms-api` occasionally define duplicate ad-hoc DTO request/response structs.

---

## 3. Application Entry Points and Lifecycles

### 3.1 HTTP Server (`apps/api/src/main.rs`)

1. **Initialization:**
   - Initializes `tracing_subscriber` with JSON or text format.
   - Loads configuration via `cms_config::AppConfig::load()`.
   - Initializes SQLx Postgres connection pool with connection timeouts and max pool limits.
   - Runs database migrations via `cms_db::run_migrations(&pool)`.
   - Initializes storage backend (`LocalStorage` or `S3Storage`).
   - Initializes Tantivy search indexer and FastEmbed vector engine.
   - Instantiates `BizContext` containing services.
   - Starts embedded worker task (`cms_worker::start_embedded_worker(...)`) if enabled in config.
2. **Router Composition:**
   - Mounts `/api` (REST API via `cms_api::create_router(biz_context)`).
   - Mounts `/sites` (Public documentation reader via `cms_sites::create_router(...)`).
   - Mounts `/health` and `/ready` probes.
   - Applies security middleware: `SecurityHeaders`, `TraceLayer`, `CorsLayer`, `TimeoutLayer` (30s), `DefaultBodyLimit` (25MB).
3. **Graceful Shutdown:**
   - Listens for `SIGINT` / `SIGTERM`.
   - Axum drain completes in-flight HTTP requests.
   - Signals background worker cancellation tokens and awaits completion.

### 3.2 Standalone Runner (`apps/runner/src/main.rs`)

- Initializes DB pool and configuration.
- Instantiates `cms_worker::WorkerPool`.
- Polls `cms_queue::JobQueue` for pending jobs with exponential backoff and lease renewals.
- Executes jobs concurrently up to `concurrency_limit`.

---

## 4. Request and Background Job Lifecycles

### 4.1 Request Lifecycle (Standard Project-Scoped vs Standalone)

#### Intended / Project-Scoped Route (`/api/projects/:project_id/pages`):
```
Client Request
      │
      ▼
Tower Middleware (Trace, CORS, Security Headers, 30s Timeout, BodyLimit)
      │
      ▼
AuthExtractor (Session Cookie / Bearer Token / API Key) ──► Validates Principal
      │
      ▼
cms-authz-gate (`require_project_access`) ──► Checks (User, Relation, Project)
      │
      ▼
Handler (`create_page_handler`) ──► Validates DTO
      │
      ▼
cms-biz (`PageService::create_page`) ──► Enforces Domain Rules
      │
      ▼
cms-db / SQLx ──► Transaction / Insert
      │
      ▼
Response (Sanitized JSON / Error Redaction)
```

#### Defective Standalone Route (`/api/pages/:page_id`):
```
Client Request (e.g. GET /api/pages/1234-5678-...)
      │
      ▼
AuthExtractor ──► Validates Principal (Authenticates ANY valid user)
      │
      ▼
[MISSING cms-authz-gate] ──► NO parent check! NO project check!
      │
      ▼
Handler (`get_page_handler`) ──► Calls PageService::get_page(page_id, user_id)
      │
      ▼
PageService ──► Ignores user_id! (let _ = user_id;)
      │
      ▼
cms-db ──► SELECT * FROM "Page" WHERE id = $1
      │
      ▼
Returned to Client! (CRITICAL BOLA / IDOR DATA LEAK)
```

### 4.2 Background Job Lifecycle & Disconnection

```
[Trigger Event] (User clicks "Sync Git" or "Export PDF")
      │
      ▼
Handler calls Service (`GitService::create_sync_op` / `ExportService::create_job`)
      │
      ▼
Database INSERT ──► Records status = 'Pending'
      │
      ✖ [DISCONNECTED CALL] ──► Never calls `job_queue.enqueue(...)`!
      │
      ▼
Worker Pool (`cms-worker`) ──► Polls queue, but queue is EMPTY!
      │
      ▼
Result: Job remains permanently in 'Pending' state.
```

---

## 5. Duplicate and Conflicting Implementations

1. **Dual Routing Trees:**
   - Project-scoped routes: `/api/projects/{project_id}/pages`
   - Standalone routes: `/api/pages/{page_id}`
   - *Conflict:* The standalone routes duplicate functionality but omit authorization.
2. **Duplicate Member Role Representations:**
   - Database constraint: `CHECK (role IN ('owner', 'member'))` with custom roles in `Role` table referenced by `role_id`.
   - Handler model: `enum MemberRole { Owner, Admin, Editor, Viewer }` serialized directly as lowercase string into `role`, violating schema constraints.
3. **Queue Enqueueing Discrepancy:**
   - Deployment publishing explicitly calls `job_queue.enqueue(JobType::Publish)`.
   - Git and Export operations only write to DB tables without enqueueing.

---

## 6. Recommended Target Architecture

1. **Unify Page and Branch Authorization via Parent Gates:**
   - Mandate `cms_authz_gate::require_parent_access` on all standalone endpoints (`/pages/:id`, `/branches/:id`, `/comments`) using `ParentLink::Page(id)` and `ParentLink::Branch(id)`.
2. **Normalize Domain Service Layer:**
   - Enforce authorization checks inside `cms-biz` or ensure all access is mediated by verified `AuthzContext` before calling persistence.
3. **Complete Asynchronous Pipeline:**
   - Wire `JobQueue::enqueue` directly into `GitService::trigger_sync` and `ExportService::request_export`.
4. **Isolate Heavy Search Operations:**
   - Move project reindexing from synchronous HTTP handlers to `JobType::Search` background worker tasks.
