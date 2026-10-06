# Production Engineering & Security Audit Report

**Target:** `cms-rs-3` Axum Backend Workspace  
**Auditor:** Principal Backend, Security & Distributed Systems Architect  
**Evaluation Standard:** Enterprise Production Readiness Under Hostile & High-Concurrency Conditions  
**Primary Verdict:** **UNFIT FOR PRODUCTION** — Contains critical security vulnerabilities (SSRF, Auth DoS), fake/disconnected business operations, severe check-then-act race conditions, deadlocked shutdown ordering, and broken concurrency primitives.

---

## A. Executive Summary

This backend codebase displays a recurring pattern of **AI-generated scaffolding: syntactically clean, compiling Rust with strong modular intentions, masking severe structural gaps, fake business logic, and critical operational failure modes.**

### What Is Production-Ready
* **Data Model Primitives & Schema:** Core SQL migrations in [`crates/cms-db/migrations`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-db/migrations) have solid foundation tables (organizations, users, projects, pages, branches) with foreign keys and unique constraints.
* **Basic CRUD Repositories:** Direct SQLx query modules (such as [`crates/cms-db/src/project.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-db/src/project.rs)) handle basic atomic transactions and parameterized inputs properly, preventing SQL injection on standard paths.
* **Core Password Hashing:** Argon2id implementation in [`crates/cms-auth/src/password.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-auth/src/password.rs) uses appropriate salt lengths and cost parameters.

### What Is Demo-Grade / Incomplete
* **Fake External Handlers & Integrations:** Critical settings endpoints—such as Mintlify and Ghost imports—are wired to a generic Git handler that performs no importing and returns synthesized success payloads. Integration health checks do not ping external APIs and return hardcoded success.
* **Disconnected Background Workers:** The worker runtime defines 8 job types (`Analytics`, `Email`, `Export`, `Git`, `Publish`, `Search`, `Usage`, `Reaper`), but the API only ever enqueues `Publish`. Git syncs create database records that remain in `Pending` indefinitely. Deployment creation in [`crates/cms-api/src/deployment/handlers.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-api/src/deployment/handlers.rs) literally leaves a comment `// Queue the deployment job for processing` and returns without calling the queue.
* **Faux RAG Search Engine:** When RAG is disabled (default in `config.toml`), the system falls back to a template that pastes raw search snippets under a heading claiming to be an AI summary.
* **Authorization Shortcuts:** Project role evaluation explicitly substitutes organization-wide membership as a "temporary proxy," completely bypassing the `project_members` permission matrix.

### What Is Dangerous (Production Blockers)
1. **Critical Unauthenticated / Arbitrary SSRF:** [`crates/cms-biz/src/openapi.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-biz/src/openapi.rs) makes unvalidated HTTP GET requests to user-supplied URLs using `reqwest`. There is no IP resolution, private network filtering (RFC 1918), or cloud metadata protection (`169.254.169.254`). Attackers can exfiltrate internal AWS/GCP credentials or intranet resources. Furthermore, it reads the entire response body into memory via `.text().await` *before* checking the 5MB boundary, enabling memory exhaustion DoS.
2. **CPU-Exhaustion DoS via Basic Auth Argon2 Re-Hashing:** [`crates/cms-api/src/auth/middleware.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-api/src/auth/middleware.rs) runs on every protected route. If a `Basic` auth header is passed, it executes full Argon2 password hashing on the Tokio thread pool with zero rate limiting or token caching. An unauthenticated attacker can saturate all CPU cores with a small stream of requests.
3. **Database Error & Infrastructure Leakage:** [`crates/cms-error/src/lib.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-error/src/lib.rs) formats raw `sqlx::Error` and `anyhow::Error` strings directly into client-facing JSON payloads, disclosing table schemas, foreign key names, internal file paths, and database query structures.
4. **Predictable Webhook Secret Generation:** [`crates/cms-api/src/project/handlers.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-api/src/project/handlers.rs#L3103) synthesizes secrets using `whsec_{conn.id}`. Any user who knows or guesses a connection UUID can forge webhook payloads.
5. **Flawed Shutdown Deadlock:** In [`apps/api/main.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/apps/api/main.rs#L163-L170), the Axum graceful shutdown signal future awaits worker background tasks *before* the server stops accepting incoming HTTP requests. If incoming requests queue new work while the worker is stopping, the server hangs or drops active connections abruptly.

---

## B. Architecture Map

```text
                                HTTP Client / Ingress
                                         │
                                         ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │ AXUM HTTP SERVER (apps/api/main.rs)                                         │
 │                                                                             │
 │ ┌─ Global Middleware Layer (crates/cms-middleware) ───────────────────────┐ │
 │ │  • RequestIdLayer (x-request-id)                                        │ │
 │ │  • SecurityHeadersLayer (HSTS, CSP, X-Frame-Options)                    │ │
 │ │  • ObservabilityMiddleware (Tracing span + In-Memory Prometheus Recorder)│ │
 │ │  • CorsLayer (Permissive localhost fallback)                            │ │
 │ │  • RateLimiterLayer (Global RwLock write contention bottleneck)          │ │
 │ └─────────────────────────────────────────────────────────────────────────┘ │
 │                                       │                                     │
 │                                       ▼                                     │
 │ ┌─ Routing & API Gateway (crates/cms-api) ────────────────────────────────┐ │
 │ │  • Public Routes: /api/v1/auth/*, /health                               │ │
 │ │  • Auth Extractors: Cookie session OR Basic Auth (Argon2 CPU DoS)       │ │
 │ │  • Protected Handlers: Project (84 endpoints), Page, Deployment, etc.   │ │
 │ └─────────────────────────────────────────────────────────────────────────┘ │
 └───────────────────────────────────────┬─────────────────────────────────────┘
                                         │
                                         ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │ BUSINESS & DOMAIN SERVICES (crates/cms-biz)                                 │
 │                                                                             │
 │  • AuthService       • ProjectService     • PageService                     │
 │  • GitService (Stub) • DeploymentService  • OpenApiService (SSRF Vulnerable)│
 │                                       │                                     │
 │  ┌─ Authorization (crates/cms-authz) ─┴───────────────────────────────────┐ │
 │  │  • Org Role Check (Active)                                             │ │
 │  │  • Project Role Check (Bypassed: proxies directly to Org Role)         │ │
 │  └────────────────────────────────────────────────────────────────────────┘ │
 └───────────────────────────────────────┬─────────────────────────────────────┘
                                         │
                                         ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │ PERSISTENCE & INFRASTRUCTURE (crates/cms-db, cms-queue, cms-storage)        │
 │                                                                             │
 │  • Sqlx Postgres Pool (50 max connections)                                  │
 │  • PostgresJobQueue (Table: background_jobs, Skip Locked leases)            │
 │  • LocalDiskStorage (Broken Windows OS error parsing)                       │
 └───────────────────┬────────────────────────────────────────┬────────────────┘
                     │                                        │
                     ▼                                        ▼
 ┌──────────────────────────────────────┐  ┌───────────────────────────────────┐
 │ POSTGRESQL DATABASE                  │  │ BACKGROUND WORKERS (cms-worker)   │
 │                                      │  │                                   │
 │ • Schemas: public                    │  │ • Polling loop: SELECT FOR UPDATE │
 │ • Tables: users, sessions, projects, │  │   SKIP LOCKED                     │
 │   pages, deployments, jobs           │  │ • Active: PublishWorker ONLY      │
 │ • Constraints: UNIQUE, FKs           │  │ • Inactive/Dead: Git, Email,      │
 │                                      │  │   Export, Analytics, Search       │
 └──────────────────────────────────────┘  └───────────────────────────────────┘
```

---

## C. Findings Table

| ID | Severity | Category | Location | Problem | Production Impact | Evidence | Recommended Fix |
|---|---|---|---|---|---|---|---|
| **SEC-01** | **CRITICAL** | Security (SSRF) | [`crates/cms-biz/src/openapi.rs:148-185`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-biz/src/openapi.rs#L148-L185) | Unrestricted outbound HTTP GET to user-supplied URL with full body buffered before size check. | Exfiltration of cloud provider instance metadata (`169.254.169.254`), access to internal infrastructure/databases, and memory exhaustion DoS. | `VERIFIED`: `reqwest::get(&req.url)` executes without DNS resolution validation or IP blacklist. Calls `res.text().await` before 5MB check. | Implement pre-dial DNS resolution filtering blocking private/loopback/link-local CIDRs, stream body with `take(5_242_880)` chunking, and reject redirects to private IPs. |
| **SEC-02** | **CRITICAL** | Security (DoS) | [`crates/cms-api/src/auth/middleware.rs:125-149`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-api/src/auth/middleware.rs#L125-L149) | `AuthExtractor` executes expensive Argon2 password hashing on every request containing `Authorization: Basic` without rate limiting. | An unauthenticated attacker can flood any protected endpoint with arbitrary Basic Auth credentials, saturating CPU cores and causing total service unavailability. | `VERIFIED`: `AuthService::login` is invoked on each request matching the `Basic` header. | Restrict Basic auth to machine-to-machine API keys or personal access tokens using fast constant-time HMAC/SHA-256 validation. Drop raw password Basic auth on standard API routes. |
| **SEC-03** | **HIGH** | Security (Info Leak) | [`crates/cms-error/src/lib.rs:205-245`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-error/src/lib.rs#L205-L245) | Internal SQL and system errors are formatted verbatim into HTTP response bodies. | Discloses database schema, table names, foreign key constraints, internal file paths, and library stack traces to callers. | `VERIFIED`: `AppError::Database(ref e) => ("database:error", format!("Database error: {e}"))`. | Return opaque error messages (`"An internal database error occurred"`) to clients with a correlation ID; log the raw error internally using `tracing::error!`. |
| **SEC-04** | **HIGH** | Security (Authz) | [`crates/cms-authz/src/lib.rs:82-95`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-authz/src/lib.rs#L82-L95) | Project role evaluation bypasses `project_members` and proxies directly to organization role. | Any organization member with read access automatically inherits full operational permissions across all projects, bypassing project-level isolation. | `VERIFIED`: Code comment: `// For now, we'll use organization membership as a proxy. In practice, CMS has project-specific roles`. | Query `project_members` table and resolve the effective role hierarchically (Project Role override > Org Role default). |
| **SEC-05** | **HIGH** | Security (Forging) | [`crates/cms-api/src/project/handlers.rs:3103`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-api/src/project/handlers.rs#L3103) | Webhook secrets are generated deterministically as `format!("whsec_{}", &conn.id)`. | Anyone with knowledge of or ability to enumerate the Git connection ID can forge GitHub/GitLab webhook payloads. | `VERIFIED`: Hardcoded format string using predictable UUID. | Generate cryptographically secure random tokens using `rand::thread_rng()` or `ring::rand::SystemRandom` and hash them at rest. |
| **CONC-01** | **HIGH** | Concurrency | [`crates/cms-biz/src/project.rs:56-67`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-biz/src/project.rs#L56-L67) | Non-atomic check-then-act slug generation loop runs outside a database transaction. | Concurrent project creations with identical names cause duplicate slug race conditions, triggering unexpected 409 database conflicts. | `VERIFIED`: Loop queries `is_slug_available` and then calls `create_atomic`. Under concurrency, both requests pass the check. | Use database-level advisory locking or an atomic CTE / ON CONFLICT DO UPDATE retry strategy within the repository. |
| **CONC-02** | **HIGH** | Concurrency | [`crates/cms-middleware/src/rate_limit.rs:188-217`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-middleware/src/rate_limit.rs#L188-L217) | Global `RwLock` write-lock acquired twice per request for rate limiting. | Severe thread contention across the Tokio worker pool; high request throughput will cause catastrophic latency spikes. | `VERIFIED`: `let mut limiter = self.limiter.write().await;` is called during cleanup and check. | Replace custom `RwLock<HashMap>` with lock-free concurrent primitives or a production crate like `governor` or `moka`. |
| **NET-01** | **HIGH** | Network / Proxy | [`crates/cms-middleware/src/rate_limit.rs:141-158`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-middleware/src/rate_limit.rs#L141-L158) | Rate limiter runs before auth and falls back to socket IP without validating trusted proxy headers. | All users behind a reverse proxy/load balancer collapse into `127.0.0.1` and share a single rate-limiting quota, triggering global 429 outages. | `VERIFIED`: `RateLimitClient::from_request` uses `X-Forwarded-For` naively without trusted proxy validation, and auth session is not yet resolved. | Move rate limiting after session resolution, or enforce trusted proxy CIDR checking for `X-Forwarded-For`. |
| **DIST-01** | **HIGH** | Distributed (Jobs) | [`crates/cms-api/src/deployment/handlers.rs:136`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-api/src/deployment/handlers.rs#L136) | `create_deployment_handler` creates a database record but fails to enqueue the job. | Deployments triggered via the dedicated deployment router remain in `Pending` state permanently. | `VERIFIED`: Contains `// Queue the deployment job for processing` followed immediately by returning the response without queue interaction. | Enqueue `JobType::Publish` within an atomic transactional outbox pattern. |
| **DIST-02** | **HIGH** | Distributed (Jobs) | [`crates/cms-api/src/project/handlers.rs:1457-1485`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-api/src/project/handlers.rs#L1457-L1485) | Database insert commits before background job enqueueing outside a transaction boundary. | If the backend crashes or the queue is saturated immediately after DB commit, the deployment record is orphaned in `Pending` forever. | `VERIFIED`: `DeploymentQueries::create` executes against pool, followed by separate `state.job_queue.enqueue` call. | Implement transactional outbox: write the job to the database within the same transaction as the deployment row. |
| **LOGIC-01** | **MEDIUM** | Business Logic | [`crates/cms-api/src/project/mod.rs:136-140`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-api/src/project/mod.rs#L136-L140) | Import endpoints (`/import/mintlify`, `/import/ghost`) route to `action_project_git_handler`. | Calling import returns a fake Git webhook response; zero data is imported. | `VERIFIED`: Both routes bind directly to `action_project_git_handler`, completely discarding import payloads. | Implement true content import parser workers, or return HTTP 501 Not Implemented instead of fake success. |
| **LOGIC-02** | **MEDIUM** | Business Logic | [`crates/cms-biz/src/integration.rs:92-108`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-biz/src/integration.rs#L92-L108) | `test_integration` performs no remote network verification. | Users receive false assurance that webhooks/integrations are working when external endpoints are broken. | `VERIFIED`: Checks row existence in DB and immediately returns `{ success: true, message: "Integration test successful" }`. | Dispatch an actual test payload with a strict 5-second timeout and report true HTTP response codes. |
| **DIST-03** | **MEDIUM** | Infrastructure Coupling | [`crates/cms-queue/src/postgres.rs:93-104`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-queue/src/postgres.rs#L93-L104) | Generic queue lease reaper contains hardcoded domain logic updating the `Deployment` table. | Dead leases for all other job types (Git, Export, Analytics) fail to update their domain models; generic queue is tightly coupled to deployments. | `VERIFIED`: SQL in `reap_expired_leases` runs `UPDATE "Deployment" SET status = 'Failed' WHERE ...`. | Keep the queue domain-agnostic; emit job failure events or let domain workers handle dead-letter callbacks. |
| **LIFECYCLE-01** | **MEDIUM** | Lifecycle | [`apps/api/main.rs:163-170`](file:///d:/Workspace/Software/_working/cms-rs-3/apps/api/main.rs#L163-L170) | Worker shutdown is awaited inside the Axum shutdown signal future. | Server continues accepting new incoming HTTP requests while background workers are shutting down or dead. | `VERIFIED`: `axum::serve.with_graceful_shutdown(async move { ... worker_handle.await ... })`. | Reverse the sequence: trigger Axum graceful shutdown first, wait for HTTP draining, and then signal and join background workers. |
| **ASYNC-01** | **MEDIUM** | Async Runtime | [`crates/cms-sites/src/spa.rs:226`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-sites/src/spa.rs#L226) | Synchronous `std::fs::read` executed directly inside async request handler. | Blocks Tokio worker threads during static asset delivery, starving other async tasks under concurrent load. | `VERIFIED`: `let content = std::fs::read(&file_path)?;` called inside async handler. | Replace with `tokio::fs::read` or `tokio::task::spawn_blocking`. |
| **CONC-03** | **MEDIUM** | Concurrency | [`crates/cms-sites/src/host_resolution.rs:294, 329`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-sites/src/host_resolution.rs#L294) | `self.cache.write().unwrap()` called on `std::sync::RwLock`. | If a thread panics while holding the lock, the lock becomes poisoned, crashing all subsequent host resolutions across the application. | `VERIFIED`: Unwrapped standard library `RwLock`. | Use `parking_lot::RwLock` (which does not poison) or handle `PoisonError`. |
| **OS-01** | **MEDIUM** | Compatibility | [`crates/cms-storage/src/local.rs:72, 87`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-storage/src/local.rs#L72) | OS error parsing checks `e.to_string().contains("No such file")`. | On Windows, `std::io::Error` returns `"The system cannot find the file specified"`. Missing files are erroneously treated as fatal internal storage errors. | `VERIFIED`: Hardcoded string inspection instead of `io_err.kind() == io::ErrorKind::NotFound`. | Check `e.kind() == std::io::ErrorKind::NotFound`. |
| **OBS-01** | **LOW** | Observability | [`crates/cms-middleware/src/observability.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-middleware/src/observability.rs) | Metrics recorded into global recorder, but exporter is never bound to an HTTP endpoint. | Prometheus metrics are gathered in memory and discarded; production monitoring cannot scrape operational metrics. | `VERIFIED`: `start_prometheus_exporter` is never called, and no `/metrics` route is mounted on the Axum router. | Mount an authenticated `/metrics` endpoint exporting the Prometheus registry buffer. |
| **RULE-01** | **LOW** | Policy Violation | [`crates/cms-error/src/lib.rs:72-74`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-error/src/lib.rs#L72-L74) | Error enum contains billing/plan error variants (`PlanLimitExceeded`, `FeatureNotAvailableOnPlan`). | Violates strict repository architecture guidelines (ADR 001: Internal Company Deployment, no SaaS billing/pricing). | `VERIFIED`: Dead billing variants exist in `AppError`. | Remove all plan and billing variants from `AppError` and API status mappings. |

---

## D. "Dumb / Simplistic Logic" Report

This section highlights AI-generated shortcuts where code technically compiles but exhibits fake, incomplete, or oversimplified behavior.

### 1. Fake Content Importers
* **Location:** [`crates/cms-api/src/project/mod.rs:136-140`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-api/src/project/mod.rs#L136-L140) & [`crates/cms-api/src/project/handlers.rs:3039`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-api/src/project/handlers.rs#L3039)
* **Current Implementation:**
  ```rust
  .route("/{project_id}/settings/import/mintlify", post(action_project_git_handler))
  .route("/{project_id}/settings/import/ghost", post(action_project_git_handler))
  ```
* **Why Insufficient:** Calling `/import/mintlify` or `/import/ghost` forwards directly to `action_project_git_handler`. The handler accepts a JSON body intended for Git connections, ignores import zip/tar streams, and returns a dummy `webhookSecret`. No import occurs.
* **Production Implementation:** Implement dedicated multipart upload handlers parsing Markdown frontmatter/Ghost JSON exports, processing assets into object storage, and generating document trees inside a database transaction.

### 2. Mock Integration Health Testing
* **Location:** [`crates/cms-biz/src/integration.rs:92-108`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-biz/src/integration.rs#L92-L108)
* **Current Implementation:**
  ```rust
  pub async fn test_integration(&self, ctx: &SecurityContext, id: Uuid) -> Result<IntegrationTestResult, AppError> {
      let _integration = self.get_integration(ctx, id).await?;
      Ok(IntegrationTestResult {
          success: true,
          message: "Integration test successful".into(),
      })
  }
  ```
* **Why Insufficient:** The method merely fetches the row from the database and immediately returns a hardcoded success struct. If an external Slack, Discord, or generic webhook endpoint is completely dead, invalid, or returning 500s, the system still tells the operator that the integration is functioning.
* **Production Implementation:** Dispatch an HTTP POST payload with signed headers and a 5-second timeout to the configured webhook URL, inspect the response status code, and return genuine operational status.

### 3. Faux AI RAG Fallback
* **Location:** [`crates/cms-search/src/rag.rs:69-80`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-search/src/rag.rs#L69-L80)
* **Current Implementation:**
  ```rust
  fn fallback_answer(&self, query: &str, project_name: &str, hits: &[SearchHit]) -> String {
      let mut out = format!("Based on documentation in project '{project_name}', here are the most relevant sections for '{query}':\n\n");
      for (i, hit) in hits.iter().take(3).enumerate() {
          out.push_str(&format!("{}. **{}** (`{}`)\n   {}\n\n", i + 1, hit.title, hit.path, hit.snippet));
      }
      out
  }
  ```
* **Why Insufficient:** When RAG is disabled (which is the default configuration), calling the RAG endpoint returns a simulated markdown summary that looks like an AI answer but is merely a string concatenation of raw Tantivy search hits.
* **Production Implementation:** If an LLM provider is not configured, return an explicit error or standard structured search hits rather than masquerading search results as synthesized RAG answers.

### 4. Project Role Resolution as a Proxy
* **Location:** [`crates/cms-authz/src/lib.rs:82-95`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-authz/src/lib.rs#L82-L95)
* **Current Implementation:**
  ```rust
  // For now, we'll use organization membership as a proxy.
  // In practice, CMS has project-specific roles
  self.get_user_role(user_id, org_id).await
  ```
* **Why Insufficient:** The database contains a `project_members` table specifically designed to hold granular per-project roles (`Admin`, `Editor`, `Viewer`). By bypassing this table, every organization user inherits blanket access to every project within the organization. A user invited as a read-only viewer on one project can edit documentation on any project in the organization.
* **Production Implementation:** Perform a two-step hierarchical role resolution: check `project_members` for an explicit assignment; if absent, fall back to the organization default role.

### 5. Check-Then-Insert Slug Generation Loop
* **Location:** [`crates/cms-biz/src/project.rs:56-67`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-biz/src/project.rs#L56-L67)
* **Current Implementation:**
  ```rust
  let mut slug = slugify(&req.name);
  let mut counter = 1;
  while !self.repo.is_slug_available(&slug).await? {
      slug = format!("{}-{}", slugify(&req.name), counter);
      counter += 1;
  }
  self.repo.create_atomic(..., &slug, ...).await
  ```
* **Why Insufficient:** Classic Time-of-Check to Time-of-Use (TOCTOU) race condition. If two requests create projects with the same name simultaneously, both loop iterations observe the slug as available, exit the loop, and call `create_atomic`. One transaction fails with a 409 unique constraint violation instead of gracefully allocating the next counter.
* **Production Implementation:** Catch the Postgres unique constraint violation (`23505`) on the insert statement and retry with an incremented counter, or allocate slugs using an atomic sequence/UPSERT pattern.

---

## E. Red Flags

Concrete occurrences of risky patterns identified in the codebase:

1. **`unwrap()` / `expect()` in Critical Paths:**
   * [`crates/cms-sites/src/host_resolution.rs:294, 329`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-sites/src/host_resolution.rs#L294): Standard library `RwLock::write().unwrap()`. A panic on any thread while resolving hostnames will permanently poison the cache lock, causing all subsequent host resolutions to panic.
   * [`crates/cms-search/src/embedder.rs:55`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-search/src/embedder.rs#L55): `self.model.lock().unwrap()`. Thread panics during vector embedding will permanently disable semantic search.
2. **Synchronous I/O on Tokio Worker Threads:**
   * [`crates/cms-sites/src/spa.rs:226`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-sites/src/spa.rs#L226): `std::fs::read(&file_path)?` inside an `async` Axum handler. Blocks the Tokio thread for large file transfers.
3. **Ignored Errors (`let _ =`):**
   * [`crates/cms-worker/src/lib.rs:88`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-worker/src/lib.rs#L88): Background task reaper errors are silently ignored via `let _ = self.queue.reap_expired_leases().await;`. If the database connection drops or tables are locked, lease reaping silently stops without warning or metric alerts.
4. **Unbounded Channel / Lock Contention:**
   * [`crates/cms-middleware/src/rate_limit.rs:190`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-middleware/src/rate_limit.rs#L190): Entire rate limiter state is stored in `tokio::sync::RwLock<HashMap<RateLimitClient, ...>>`. Every single HTTP request acquires a write lock during timestamp eviction, causing severe worker thread starvation.
5. **String-Matching OS Error Checks:**
   * [`crates/cms-storage/src/local.rs:72, 87`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-storage/src/local.rs#L72): Code checks `if e.to_string().contains("No such file")`. On Windows, missing files return `"The system cannot find the file specified"`. The check fails, converting standard 404s into internal server errors.
6. **Dead Billing / Plan Artifacts:**
   * [`crates/cms-error/src/lib.rs:72-74`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-error/src/lib.rs#L72-L74): `PlanLimitExceeded`, `FeatureNotAvailableOnPlan`, and `SubscriptionRequired` remain in the central error enum, violating internal deployment rules (ADR 001).

---

## F. Failure Scenarios

### Scenario 1: Server-Side Request Forgery via OpenAPI Sync
* **Trigger:** An authenticated user enters `http://169.254.169.254/latest/meta-data/identity-credentials/` as their project's OpenAPI specification URL.
* **Trace:**
  1. Client sends `POST /api/v1/projects/{id}/openapi/sync` with payload `{ "url": "http://169.254.169.254/latest/meta-data/..." }`.
  2. [`crates/cms-api/src/project/handlers.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-api/src/project/handlers.rs) invokes `OpenApiService::sync_openapi_content`.
  3. `fetch_openapi_content` constructs a standard `reqwest::Client` without DNS validation or proxy configuration.
  4. The request bypasses network perimeter firewalls because it originates directly from the backend server.
  5. The AWS metadata service responds with temporary IAM instance credentials.
  6. The backend stores the credentials directly into the database as the project's OpenAPI schema and echoes the text back to the client.
* **Production Consequence:** Complete compromise of AWS/cloud infrastructure credentials.

### Scenario 2: Denial of Service via Basic Auth Flooding
* **Trigger:** An unauthenticated attacker issues concurrent HTTP requests with header `Authorization: Basic YWRtaW46cGFzc3dvcmQ=` to any protected endpoint (e.g. `/api/v1/projects`).
* **Trace:**
  1. Request arrives at `AuthExtractor` in [`crates/cms-api/src/auth/middleware.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-api/src/auth/middleware.rs#L125).
  2. Middleware parses the Basic header and extracts username/password.
  3. `AuthService::login` is called.
  4. The service fetches the user and executes `argon2::verify_password`.
  5. Argon2id consumes 19MiB of RAM and hundreds of milliseconds of dedicated CPU time per hash.
  6. Rate limiting is bypassed because client resolution defaults to IP or is executed prior to auth.
* **Production Consequence:** All Tokio runtime threads are pinned computing password hashes. Legitimate API requests time out.

### Scenario 3: Lost Deployment Work on Backend Crash
* **Trigger:** A user clicks "Deploy" while the server experiences memory pressure or a deployment rollout restart.
* **Trace:**
  1. Client calls `POST /api/v1/projects/{id}/deployments`.
  2. `DeploymentQueries::create` executes against PostgreSQL, inserting a record with status `Pending`. Transaction commits immediately.
  3. Before `state.job_queue.enqueue(...)` completes, the container receives a `SIGKILL` or crashes.
  4. The queue never receives the job.
  5. The deployment remains in `Pending` forever. No worker ever picks it up because the worker only queries `background_jobs`, not `Deployment`.
* **Production Consequence:** Stalled deployments requiring manual database intervention.

---

## G. Crate Replacement Matrix

| Current Custom Logic | Problem | Recommended Crate/Primitive | Why | Priority |
|---|---|---|---|---|
| Custom `RwLock<HashMap>` Rate Limiter ([`crates/cms-middleware/src/rate_limit.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-middleware/src/rate_limit.rs)) | Severe write-lock contention across Tokio worker threads; flawed client extraction. | **`governor`** | Battle-tested, lock-free GCRA rate limiting designed specifically for async Rust and Tower. | **HIGH** |
| Custom in-memory caches with `std::sync::RwLock` ([`crates/cms-sites/src/host_resolution.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-sites/src/host_resolution.rs)) | Unwrapped locks cause permanent cache poisoning cascades on panic; no TTL eviction. | **`moka`** | High-performance concurrent cache with lock-free reads, automatic TTL, and memory bounds. | **HIGH** |
| Unsafe outbound HTTP fetches ([`crates/cms-biz/src/openapi.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-biz/src/openapi.rs)) | Full SSRF vulnerability; buffers unbounded bodies into RAM. | **`reqwest`** configured with custom DNS resolver / IP guard | Re-uses connection pools while enforcing RFC 1918/link-local IP filtering prior to TCP dial. | **CRITICAL** |
| Synchronous file reads ([`crates/cms-sites/src/spa.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-sites/src/spa.rs)) | `std::fs::read` blocks async executor threads. | **`tokio::fs`** / **`tower-http::services::ServeDir`** | Non-blocking async file streaming with built-in range requests and ETags. | **MEDIUM** |
| Raw SQL error string rendering in HTTP responses ([`crates/cms-error/src/lib.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-error/src/lib.rs)) | Information leakage disclosing database schemas. | **`tracing`** + structured domain error mapping | Separates user-safe error representations from internal diagnostic traces. | **HIGH** |

---

## H. Replacement Strategy

### 1. SSRF Mitigation & Secure HTTP Client
```text
CURRENT IMPLEMENTATION
reqwest::Client::new().get(url).send().await?.text().await
        ↓
PROBLEM
Accesses private CIDRs (169.254.169.254, 10.0.0.0/8, 127.0.0.1); buffers unbounded bodies in RAM.
        ↓
PRODUCTION REQUIREMENT
Pre-dial IP verification against private/loopback/link-local ranges; max body limit streamed.
        ↓
RECOMMENDED DESIGN
Custom Reqwest transport with custom resolver checking resolved SocketAddr before connection.
        ↓
MATURE CRATE / PRIMITIVE
reqwest with custom socket factory or pre-dial DNS validation using trust-dns-resolver / std::net::IpAddr.
        ↓
MIGRATION STEPS
1. Create `cms_net::safe_fetch(url: &Url, max_bytes: usize)` utility.
2. Resolve DNS names and reject private IPs (RFC 1918, RFC 3927, RFC 6890, loopback).
3. Disable automatic HTTP redirect following (or validate each hop).
4. Stream body chunks using `tokio_stream` and abort if `max_bytes` is exceeded.
        ↓
TESTS REQUIRED
Unit tests verifying rejection of localhost, 127.0.0.1, 169.254.169.254, [::1], and redirected SSRF attacks.
```

### 2. Transactional Outbox Pattern for Background Jobs
```text
CURRENT IMPLEMENTATION
DeploymentQueries::create(&pool).await?;
state.job_queue.enqueue(job).await?;
        ↓
PROBLEM
Process crash between DB commit and queue enqueue leaves jobs permanently orphaned.
        ↓
PRODUCTION REQUIREMENT
Job record creation and deployment state change must occur within an atomic database transaction.
        ↓
RECOMMENDED DESIGN
Transactional Outbox: Write job payload directly to `background_jobs` table inside the same transaction.
        ↓
MATURE CRATE / PRIMITIVE
PostgreSQL ACID transaction via `sqlx::Transaction<'_, Postgres>`.
        ↓
MIGRATION STEPS
1. Extend `JobQueue` trait to accept an optional `&mut sqlx::Transaction`.
2. Update `DeploymentQueries::create_atomic` to insert into both `Deployment` and `background_jobs`.
3. Worker polling mechanism picks up the job immediately after transaction commit.
        ↓
TESTS REQUIRED
Integration tests verifying rollback leaves zero queue records, and concurrent process crashes never lose jobs.
```

---

## I. Improvement Roadmap

### Phase 0 — Production Blockers (Immediate Remediation)
* **Fix SSRF:** Implement strict IP blocking and bounded streaming in [`crates/cms-biz/src/openapi.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-biz/src/openapi.rs).
* **Fix Basic Auth DoS:** Eliminate Argon2 re-hashing on every protected request in [`crates/cms-api/src/auth/middleware.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-api/src/auth/middleware.rs); require sessions or machine tokens.
* **Stop SQL Error Leakage:** Sanitize [`crates/cms-error/src/lib.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-error/src/lib.rs) to prevent leaking raw database error messages to HTTP clients.
* **Fix Insecure Webhook Secret:** Replace `format!("whsec_{}")` with cryptographically secure random token generation.
* **Purge Billing Code:** Remove dead billing/plan error variants from [`crates/cms-error/src/lib.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-error/src/lib.rs) in adherence to internal deployment rules (ADR 001).

### Phase 1 — Correctness & Business Logic
* **Fix Project Role Checks:** Replace org-level proxy logic in [`crates/cms-authz/src/lib.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-authz/src/lib.rs) with true `project_members` role evaluation.
* **Fix Disconnected Deployment Enqueue:** Wire [`crates/cms-api/src/deployment/handlers.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-api/src/deployment/handlers.rs) to enqueue jobs upon deployment creation.
* **Fix Check-Then-Insert Slug Races:** Replace TOCTOU loop in [`crates/cms-biz/src/project.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-biz/src/project.rs) with database-enforced atomic upsert/retry handling.
* **Clean Fake Import Routes:** Replace fake Mintlify/Ghost Git handlers with proper 501 Not Implemented status or genuine import workers.

### Phase 2 — Reliability & Concurrency
* **Replace Rate Limiter:** Swap custom contentious `RwLock<HashMap>` in [`crates/cms-middleware/src/rate_limit.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-middleware/src/rate_limit.rs) with `governor`.
* **Fix Graceful Shutdown Order:** Reorder shutdown sequence in [`apps/api/main.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/apps/api/main.rs) so Axum stops accepting new connections before worker threads drain.
* **Make Queue Domain-Agnostic:** Remove hardcoded `"Deployment"` SQL updates from [`crates/cms-queue/src/postgres.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-queue/src/postgres.rs).
* **Fix Windows Storage Error Handling:** Refactor [`crates/cms-storage/src/local.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-storage/src/local.rs) to match `io::ErrorKind::NotFound`.

### Phase 3 — Observability
* **Mount Prometheus Metrics Endpoint:** Bind `start_prometheus_exporter` in [`apps/api/main.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/apps/api/main.rs) to an authenticated `/metrics` route.
* **Structured Tracing Propagation:** Ensure `x-request-id` header is attached to tracing spans across database queries and background job execution.

### Phase 4 — Testing
* **Activate Integration Tests:** Eliminate blanket `#[ignore]` on the 18 E2E test suites in [`crates/cms-api/tests`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-api/tests) using a disposable PostgreSQL test container fixture.

---

## J. Production Readiness Assessment

```text
Production blockers:
- Critical SSRF vulnerability in OpenAPI synchronization allowing metadata exfiltration.
- Remote CPU-exhaustion Denial of Service via Basic Auth Argon2 password re-hashing.
- Information disclosure exposing raw SQL errors and table structures to HTTP clients.
- Predictable webhook secrets synthesized from entity UUIDs.
- Graceful shutdown sequence deadlock where workers shut down while the HTTP listener remains active.

Major reliability risks:
- Global rate limiter write-lock contention starving Tokio worker threads.
- Non-transactional outbox pattern leaving deployments and jobs orphaned in 'Pending' state.
- Unwrapped standard library RwLocks causing permanent cache poisoning on panic.
- Check-then-act slug generation causing 409 conflict crashes under concurrent requests.

Major security risks:
- Project-level authorization bypassed; all organization members inherit full project access.
- Outbound HTTP requests vulnerable to DNS rebinding and internal network scanning.

Major correctness risks:
- Import endpoints for Mintlify and Ghost return dummy success without importing content.
- Integration health tests return hardcoded success without pinging external endpoints.
- Fake AI RAG fallback returns search snippets disguised as AI-generated text.

Architectural weaknesses:
- God module: crates/cms-api/src/project/handlers.rs contains 84 distinct handlers spanning 3,590 lines.
- Tight infrastructure coupling: Postgres job queue contains hardcoded table updates for 'Deployment'.

Missing infrastructure:
- No exposed Prometheus `/metrics` endpoint (metrics collected into a black hole).
- No trusted proxy CIDR validation for client IP extraction behind reverse proxies.

Missing tests:
- All 18 E2E integration test suites are ignored (#[ignore]); zero automated tests run against PostgreSQL in standard CI.
```

---

## K. Top 20 Actions (Ranked by Execution Order & Dependency)

1. **Remediate OpenAPI SSRF Vulnerability**  
   *Why:* Critical security flaw allowing cloud credential exfiltration and private network access.  
   *Files/Modules:* [`crates/cms-biz/src/openapi.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-biz/src/openapi.rs)  
   *Dependency:* None.  
   *Expected Result:* Requests to private/loopback IPs are blocked prior to connection; body streaming is strictly capped at 5MB.  
   *Tests:* Unit tests with mock loopback, link-local, and RFC 1918 URLs verifying rejection.

2. **Eliminate Basic Auth Argon2 CPU Denial of Service**  
   *Why:* Unauthenticated callers can saturate CPU cores with invalid credentials.  
   *Files/Modules:* [`crates/cms-api/src/auth/middleware.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-api/src/auth/middleware.rs)  
   *Dependency:* None.  
   *Expected Result:* Basic auth is either removed from standard routes or restricted to fast token/API key comparison.  
   *Tests:* Load test against protected routes verifying CPU stays idle when passing arbitrary Basic headers.

3. **Sanitize Database Error Serialization**  
   *Why:* Stops leakage of database schema and internal file paths in client JSON responses.  
   *Files/Modules:* [`crates/cms-error/src/lib.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-error/src/lib.rs)  
   *Dependency:* None.  
   *Expected Result:* Database errors log internally via `tracing::error!` and return generic error codes to clients.  
   *Tests:* Integration test triggering a unique constraint violation and asserting response body contains no raw SQL.

4. **Secure Webhook Secret Generation**  
   *Why:* Prevents forged webhook payload attacks.  
   *Files/Modules:* [`crates/cms-api/src/project/handlers.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-api/src/project/handlers.rs#L3103)  
   *Dependency:* None.  
   *Expected Result:* Secrets generated using 32 bytes of CSPRNG entropy.  
   *Tests:* Assert generated secrets have sufficient entropy and do not contain connection UUIDs.

5. **Expunge Plan and Billing Dead Code from Error Enum**  
   *Why:* Enforces repository ADR 001 guidelines (internal deployment, no billing).  
   *Files/Modules:* [`crates/cms-error/src/lib.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-error/src/lib.rs)  
   *Dependency:* Action 3.  
   *Expected Result:* Zero references to plans, billing, or subscription tiers in backend code.  
   *Tests:* `cargo check --workspace` passes without billing variants.

6. **Implement True Project-Level Authorization**  
   *Why:* Restores tenant isolation and project boundary enforcement within organizations.  
   *Files/Modules:* [`crates/cms-authz/src/lib.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-authz/src/lib.rs)  
   *Dependency:* None.  
   *Expected Result:* `get_project_role` queries `project_members` and enforces project roles.  
   *Tests:* Unit tests verifying organization members without project membership are denied project access.

7. **Reorder Graceful Shutdown Sequence**  
   *Why:* Prevents deadlocks and aborted in-flight HTTP requests during deployments.  
   *Files/Modules:* [`apps/api/main.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/apps/api/main.rs#L163-L170)  
   *Dependency:* None.  
   *Expected Result:* HTTP server drains active requests before background workers are signaled to stop.  
   *Tests:* Integration test sending SIGTERM during active requests and verifying clean termination.

8. **Fix Disconnected Deployment Enqueueing**  
   *Why:* Fixes deployments initiated from the dedicated handler that remain stuck in `Pending`.  
   *Files/Modules:* [`crates/cms-api/src/deployment/handlers.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-api/src/deployment/handlers.rs)  
   *Dependency:* None.  
   *Expected Result:* Calling deployment handler enqueues `JobType::Publish`.  
   *Tests:* Test verifying deployment creation inserts both deployment record and job queue row.

9. **Implement Transactional Outbox for Queue Enqueues**  
   *Why:* Guarantees background jobs are never orphaned on process crashes following database commits.  
   *Files/Modules:* [`crates/cms-queue/src/postgres.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-queue/src/postgres.rs), [`crates/cms-api/src/project/handlers.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-api/src/project/handlers.rs)  
   *Dependency:* Action 8.  
   *Expected Result:* Job enqueue occurs within the database transaction.  
   *Tests:* Chaos test simulating crash after insert verifying zero orphaned deployment states.

10. **Decouple Generic Queue from Domain Deployment Table**  
    *Why:* Prevents queue infrastructure from maintaining hardcoded SQL for specific domain models.  
    *Files/Modules:* [`crates/cms-queue/src/postgres.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-queue/src/postgres.rs)  
    *Dependency:* Action 9.  
    *Expected Result:* `reap_expired_leases` operates strictly on `background_jobs` table.  
    *Tests:* Queue lease recovery test for multiple job types.

11. **Resolve Check-Then-Insert Race Conditions in Slug Generation**  
    *Why:* Eliminates 409 Conflict crashes when creating projects with identical names concurrently.  
    *Files/Modules:* [`crates/cms-biz/src/project.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-biz/src/project.rs), [`crates/cms-db/src/project.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-db/src/project.rs)  
    *Dependency:* None.  
    *Expected Result:* Atomic slug allocation or retry loop catching unique constraint errors.  
    *Tests:* Concurrent integration test launching 10 simultaneous project creation requests with identical names.

12. **Replace Contended Rate Limiter with `governor`**  
    *Why:* Eliminates global write-lock bottleneck on every HTTP request.  
    *Files/Modules:* [`crates/cms-middleware/src/rate_limit.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-middleware/src/rate_limit.rs)  
    *Dependency:* None.  
    *Expected Result:* Lock-free rate limiting with sub-microsecond latency overhead.  
    *Tests:* Benchmark verifying throughput scaling across 16 parallel threads.

13. **Fix Client IP Extraction for Rate Limiter**  
    *Why:* Prevents all users behind a reverse proxy from sharing a single rate-limit bucket.  
    *Files/Modules:* [`crates/cms-middleware/src/rate_limit.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-middleware/src/rate_limit.rs)  
    *Dependency:* Action 12.  
    *Expected Result:* `X-Forwarded-For` is only parsed when the socket IP is in a configured trusted proxy list.  
    *Tests:* Unit tests verifying IP extraction from direct sockets and trusted proxies.

14. **Replace Poison-Prone `RwLock` in Host Resolution with `moka`**  
    *Why:* Eliminates unwrapped lock poisoning risks during custom domain lookups.  
    *Files/Modules:* [`crates/cms-sites/src/host_resolution.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-sites/src/host_resolution.rs)  
    *Dependency:* None.  
    *Expected Result:* Lock-free concurrent host cache with TTL expiration.  
    *Tests:* Concurrency test verifying cache behavior under thread panics.

15. **Convert Synchronous File I/O to Async in SPA Server**  
    *Why:* Prevents blocking Tokio runtime threads during static file delivery.  
    *Files/Modules:* [`crates/cms-sites/src/spa.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-sites/src/spa.rs)  
    *Dependency:* None.  
    *Expected Result:* Non-blocking file reads using `tokio::fs`.  
    *Tests:* Concurrent static asset download benchmark verifying zero worker starvation.

16. **Fix Windows OS Error Parsing in Local Storage**  
    *Why:* Fixes erroneous 500 Internal Server Errors when accessing missing files on Windows hosts.  
    *Files/Modules:* [`crates/cms-storage/src/local.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-storage/src/local.rs)  
    *Dependency:* None.  
    *Expected Result:* Robust check using `io_err.kind() == std::io::ErrorKind::NotFound`.  
    *Tests:* Cross-platform unit tests verifying missing file requests return `ObjectNotFound`.

17. **Mount Authenticated Prometheus `/metrics` Route**  
    *Why:* Exposes gathered metrics to production monitoring and alerting systems.  
    *Files/Modules:* [`apps/api/main.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/apps/api/main.rs), [`crates/cms-middleware/src/observability.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-middleware/src/observability.rs)  
    *Dependency:* None.  
    *Expected Result:* Scrapeable Prometheus endpoint rendering HTTP counters and database pool metrics.  
    *Tests:* HTTP GET test against `/metrics` asserting valid Prometheus text exposition format.

18. **Eliminate Fake Import and Integration Handlers**  
    *Why:* Prevents deceptive success responses for non-existent operations.  
    *Files/Modules:* [`crates/cms-api/src/project/mod.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-api/src/project/mod.rs), [`crates/cms-biz/src/integration.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-biz/src/integration.rs)  
    *Dependency:* None.  
    *Expected Result:* Unimplemented routes return 501 Not Implemented; integration test actually pings endpoints.  
    *Tests:* API tests asserting honest status codes on import and integration test routes.

19. **Decompose God Module in Project Handlers**  
    *Why:* `project/handlers.rs` is 3,590 lines with 84 endpoints, making auditing and maintenance fragile.  
    *Files/Modules:* [`crates/cms-api/src/project/handlers.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-api/src/project/handlers.rs)  
    *Dependency:* Actions 4, 8, 18.  
    *Expected Result:* Split into domain submodules (`project/domain_handlers.rs`, `project/git_handlers.rs`, `project/export_handlers.rs`, `project/settings_handlers.rs`).  
    *Tests:* Ensure all routes compile and retain path bindings.

20. **Enable Automated E2E Database Test Suite in CI**  
    *Why:* The 18 E2E test suites in `crates/cms-api/tests` are currently ignored, leaving integration untested.  
    *Files/Modules:* [`crates/cms-api/tests/*`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-api/tests)  
    *Dependency:* Actions 1–18.  
    *Expected Result:* Standard `cargo test` executes integration tests against disposable PostgreSQL containers.  
    *Tests:* Clean execution of full E2E test suite without `#[ignore]` flags.

---

## L. Recommended Target Architecture

```text
                                HTTP Client / Ingress
                                         │
                                         ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │ AXUM HTTP SERVER (apps/api/main.rs)                                         │
 │                                                                             │
 │ ┌─ Tower Middleware Stack (crates/cms-middleware) ────────────────────────┐ │
 │ │  • RequestIdLayer                                                       │ │
 │ │  • TracingLayer (Request / Response spans with request-id)              │ │
 │ │  • SecurityHeadersLayer                                                 │ │
 │ │  • CorsLayer (Environment-controlled allowlists)                        │ │
 │ │  • GovernorLayer (Lock-free IP & Token rate limiting)                   │ │
 │ └─────────────────────────────────────────────────────────────────────────┘ │
 │                                       │                                     │
 │                                       ▼                                     │
 │ ┌─ Modular API Handlers (crates/cms-api) ─────────────────────────────────┐ │
 │ │  • /api/v1/auth/*        (Session cookie authentication)                │ │
 │ │  • /api/v1/projects/*    (Decomposed handlers by sub-domain)            │ │
 │ │  • /api/v1/deployments/* (Transactional outbox enqueuing)               │ │
 │ │  • /metrics              (Authenticated Prometheus scrape endpoint)     │ │
 │ └─────────────────────────────────────────────────────────────────────────┘ │
 └───────────────────────────────────────┬─────────────────────────────────────┘
                                         │
                                         ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │ DOMAIN SERVICES & SECURITY (crates/cms-biz, cms-authz)                      │
 │                                                                             │
 │  • SafeNetService    : Pre-dial DNS validated HTTP client (No SSRF)        │
 │  • ProjectService    : Atomic UPSERT / sequence slug generation             │
 │  • Authorization     : Hierarchical resolution (ProjectMember > OrgMember)  │
 └───────────────────────────────────────┬─────────────────────────────────────┘
                                         │
                                         ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │ PERSISTENCE & INFRASTRUCTURE                                                │
 │                                                                             │
 │  • Sqlx Postgres Pool (Connection limits, timeouts, health checks)          │
 │  • Transactional Outbox (Atomic domain update + job queue entry)            │
 │  • Moka Concurrent Cache (Lock-free domain & host resolution)               │
 │  • Tokio Non-Blocking FS (Async static file serving)                        │
 └───────────────────┬────────────────────────────────────────┬────────────────┘
                     │                                        │
                     ▼                                        ▼
 ┌──────────────────────────────────────┐  ┌───────────────────────────────────┐
 │ POSTGRESQL DATABASE                  │  │ BACKGROUND WORKER RUNTIME         │
 │                                      │  │                                   │
 │ • Domain Tables: projects, pages,    │  │ • Independent worker tasks        │
 │   users, project_members             │  │ • Explicit job leases & heartbeats│
 │ • Outbox Table: background_jobs      │  │ • Graceful shutdown draining after│
 │ • Strict UNIQUE, FK, CHECK rules     │  │   Axum listener closure           │
 └──────────────────────────────────────┘  └───────────────────────────────────┘
```

---

## M. Implementation Order

To remediate these issues incrementally without breaking existing features or creating unreviewable diffs, follow this staged implementation plan:

1. **Step 1: Security Hardening (P0 Blockers)**
   * Deploy SSRF protection (`safe_fetch`) in `cms-biz`.
   * Restrict Basic auth in `cms-api` middleware.
   * Sanitize error payloads in `cms-error`.
   * Fix webhook secret entropy in `cms-api/src/project/handlers.rs`.
   * Expunge dead plan/billing error codes.
2. **Step 2: Concurrency & Storage Reliability**
   * Replace the `RwLock` rate limiter with `governor`.
   * Migrate host resolution cache to `moka`.
   * Fix Windows error handling in `cms-storage/src/local.rs`.
   * Convert static asset reads in `cms-sites/src/spa.rs` to `tokio::fs`.
3. **Step 3: Transactional Outbox & Background Workers**
   * Implement transactional job enqueueing in `cms-queue` and `cms-db`.
   * Fix disconnected deployment queueing in `cms-api/src/deployment/handlers.rs`.
   * Decouple generic queue lease recovery from domain deployment tables.
4. **Step 4: Authorization & Domain Logic Correctness**
   * Implement project-level role querying in `cms-authz`.
   * Replace check-then-insert slug generation in `cms-biz/src/project.rs` with atomic handling.
   * Clean up fake import routes and mock integration tests.
5. **Step 5: Architectural Refactoring & Observability**
   * Reorder server and worker shutdown in `apps/api/main.rs`.
   * Mount the Prometheus `/metrics` endpoint.
   * Split `project/handlers.rs` into logical sub-modules.
   * Re-enable and verify E2E integration test suites in CI against a real database.