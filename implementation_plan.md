# Implementation Plan: Rust-Native Re-Engineering of `cms-rs-3`

---

# 1. Recommended Direction

The core problem of `cms-rs-3` is not that Rust is difficult or verbose; it is that the codebase was ported as **syntax-level translation of a Node.js/TypeScript application**. It carries JavaScript runtime idioms into a compiled systems language: untyped JSON dictionaries (`serde_json::Value`), stringly-typed IDs (`pub type Id = String`), anemic models traversing 6 object conversion hops, sequential $N+1$ query chains masquerading as ORM navigation, and a single monolithic catch-all error enum (`AppError`).

### Critical Corrections to Prior Audit Assumptions
Before locking the architecture, empirical inspection of the codebase invalidates three prior audit assumptions:
1. **The `project_members` table does not exist in PostgreSQL.** The prior audit claimed project role evaluation bypassed a `project_members` table. Inspection of `migrations/` reveals tenancy is strictly hierarchical: projects belong to an `Organization`, and users belong to an `Organization` with a `MemberRole` (`Owner`, `Admin`, `Member`, `Guest`). Authorization must check membership in the project's owning organization, not a nonexistent table.
2. **Deleting `/api/app/*` routes immediately will break the frontend.** `apps/studio` explicitly issues requests to `/api/app/projects/...`. A naive route deletion causes instant 404 outages. Canonical routes must be `/api/v1/*`, while `/api/app/*` is preserved as a zero-cost routing alias until frontend client migration.
3. **Migrating PostgreSQL column types from `TEXT` to native `UUID` on live data is high-risk and premature.** Altering primary and foreign key columns across 30+ tables requires exclusive table locks and schema rewrites. In Rust, nominal newtypes (`ProjectId(pub Uuid)`) can bind and parse to text columns transparently via `sqlx::Type` and `FromStr`. We achieve 100% compile-time type safety in Rust today with zero risk of database schema disruption.

### The Rust-Native Target
We will transform `cms-rs-3` into an idiomatic Rust service:
* **Strong Type Invariants:** Resource IDs are nominal types (`ProjectId`, `OrgId`, `UserId`). Mismatched parameters fail at compile time.
* **Typed API Boundaries:** All 200+ handlers replace dynamic `serde_json::Value` with strongly typed Serde DTOs and `ValidatedJson<T>`.
* **Relational Query Consolidation:** Replace 4-hop sequential query chains with single parameterized SQL `JOIN`s.
* **Direct Projections:** Database reads deserialize directly into domain models or response DTOs, eliminating intermediate row-mapping structs.
* **Structured Errors:** Domain operations return scoped `DomainError` enums (`thiserror`), converted cleanly to RFC 7807 Problem Details at the HTTP boundary.
* **Predictable Concurrency & Lifecycle:** Background jobs run with a transactional outbox over PostgreSQL; in-memory caches use lock-free striped primitives; tasks are cleanly supervised.

---

# 2. Target Architecture

```text
                                HTTP Client / Ingress
                                          │
                                          ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │ AXUM HTTP SERVER (apps/api)                                                 │
 │                                                                             │
 │ ┌─ Tower Middleware Stack ────────────────────────────────────────────────┐ │
 │ │  • TraceLayer (Distributed OpenTelemetry spans)                         │ │
 │ │  • SecurityHeadersLayer (HSTS, CSP, X-Frame-Options)                    │ │
 │ │  • CorsLayer (Validated admin allow-list)                               │ │
 │ │  • RateLimiterLayer (Keyed governor token-bucket, non-blocking)         │ │
 │ │  • TimeoutLayer & CatchPanicLayer                                       │ │
 │ └─────────────────────────────────────────────────────────────────────────┘ │
 │                                        │                                    │
 │                                        ▼                                    │
 │ ┌─ Routing & API Layer (crates/cms-api) ──────────────────────────────────┐ │
 │ │  • Canonical API: /api/v1/{domain}                                      │ │
 │ │  • Legacy Compat Aliases: /api/app/{domain}                             │ │
 │ │  • Typed Extractors: Extension(AuthSession), ValidatedJson<T>, Path<Id> │ │
 │ │  • Response Envelopes: Json(ApiResponse<T>)                             │ │
 │ └──────────────────────────────────────┬──────────────────────────────────┘ │
 └────────────────────────────────────────┼────────────────────────────────────┘
                                          │
                                          ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │ APPLICATION OPERATIONS & DOMAIN LAYER (crates/cms-domain / cms-biz)         │
 │                                                                             │
 │  • Strongly typed operations: ProjectOps, PageOps, DeploymentOps            │
 │  • Nominal Identifiers: ProjectId, OrgId, UserId, PageId, BranchId          │
 │  • TenantContext: Guaranteed OrgId scoping on every tenant mutation         │
 │  • Scoped Domain Errors: ProjectError, AuthError, PageError (thiserror)     │
 │  • Transaction Boundaries: Explicit &mut sqlx::Transaction<'_, Postgres>   │
 └───────────────────┬────────────────────────────────────────┬────────────────┘
                     │                                        │
                     ▼                                        ▼
 ┌──────────────────────────────────────┐  ┌───────────────────────────────────┐
 │ PERSISTENCE (crates/cms-db)          │  │ INFRASTRUCTURE (crates/cms-*)     │
 │                                      │  │                                   │
 │ • Direct Query Projections           │  │ • cms-queue: Postgres Job Outbox  │
 │ • Relational JOINs (No N+1)          │  │ • cms-storage: Local / S3         │
 │ • Parameterized SQLx queries         │  │ • cms-search: Tantivy FTS Engine  │
 │ • Invariant enforcement in Postgres  │  │ • cms-mailer: Lettre + MiniJinja  │
 └───────────────────┬──────────────────┘  └──────────────────┬────────────────┘
                     │                                        │
                     ▼                                        ▼
 ┌──────────────────────────────────────┐  ┌───────────────────────────────────┐
 │ POSTGRESQL DATABASE                  │  │ BACKGROUND WORKERS (cms-worker)   │
 │                                      │  │                                   │
 │ • Tables: users, sessions, projects  │  │ • Supervised by TaskTracker       │
 │ • Outbox table: CmsJob               │  │ • Typed JobPayload enum           │
 │ • Isolation: organization_id indices │  │ • FOR UPDATE SKIP LOCKED claims   │
 └──────────────────────────────────────┘  └───────────────────────────────────┘
```

### Crate Classification & Boundary Decisions

| Crate | Action | Rationale |
|---|---|---|
| `apps/api` | **KEEP** | Binary composition root. Initializes tracing, pool, worker supervision, and Axum listener. |
| `crates/cms-config` | **KEEP** | Strongly typed config parsing with TOML and env overrides. |
| `crates/cms-entity` | **REWRITE** | Replace cosmetic `pub type Id = String;` with nominal typed newtypes (`ProjectId`, `OrgId`, etc.). Add typed DTOs. |
| `crates/cms-error` | **REWRITE** | Replace 60-variant catch-all `AppError` with layered domain errors (`ProjectError`, `AuthError`) and RFC 7807 `ApiError`. |
| `crates/cms-db` | **REWRITE** | Remove duplicated `*Row` structs and manual `From` layers. Replace sequential $N+1$ calls with direct SQLx projections and relational `JOIN`s. |
| `crates/cms-biz` | **RENAME/REFACTOR** | Transition from unit structs with static functions to domain application operations receiving explicit `TenantContext` and `&mut Transaction`. |
| `crates/cms-api` | **REFACTOR** | Replace all `Json<serde_json::Value>` handlers with typed Serde DTOs, `ValidatedJson<T>`, and canonical `/api/v1` routes. |
| `crates/cms-auth` | **KEEP** | Argon2id hashing, session token lookup, and OAuth callbacks are solid. |
| `crates/cms-authz` | **REFACTOR** | Simplify to direct hierarchical check over `Member` table (`OrgId` + `UserId` + `MemberRole`). Remove unused abstractions. |
| `crates/cms-queue` | **IMPROVE** | Remove dormant in-memory/redis backends. Implement PostgreSQL transactional outbox enqueuing. |
| `crates/cms-worker` | **IMPROVE** | Supervise worker loop with `tokio_util::task::TaskTracker`. Replace `serde_json::Value` payload with typed `JobPayload` enum. |
| `crates/cms-storage` | **KEEP** | Object storage trait (local and S3) is functional. |
| `crates/cms-search` | **KEEP** | Tantivy Japanese/English FTS and fastembed are well-isolated in-process derived state. |
| `crates/cms-middleware` | **IMPROVE** | Replace custom `RwLock<HashMap>` rate limiter with native `governor::RateLimiter::keyed`. |
| `crates/cms-sites` | **IMPROVE** | Replace manual `RwLock` host cache with `moka::future::Cache`. |
| `crates/cms-mailer` | **KEEP** | MiniJinja + Lettre implementation is clean and tested. |
| `crates/cms-mcp` | **KEEP** | Isolated Model Context Protocol router. |
| `apps/runner` | **KEEP** | Portable SQLite reader binary. |

---

# 3. Non-Negotiable Architectural Rules

1. **Tenant Isolation:** Every tenant-owned database query MUST accept `TenantContext` (wrapping a verified `OrgId`) and include `WHERE organization_id = $1`. No handler may query child resources (`Project`, `Page`, `Analytics`) without tenant bounding.
2. **Nominal Identity:** All IDs must be distinct newtypes: `ProjectId(Uuid)`, `OrgId(Uuid)`, `UserId(Uuid)`, `PageId(Uuid)`. Passing an `OrgId` where a `ProjectId` is expected MUST fail at compile time.
3. **Database Authorization:** Access control checks must verify the actual resource being requested. In CMS, every project belongs to an organization; authorization must verify the user's role in that project's owning organization in a single query.
4. **Relational Atomic Invariants:** Multi-table mutations (e.g. project creation, publishing deployments) must execute inside a single PostgreSQL `sqlx::Transaction`. No partial commits with application-level "repair loops".
5. **No Dynamic API Envelopes:** No handler may declare request or response bodies as `serde_json::Value`. Every endpoint contract must be a statically typed Rust struct deriving `Serialize` or `Deserialize`.
6. **Error Sanitization:** Low-level database errors (`sqlx::Error`) and internal file paths must NEVER reach the HTTP client. They must be logged via `tracing::error!` with an error ID, returning generic RFC 7807 responses.
7. **No Blocking Operations in Async Handlers:** No synchronous file I/O (`std::fs`) or CPU-heavy hashing (Argon2 on unauthenticated routes) inside Tokio worker threads. Use `tokio::fs`, `tokio::task::spawn_blocking`, or pre-authenticated routes.
8. **Durable Background Outbox:** Background jobs must be written to the `CmsJob` table within the same database transaction as the entity state change that triggered them.
9. **Derived Search State:** The Tantivy search index is derived read-only state. Database commits must never fail because the search indexer is slow or locked.
10. **Strict Anti-Hallucination Policy:** Code must reflect actual PostgreSQL schema columns and active crate APIs. No inventing tables (`project_members`) or crates.

---

# 4. Foundational Changes

The following four foundational changes must be implemented before refactoring domain features:

### Foundation 1: Nominal Identifier Types (`cms-entity::id`)
* **Why foundational:** Prevents cross-entity parameter confusion across all handlers, services, and queries.
* **Types Introduced:**
  ```rust
  #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
  #[serde(transparent)]
  pub struct ProjectId(pub uuid::Uuid);

  #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
  #[serde(transparent)]
  pub struct OrgId(pub uuid::Uuid);

  #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
  #[serde(transparent)]
  pub struct UserId(pub uuid::Uuid);

  #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
  #[serde(transparent)]
  pub struct PageId(pub uuid::Uuid);
  ```
  Each type implements `sqlx::Type<sqlx::Postgres>`, `sqlx::Encode`, `sqlx::Decode`, `std::fmt::Display`, and `std::str::FromStr`.

### Foundation 2: Explicit Tenant Context (`cms-domain::tenant`)
* **Why foundational:** Guarantees that every business operation possesses an authenticated user and an organization scope.
* **Types Introduced:**
  ```rust
  #[derive(Debug, Clone)]
  pub struct TenantContext {
      pub user_id: UserId,
      pub org_id: OrgId,
      pub role: MemberRole,
  }

  impl TenantContext {
      pub fn require_role(&self, min_role: MemberRole) -> Result<(), AuthzError> {
          if self.role >= min_role { Ok(()) } else { Err(AuthzError::Forbidden) }
      }
  }
  ```

### Foundation 3: Scoped Domain Errors & RFC 7807 Problem Details (`cms-error`)
* **Why foundational:** Eliminates database leakage while giving domain logic structured failure variants.
* **Types Introduced:**
  ```rust
  // In crates/cms-domain/src/project/error.rs
  #[derive(Debug, thiserror::Error)]
  pub enum ProjectError {
      #[error("Project '{0}' not found")]
      NotFound(ProjectId),
      #[error("Project slug '{0}' already exists")]
      SlugConflict(String),
      #[error("Access denied")]
      Forbidden,
      #[error("Database failure: {0}")]
      Database(#[from] sqlx::Error),
  }

  // In crates/cms-api/src/response.rs
  #[derive(Debug, serde::Serialize)]
  pub struct ProblemDetails {
      pub status: u16,
      pub code: &'static str,
      pub message: String,
      pub error_id: uuid::Uuid,
  }
  ```

### Foundation 4: Typed API Envelope & Validated Extractor (`cms-api::extractor`)
* **Why foundational:** Replaces raw `Json<serde_json::Value>` and manual dictionary parsing with compile-time schema validation.
* **Types Introduced:**
  ```rust
  #[derive(Debug, serde::Serialize)]
  pub struct ApiResponse<T> {
      pub data: T,
  }

  #[derive(Debug, Clone, Copy, Default)]
  pub struct ValidatedJson<T>(pub T);
  // Implements axum::extract::FromRequest, running validator::Validate::validate
  ```

---

# 5. Dependency Graph

```text
┌────────────────────────────────────────────────────────┐
│ Phase 0: Immediate Security & Isolation Hotfixes (P0)  │
│ • Fix Analytics Cross-Tenant Leak                      │
│ • Fix OpenAPI DNS Rebinding TOCTOU                     │
│ • Fix Webhook Secret Predictability                    │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ Phase 1: Foundational Type & Context Infrastructure    │
│ • Nominal Typed IDs (ProjectId, OrgId, UserId)         │
│ • TenantContext Extractor                              │
│ • Scoped Domain Errors & RFC 7807 Problem Details      │
│ • ValidatedJson<T> and ApiResponse<T> Envelopes        │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ Phase 2: First Vertical Slice Reference (Project)      │
│ • Full target architecture on Project Domain           │
│ • Consolidated atomic creation transaction             │
│ • Direct SQLx projection queries (No intermediate rows)│
│ • Integration test suite with sqlx::test               │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ Phase 3: High-Leverage Domain Migrations (Parallel)    │
│ ┌──────────────────────┐      ┌──────────────────────┐ │
│ │ Page & Navigation    │      │ Auth & Memberships   │ │
│ │ (Omit Content Blobs) │      │ (Hierarchical Roles) │ │
│ └──────────┬───────────┘      └──────────┬───────────┘ │
│            │                             │             │
│            ▼                             ▼             │
│ ┌──────────────────────┐      ┌──────────────────────┐ │
│ │ Deployment & Outbox  │      │ Analytics & Metrics  │ │
│ │ (Atomic Job Queue)   │      │ (SQL COUNT Aggregates│ │
│ └──────────────────────┘      └──────────────────────┘ │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ Phase 4: Infrastructure Crate Modernization            │
│ • Keyed Governor Rate Limiter (Lock-Free)              │
│ • Moka Concurrent Host Resolution Cache                │
│ • TaskTracker Worker Supervision                       │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ Phase 5: Legacy Node.js Clean-Up                       │
│ • Remove dead AppError billing variants                │
│ • Unify /api/app/* routes behind /api/v1/*             │
│ • Expunge unused dependencies (schemars)               │
└────────────────────────────────────────────────────────┘
```

---

# 6. First Vertical Slice: The Project Domain

### Selection: `Project`
The **Project** domain is selected as the first vertical slice because it exercises every architectural requirement:
1. It sits directly below `Organization` in the tenancy hierarchy.
2. It requires `TenantContext` and role authorization (`Owner`, `Admin`, `Member`).
3. It requires an **atomic multi-table transaction** (inserting `Project`, `Branch`, `Language`, and `ProjectSettings` in one commit).
4. It features unique constraint handling (slug allocation and collision retry).
5. It demonstrates how to replace `Json<serde_json::Value>` with typed DTOs.
6. It proves how direct SQLx projections eliminate the 6-hop object conversion cascade.

---

# 7. Reference Implementation Specification: Project Domain

### Directory Structure
```text
crates/cms-domain/src/project/
├── mod.rs                  # Domain re-exports
├── model.rs                # Pure domain structs & invariants
├── error.rs                # Scoped ProjectError enum
└── ops.rs                  # Application operations (ProjectOps)

crates/cms-db/src/project/
├── mod.rs                  # SQLx query module
└── queries.rs              # Parameterized SQLx projection queries

crates/cms-api/src/project/
├── mod.rs                  # Router mounting (/api/v1/projects)
├── dto.rs                  # Serde request/response DTOs + utoipa schemas
└── handlers.rs             # Axum HTTP handlers
```

### 1. Types & DTOs (`crates/cms-api/src/project/dto.rs`)
```rust
use validator::Validate;
use serde::{Deserialize, Serialize};
use cms_entity::id::{ProjectId, OrgId};

#[derive(Debug, Deserialize, Validate, utoipa::ToSchema)]
pub struct CreateProjectRequest {
    #[validate(length(min = 2, max = 64, message = "Project name must be 2-64 chars"))]
    pub name: String,
    #[validate(length(max = 256))]
    pub description: Option<String>,
    pub is_public: Option<bool>,
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct ProjectSummaryResponse {
    pub id: ProjectId,
    pub organization_id: OrgId,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub is_public: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
}
```

### 2. Domain Operation (`crates/cms-domain/src/project/ops.rs`)
```rust
pub struct ProjectOps;

impl ProjectOps {
    pub async fn create_project(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        ctx: &TenantContext,
        req: CreateProjectRequest,
    ) -> Result<ProjectSummaryResponse, ProjectError> {
        ctx.require_role(MemberRole::Admin)
            .map_err(|_| ProjectError::Forbidden)?;

        let base_slug = slugify(&req.name);
        
        // Execute atomic multi-table insertion in Postgres
        let project = ProjectQueries::insert_atomic(
            tx,
            ctx.org_id,
            &req.name,
            &base_slug,
            req.description.as_deref(),
            req.is_public.unwrap_or(false),
        ).await?;

        Ok(project)
    }
}
```

### 3. Database Projection (`crates/cms-db/src/project/queries.rs`)
```rust
pub struct ProjectQueries;

impl ProjectQueries {
    pub async fn insert_atomic(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        org_id: OrgId,
        name: &str,
        slug: &str,
        description: Option<&str>,
        is_public: bool,
    ) -> Result<ProjectSummaryResponse, sqlx::Error> {
        let project = sqlx::query_as!(
            ProjectSummaryResponse,
            r#"
            WITH new_proj AS (
                INSERT INTO "Project" (id, organization_id, name, slug, description, is_public, created_at, updated_at)
                VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, NOW(), NOW())
                RETURNING id, organization_id, name, slug, description, is_public, created_at
            ),
            new_branch AS (
                INSERT INTO "Branch" (id, project_id, name, is_default, created_at, updated_at)
                SELECT gen_random_uuid()::text, id, 'main', true, NOW(), NOW() FROM new_proj
            ),
            new_lang AS (
                INSERT INTO "Language" (id, project_id, code, name, is_default, created_at, updated_at)
                SELECT gen_random_uuid()::text, id, 'en', 'English', true, NOW(), NOW() FROM new_proj
            ),
            new_settings AS (
                INSERT INTO "ProjectSettings" (project_id, created_at, updated_at)
                SELECT id, NOW(), NOW() FROM new_proj
            )
            SELECT id as "id: ProjectId",
                   organization_id as "organization_id: OrgId",
                   name, slug, description, is_public, created_at
            FROM new_proj
            "#,
            org_id.0.to_string(),
            name,
            slug,
            description,
            is_public
        )
        .fetch_one(&mut **tx)
        .await?;

        Ok(project)
    }
}
```

### 4. HTTP Handler (`crates/cms-api/src/project/handlers.rs`)
```rust
pub async fn create_project_handler(
    State(state): State<Arc<AppState>>,
    ctx: TenantContext,
    ValidatedJson(req): ValidatedJson<CreateProjectRequest>,
) -> Result<Json<ApiResponse<ProjectSummaryResponse>>, ApiError> {
    let mut tx = state.pool.begin().await
        .map_err(ApiError::from)?;

    let project = ProjectOps::create_project(&mut tx, &ctx, req).await
        .map_err(ApiError::from)?;

    tx.commit().await
        .map_err(ApiError::from)?;

    Ok(Json(ApiResponse { data: project }))
}
```

---

# 8. Deferred Work

To prevent large-scale churn and broken dependencies, explicitly defer the following tasks until **after** the domain migration:

1. **Do NOT run PostgreSQL Column Type Migrations (`TEXT` to `UUID` on disk):** Defer until all Rust code uses typed newtypes and verified in production.
2. **Do NOT delete the `/api/app/*` route prefix:** Keep it as a secondary router mount or URL rewrite until frontend teams update API clients.
3. **Do NOT rewrite Tantivy search architecture:** The search crate works in-process and is already decoupled behind `SearchEngine`.
4. **Do NOT replace Local/S3 storage crates:** `cms-storage` is working, tested, and decoupled.
5. **Do NOT implement PostgreSQL Row-Level Security (RLS):** Application-level `TenantContext` enforcement with parameterized queries provides clear, debuggable isolation without database connection role churn.

---

# 9. Implementation Backlog

### Task 1: Fix Analytics Cross-Tenant Leakage (P0)
* **Problem:** `AnalyticsService::query_events` omits `org_id`, allowing any tenant admin to read events from other organizations.
* **Current:** [`crates/cms-biz/src/analytics.rs:55-65`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-biz/src/analytics.rs#L55-L65).
* **Target:** Mandatory `org_id: &str` parameter in `AnalyticsEventQueries::query` with `WHERE organization_id = $1`.
* **Files:** `crates/cms-biz/src/analytics.rs`, `crates/cms-db/src/analytics.rs`.
* **Dependencies:** None.
* **Implementation:** Add `org_id: &str` to `AnalyticsEventQueries::query`. Update SQL query builder with mandatory `organization_id = $1`. Pass `org_id` from `AnalyticsService::query_events`.
* **Tests:** Integration test calling `query_events` as Org A and verifying zero events from Org B are returned.
* **Verification:** `cargo test -p cms-biz -p cms-db`.
* **Risk:** Low.
* **Rollback:** Git revert.
* **Definition of Done:** `query_events` filters strictly by organization ID; integration test passes.

### Task 2: Pin Resolved IP in OpenAPI Sync to Block DNS Rebinding SSRF (P0)
* **Problem:** DNS lookup followed by unpinned `reqwest::get` enables TOCTOU DNS rebinding bypass.
* **Current:** [`crates/cms-biz/src/openapi.rs:267-293`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-biz/src/openapi.rs#L267-L293).
* **Target:** Resolve DNS once, validate against private IP blacklists, and pass pinned IP to `reqwest::ClientBuilder::resolve`.
* **Files:** `crates/cms-biz/src/openapi.rs`.
* **Dependencies:** None.
* **Implementation:** Construct client via `Client::builder().resolve(&host, SocketAddr::new(valid_ip, port)).build()`.
* **Tests:** Unit test asserting DNS resolution check rejects loopback, RFC 1918, and link-local addresses.
* **Verification:** `cargo test -p cms-biz test_fetch_openapi`.
* **Risk:** Low.
* **Rollback:** Git revert.
* **Definition of Done:** `reqwest` connects only to pre-validated IP address; tests pass.

### Task 3: Secure Webhook Secret Generation (P0)
* **Problem:** Secrets synthesized as `whsec_{conn.id}` are forgeable by anyone who knows the UUID.
* **Current:** [`crates/cms-api/src/project/handlers/git.rs:119, 201, 226`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-api/src/project/handlers/git.rs#L119).
* **Target:** 32 cryptographically secure random bytes formatted as hex: `whsec_{hex}`.
* **Files:** `crates/cms-api/src/project/handlers/git.rs`.
* **Dependencies:** None.
* **Implementation:** Use `rand::RngCore::fill_bytes` to generate 32 random bytes. Format as `format!("whsec_{}", hex::encode(bytes))`.
* **Tests:** Unit test verifying secret length, entropy, and unpredictability.
* **Verification:** `cargo test -p cms-api`.
* **Risk:** Low.
* **Rollback:** Git revert.
* **Definition of Done:** All generated webhook secrets use CSPRNG hex strings.

### Task 4: Introduce Nominal Typed Newtypes (P1)
* **Problem:** `pub type Id = String;` allows mixing up entity IDs across handlers and queries.
* **Current:** [`crates/cms-entity/src/common.rs:7`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-entity/src/common.rs#L7).
* **Target:** Create `ProjectId(Uuid)`, `OrgId(Uuid)`, `UserId(Uuid)`, `PageId(Uuid)` with Serde and SQLx support.
* **Files:** `crates/cms-entity/src/id.rs`, `crates/cms-entity/src/lib.rs`.
* **Dependencies:** Task 1–3 complete.
* **Implementation:** Define newtypes deriving `Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize`. Implement `sqlx::Type`, `sqlx::Encode`, `sqlx::Decode`.
* **Tests:** Unit tests verifying serialization to/from JSON and string parsing.
* **Verification:** `cargo test -p cms-entity`.
* **Risk:** Compilation breaks where types are adopted; adopt incrementally.
* **Rollback:** Git revert.
* **Definition of Done:** Newtypes exported and unit-tested in `cms-entity`.

### Task 5: Implement `TenantContext` & Authorization Simplification (P1)
* **Problem:** Project role evaluation proxies directly to organization role with redundant queries.
* **Current:** [`crates/cms-authz/src/lib.rs:121-136`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-authz/src/lib.rs#L121-L136).
* **Target:** Introduce `TenantContext` containing `user_id`, `org_id`, and `role`. Query `Member` table in a single check.
* **Files:** `crates/cms-authz/src/lib.rs`, `crates/cms-api/src/extractors/tenant.rs`.
* **Dependencies:** Task 4.
* **Implementation:** Create Axum extractor `TenantContext` that reads session, resolves organization ID from path or header, and checks role in one database query.
* **Tests:** Unit tests verifying access denial on mismatched tenant or insufficient role.
* **Verification:** `cargo test -p cms-authz`.
* **Risk:** Medium (affects extractor chain).
* **Rollback:** Git revert.
* **Definition of Done:** `TenantContext` available as Axum extractor; passes role check tests.

### Task 6: Implement Reference Vertical Slice: Project Domain (P1)
* **Problem:** Handlers use untyped `serde_json::Value`, manual dictionaries, and intermediate `Row` conversions.
* **Current:** [`crates/cms-api/src/project/handlers/core.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-api/src/project/handlers/core.rs).
* **Target:** Statically typed DTOs, `ValidatedJson`, atomic CTE insertion, and direct SQLx projection.
* **Files:** `crates/cms-api/src/project/`, `crates/cms-biz/src/project.rs`, `crates/cms-db/src/project.rs`.
* **Dependencies:** Task 4, Task 5.
* **Implementation:** Follow Section 7 specification.
* **Tests:** `sqlx::test` integration tests for project creation, slug uniqueness, and listing.
* **Verification:** `cargo test -p cms-api -p cms-biz -p cms-db`.
* **Risk:** Medium.
* **Rollback:** Git revert.
* **Definition of Done:** All project endpoints use typed DTOs and atomic CTE transactions; integration tests pass.

### Task 7: Page Navigation Projection & Omit Content Blobs (P1)
* **Problem:** Listing pages transfers full markdown content across the network.
* **Current:** [`crates/cms-db/src/page.rs:84-100, 310`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-db/src/page.rs#L84-L100).
* **Target:** Lightweight `PageNavSummary` query selecting only tree metadata; separate endpoint for page content.
* **Files:** `crates/cms-db/src/page.rs`, `crates/cms-api/src/project/handlers/pages.rs`.
* **Dependencies:** Task 6.
* **Implementation:** Create `PageNavSummary` struct. Update list query to omit `content`.
* **Tests:** Assert list query returns empty/omitted content field while get-by-id returns full markdown.
* **Verification:** `cargo test -p cms-db -p cms-api`.
* **Risk:** Low.
* **Rollback:** Git revert.
* **Definition of Done:** Page tree endpoints transfer zero markdown content bytes.

### Task 8: Relational Consolidation for Comments (P1)
* **Problem:** Comment lookups execute 4 sequential queries to verify permissions.
* **Current:** [`crates/cms-biz/src/comment.rs:55-74`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-biz/src/comment.rs#L55-L74).
* **Target:** Single query with SQL `JOIN`s (`Comment JOIN Page JOIN Project JOIN Member`).
* **Files:** `crates/cms-db/src/comment.rs`, `crates/cms-biz/src/comment.rs`.
* **Dependencies:** Task 6.
* **Implementation:** Implement `CommentQueries::get_with_auth` using relational `JOIN`.
* **Tests:** Test single-trip lookup with authorized and unauthorized users.
* **Verification:** `cargo test -p cms-db -p cms-biz`.
* **Risk:** Low.
* **Rollback:** Git revert.
* **Definition of Done:** Comment access verified in a single database round trip.

### Task 9: Upgrade Rate Limiter to Keyed Governor (P2)
* **Problem:** Global write lock `RwLock<HashMap>` causes thread contention.
* **Current:** [`crates/cms-middleware/src/rate_limit.rs:223`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-middleware/src/rate_limit.rs#L223).
* **Target:** `governor::RateLimiter::keyed` with lock-free concurrent checks.
* **Files:** `crates/cms-middleware/src/rate_limit.rs`.
* **Dependencies:** None.
* **Implementation:** Replace `Arc<RwLock<HashMap>>` with `governor::RateLimiter::keyed`.
* **Tests:** Concurrency test with 50 threads hammering rate limiter.
* **Verification:** `cargo test -p cms-middleware`.
* **Risk:** Low.
* **Rollback:** Git revert.
* **Definition of Done:** Zero mutex/RwLock acquisitions in rate limiter hot path.

### Task 10: Upgrade Host Resolution Cache to Moka (P2)
* **Problem:** Cache miss triggers $O(N)$ linear scans under exclusive lock.
* **Current:** [`crates/cms-sites/src/host_resolution.rs:295-305`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-sites/src/host_resolution.rs#L295-L305).
* **Target:** `moka::future::Cache` with automatic concurrent TinyLFU eviction.
* **Files:** `crates/cms-sites/src/host_resolution.rs`, `crates/cms-sites/Cargo.toml`.
* **Dependencies:** None.
* **Implementation:** Add `moka = { version = "0.12", features = ["future"] }`. Replace `cache: Arc<RwLock<HashMap>>` with `moka::future::Cache<String, HostResolutionResult>`.
* **Tests:** Cache insertion and expiry unit tests.
* **Verification:** `cargo test -p cms-sites`.
* **Risk:** Low.
* **Rollback:** Git revert.
* **Definition of Done:** Host resolution cache uses Moka without manual locking.

---

# 10. Work Classification Matrix

| Task | Priority | Lifecycle Stage |
|---|:---:|:---:|
| **Task 1: Fix Analytics Cross-Tenant Leak** | **P0** | **MUST DO BEFORE FEATURE MIGRATION** |
| **Task 2: Pin IP in OpenAPI Fetch (SSRF)** | **P0** | **MUST DO BEFORE FEATURE MIGRATION** |
| **Task 3: Secure Webhook Secret Generation** | **P0** | **MUST DO BEFORE FEATURE MIGRATION** |
| **Task 4: Nominal Typed IDs** | **P1** | **MUST DO BEFORE FEATURE MIGRATION** |
| **Task 5: TenantContext Extractor** | **P1** | **MUST DO BEFORE FEATURE MIGRATION** |
| **Task 6: Project Domain Reference Slice** | **P1** | **DO DURING FEATURE MIGRATION** |
| **Task 7: Page Navigation Projection** | **P1** | **DO DURING FEATURE MIGRATION** |
| **Task 8: Relational Comment Queries** | **P1** | **DO DURING FEATURE MIGRATION** |
| **Task 9: Keyed Governor Rate Limiter** | **P2** | **DO AFTER FEATURE MIGRATION** |
| **Task 10: Moka Host Resolution Cache** | **P2** | **DO AFTER FEATURE MIGRATION** |
| **Route Consolidation (/api/app to /api/v1)** | **P3** | **OPTIONAL (COORDINATED WITH FRONTEND)** |
| **Remove schemars Dependency** | **P3** | **DO AFTER FEATURE MIGRATION** |

---

# 11. Migration Checkpoints

### Checkpoint 1: Security & Tenancy Safe
* **Prerequisites:** Tasks 1, 2, and 3 complete.
* **Verification:** All P0 security regressions passing. Analytics query verified tenant-scoped. Webhook secrets unpredictable.

### Checkpoint 2: Rust-Native Foundation Established
* **Prerequisites:** Tasks 4 and 5 complete.
* **Verification:** `ProjectId` and `OrgId` newtypes compile across `cms-entity`. `TenantContext` extractor unit-tested.

### Checkpoint 3: Reference Slice Proven
* **Prerequisites:** Task 6 complete.
* **Verification:** `Project` domain refactored to target architecture. Zero `serde_json::Value` in project handlers. Integration tests pass against PostgreSQL with `sqlx::test`.

### Checkpoint 4: High-Leverage Domains Migrated
* **Prerequisites:** Tasks 7 and 8 complete.
* **Verification:** Navigation listing omits markdown blobs. Comment lookups use single-query SQL `JOIN`.

### Checkpoint 5: Infrastructure & Concurrency Modernized
* **Prerequisites:** Tasks 9 and 10 complete.
* **Verification:** Zero global mutex/RwLock bottlenecks in rate limiting and host resolution under concurrent load.

---

# 12. Verification Gates

Before declaring any phase complete, the following objective verification gates must pass:

```bash
# 1. Format & Lint Gate
cargo fmt --check
cargo clippy --workspace --all-targets --all-features -- -D warnings

# 2. Workspace Compilation Gate
cargo check --workspace --all-targets

# 3. Unit & Integration Test Suite
cargo test --workspace

# 4. Security Regression Test Gate
cargo test -p cms-biz test_fetch_openapi_rejects_private_and_loopback_ips
cargo test -p cms-api test_basic_auth_not_supported
cargo test -p cms-api test_webhook_secret_entropy
```

---

# 13. Risks & Mitigations

| Risk | Impact | Mitigation Strategy |
|---|---|---|
| **Breaking Frontend API Clients** | Frontend receives 404 or deserialization errors. | Retain `/api/app/*` as routing alias. Maintain exact JSON property names using `#[serde(rename_all = "camelCase")]` on all new DTOs. |
| **Compile-Time Churn from Typed IDs** | Widespread type mismatch errors during newtype rollout. | Introduce newtypes in `cms-entity` first; migrate one domain slice at a time using `ProjectId::from_str` at boundaries. |
| **Database Transaction Deadlocks** | Long-running transactions blocking other connections. | Keep transactions strictly scoped to database writes. Never execute outbound HTTP calls or heavy CPU work inside a transaction. |
| **SSRF False Positives** | Legitimate public URLs rejected. | Maintain standard RFC 1918, CGNAT, loopback, and link-local blacklist. Allow standard public domains with valid DNS records. |

---

# 14. Recommended First Coding Task

The exact first task to hand to the coding agent is:

### Task 1: Fix Analytics Cross-Tenant Leakage (P0)

* **Problem:** In [`crates/cms-biz/src/analytics.rs:55-65`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-biz/src/analytics.rs#L55-L65), `AnalyticsService::query_events` calls `AnalyticsEventQueries::query` without passing `org_id`. When `request.project_id` is omitted, the underlying query in [`crates/cms-db/src/analytics.rs:429-472`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-db/src/analytics.rs#L429-L472) selects events across **all organizations in the entire database**, leaking private telemetry across tenants.
* **Implementation Steps:**
  1. In `crates/cms-db/src/analytics.rs`, modify `AnalyticsEventQueries::query` to accept `org_id: &str` as its first query parameter.
  2. In `AnalyticsEventQueries::query`, add `organization_id = $1` as a mandatory `WHERE` clause condition in the SQL query builder.
  3. In `crates/cms-biz/src/analytics.rs`, pass `org_id` from `AnalyticsService::query_events` into `AnalyticsEventQueries::query`.
  4. In `crates/cms-biz/src/analytics.rs`, write a unit/integration test creating events for two different organizations and asserting that querying as Org A never returns Org B's events.
* **Verification Command:**
  ```bash
  cargo test -p cms-biz -p cms-db
  ```
* **Definition of Done:** `AnalyticsEventQueries::query` requires `org_id`; SQL query enforces `organization_id = $1`; test proves zero cross-tenant leakage; clean compilation.