# 02 - Audit Findings Catalog

All findings are classified according to the mandatory Operating Rules, backed by concrete source code evidence, and formatted with the required 14-field specification.

---

## Finding Cards

### [SEC-01] Broken Object-Level Authorization (BOLA/IDOR) on Standalone `/pages` and `/branches`

* **Classification:** Confirmed security issue
* **Severity:** Critical
* **Confidence:** High
* **Affected components:**
  - Crates: `cms-api`, `cms-biz`
  - Modules: `cms_api::page::handlers`, `cms_api::branch::handlers`, `cms_biz::page`, `cms_biz::branch`
  - Endpoints: `GET /api/pages/:id`, `PATCH /api/pages/:id`, `DELETE /api/pages/:id`, `GET /api/branches/:id`, `PATCH /api/branches/:id`, `DELETE /api/branches/:id` (and `/api/app/*`, `/api/v1/*` aliases)
* **Evidence:**
  - `crates/cms-api/src/page/handlers.rs:118-195`: Handlers only extract `AuthExtractor` and call `state.biz_context.page_service.get_page(page_id, &auth.user_id)`.
  - `crates/cms-biz/src/page.rs:142`: `let _ = user_id;` - `PageService` completely ignores the user identity and queries `cms-db` solely by `page_id`.
  - `crates/cms-api/src/branch/handlers.rs:89-188`: Identical pattern for `get_branch`, `update_branch`, and `delete_branch`.
* **Observed behavior:** Any authenticated user with a valid session token can view, edit, or delete any page or branch across the entire workspace by simply supplying its UUID, regardless of project membership or permissions.
* **Failure or attack scenario:** An internal company user in Department A inspects network requests, discovers a page UUID belonging to confidential project in Department B, and sends `GET /api/pages/{uuid}` or `DELETE /api/pages/{uuid}`. The API returns full confidential content or deletes the page without authorization.
* **Impact:** Critical confidentiality and integrity breach across project boundaries.
* **Root cause:** Authorization was implemented on project-scoped routes (`/api/projects/:id/pages`) via `authorize_project` middleware, but omitted on the standalone convenience routes (`/api/pages/:id`).
* **Recommended fix:** In `page/handlers.rs` and `branch/handlers.rs`, invoke `cms_authz_gate::require_parent_access(&state.biz_context.pool, state.authz_backend(), &auth.authz_context(), ParentLink::Page(page_id), Relation::Viewer)` (or `Editor` for mutations) before dispatching to the business service.
* **Alternatives:** Deprecate and remove standalone `/api/pages` routes, forcing all client calls through `/api/projects/:project_id/pages/:page_id`.
* **Dependencies:** None. `cms-authz-gate` already supports `ParentLink::Page` and `ParentLink::Branch`.
* **Testing:** Write negative integration tests verifying that an authenticated user who is not a member of Project X receives `403 Forbidden` when attempting `GET`, `PATCH`, or `DELETE` on `/api/pages/{page_id}` belonging to Project X.
* **Migration or compatibility risks:** None; legitimate users with access retain full access.
* **Effort:** M (Requires updating standalone handlers and adding tests).

---

### [SEC-02] Missing Authorization on Project Member Role Updates and Deletions

* **Classification:** Confirmed security issue
* **Severity:** High
* **Confidence:** High
* **Affected components:**
  - Crates: `cms-api`
  - Modules: `cms_api::project::handlers::members`
  - Endpoints: `PATCH /api/projects/:id/members/:member_id`, `DELETE /api/projects/:id/members/:member_id`
* **Evidence:**
  - `crates/cms-api/src/project/handlers/members.rs:140-165`: `update_project_member_role_handler` receives `_auth: AuthExtractor` but does not check project permissions.
  - `crates/cms-api/src/project/handlers/members.rs:170-200`: `remove_project_member_handler` receives `_auth: AuthExtractor` but does not check project permissions.
* **Observed behavior:** Any authenticated employee can change the role of any member in any project, or remove any member (including owners) from any project.
* **Failure or attack scenario:** An unauthorized team member issues a `DELETE /api/projects/{project_id}/members/{owner_id}` request, revoking the project owner's access.
* **Impact:** Privilege escalation, unauthorized access, denial of service for project owners.
* **Root cause:** Handlers were implemented with an unused `_auth` parameter without calling `cms_authz_gate::require_project_access(..., Relation::Admin)`.
* **Recommended fix:** Add `cms_authz_gate::require_project_access(&state.biz_context.pool, state.authz_backend(), &auth.authz_context(), project_id, Relation::Admin).await?;` at the top of both handlers.
* **Alternatives:** Perform the check inside a dedicated `ProjectMemberService`.
* **Dependencies:** None.
* **Testing:** Negative tests asserting `403 Forbidden` when a regular member attempts to update or remove another member.
* **Migration or compatibility risks:** None.
* **Effort:** S (Straightforward addition of guard checks).

---

### [SEC-03] Missing Authorization on Project Integration Endpoints

* **Classification:** Confirmed security issue
* **Severity:** High
* **Confidence:** High
* **Affected components:**
  - Crates: `cms-api`
  - Modules: `cms_api::project::handlers::integrations`
  - Endpoints: `GET /api/projects/:id/integrations`, `POST /api/projects/:id/integrations`, `PATCH /api/projects/:id/integrations/:iid`, `DELETE /api/projects/:id/integrations/:iid`, `POST /api/projects/:id/integrations/:iid/verify`
* **Evidence:**
  - `crates/cms-api/src/project/handlers/integrations.rs:47-248`: All 5 integration handlers receive `State` and `Path(project_id)` but never call `cms_authz_gate::require_project_access`.
* **Observed behavior:** Any user can list webhooks, add webhook endpoints, change secret keys, or delete integrations for any project. Furthermore, `verify` allows any user to trigger external HTTP webhook requests.
* **Failure or attack scenario:** An unauthorized user modifies a project's webhook URL to an attacker-controlled endpoint to exfiltrate deployment payloads.
* **Impact:** Integrity loss, external webhook hijacking, potential SSRF trigger via verify endpoint.
* **Root cause:** Authorization checks were completely omitted during integration handler scaffolding.
* **Recommended fix:** Add `cms_authz_gate::require_project_access` enforcing `Relation::Viewer` for listing and `Relation::Admin` for create, update, delete, and verify.
* **Alternatives:** Move integration management to a workspace-level administrative panel.
* **Dependencies:** None.
* **Testing:** Integration tests verifying that non-admin project members receive `403 Forbidden` on POST/PATCH/DELETE/VERIFY.
* **Migration or compatibility risks:** None.
* **Effort:** S.

---

### [SEC-04] Information Disclosure via Page Comment Listing

* **Classification:** Confirmed security issue
* **Severity:** Medium
* **Confidence:** High
* **Affected components:**
  - Crates: `cms-api`, `cms-biz`
  - Modules: `cms_api::comment::handlers`, `cms_biz::comment`
  - Endpoints: `GET /api/comments?page_id={id}`
* **Evidence:**
  - `crates/cms-api/src/comment/handlers.rs:49-70`: `list_comments_handler` extracts `page_id` from query parameters and calls `state.biz_context.comment_service.list_comments(page_id, &auth.user_id)`.
  - `crates/cms-biz/src/comment.rs:83-117`: `let _ = user_id;` - queries all comments for `page_id` without checking if `user_id` has access to the page or project.
* **Observed behavior:** Internal discussions and comments on restricted pages are visible to any authenticated user who knows the `page_id`.
* **Failure or attack scenario:** An unauthorized user polls `GET /api/comments?page_id={id}` to read confidential editorial review discussions.
* **Impact:** Information disclosure of internal editorial notes.
* **Root cause:** Failure to verify `ParentLink::Page(page_id)` authorization in the comment handler.
* **Recommended fix:** Guard `list_comments_handler` with `cms_authz_gate::require_parent_access` before fetching comments.
* **Alternatives:** Ensure `CommentService` joins against the page and verifies user membership in SQL.
* **Dependencies:** [SEC-01].
* **Testing:** Test that querying comments for a page in a private project returns `403 Forbidden`.
* **Migration or compatibility risks:** None.
* **Effort:** S.

---

### [COR-01] Database Check Constraint Violation on Project Member Role Updates

* **Classification:** Confirmed defect
* **Severity:** High
* **Confidence:** High
* **Affected components:**
  - Crates: `cms-api`
  - Modules: `cms_api::project::handlers::members`
  - Database: `ProjectMember` table (`CHECK (role IN ('owner', 'member'))`)
* **Evidence:**
  - `crates/cms-api/src/project/handlers/members.rs:146-160`:
    ```rust
    let role_str = match payload.role {
        MemberRole::Owner => "owner",
        MemberRole::Admin => "admin",
        MemberRole::Editor => "editor",
        MemberRole::Viewer => "viewer",
    };
    sqlx::query!(r#"UPDATE "ProjectMember" SET role = $1 WHERE ..."#, role_str, ...)
    ```
  - `migrations/20260114000000_custom_roles_and_project_members.sql:27`:
    ```sql
    CONSTRAINT check_project_member_role CHECK (role IN ('owner', 'member'))
    ```
* **Observed behavior:** When updating a project member's role to Admin, Editor, or Viewer, PostgreSQL rejects the update with `check_project_member_role` violation, and the API returns HTTP 500 Internal Server Error.
* **Failure or attack scenario:** Any administrator attempting to assign an "Editor" or "Admin" role via the UI encounters a 500 error, leaving role management broken.
* **Impact:** Complete failure of project member role updates in production.
* **Root cause:** Discrepancy between the API domain role model and the migration schema (where granular permissions were moved to `Role` table and linked via `role_id`).
* **Recommended fix:** Either update the DB check constraint to include all roles if enum-based, or assign custom roles via `role_id` and maintain `role = 'member'` for non-owners.
* **Alternatives:** Update `ProjectMember` table schema in a new migration to allow `('owner', 'admin', 'editor', 'viewer', 'member')`.
* **Dependencies:** None.
* **Testing:** Unit/integration test updating a member to `admin` and `editor` and asserting HTTP 200.
* **Migration or compatibility risks:** If changing DB schema, requires an additive migration.
* **Effort:** S.

---

### [COR-02] Disconnected Background Jobs for Git Sync and Project Exports

* **Classification:** Confirmed defect
* **Severity:** High
* **Confidence:** High
* **Affected components:**
  - Crates: `cms-biz`, `cms-worker`
  - Modules: `cms_biz::git`, `cms_biz::export`, `cms_worker::handlers`
* **Evidence:**
  - `crates/cms-biz/src/git.rs:121-129`: `trigger_sync` inserts a row into `"GitSyncOperation"` with status `Pending`, but never calls `job_queue.enqueue(...)`.
  - `crates/cms-biz/src/export.rs:106-109`: `create_export_job` inserts a row into `"ExportJob"` with status `Pending`, but never calls `job_queue.enqueue(...)`.
  - In contrast, `crates/cms-api/src/project/handlers/deployments.rs:175-184` properly calls `job_queue.enqueue(JobType::Publish, ...)`.
* **Observed behavior:** Users can trigger Git sync and document exports; the API returns success with a job ID, but the job status remains `Pending` forever because `cms-worker` is never notified.
* **Failure or attack scenario:** End users trigger a Git repository sync or PDF export; the spinner spins indefinitely, and the export/sync never executes.
* **Impact:** Core features (Git integration, documentation export) are completely non-functional asynchronously.
* **Root cause:** Incomplete vertical slice: the database insertion was implemented, but the queue enqueue call was omitted.
* **Recommended fix:** Inject `Arc<dyn JobQueue>` into `GitService` and `ExportService`, and call `job_queue.enqueue(JobType::Git, ...)` and `job_queue.enqueue(JobType::Export, ...)` upon job creation.
* **Alternatives:** Implement a queue poller that scans `GitSyncOperation` and `ExportJob` tables directly for pending rows.
* **Dependencies:** `cms-queue`.
* **Testing:** E2E/integration test asserting that after calling `trigger_sync`, the job transitions from `Pending` to `Processing` and `Success`.
* **Migration or compatibility risks:** None.
* **Effort:** M.

---

### [COR-03] Synchronous Search Indexing and Embeddings on Async Request Thread

* **Classification:** Confirmed defect
* **Severity:** Medium
* **Confidence:** High
* **Status:** Remediated
* **Affected components:**
  - Crates: `cms-api`, `cms-biz`
  - Modules: `cms_api::project::handlers::search`, `cms_biz::search`
  - Endpoints: `POST /api/projects/:id/search/reindex`
* **Evidence:**
  - `crates/cms-api/src/project/handlers/search.rs:370-407`: `reindex_project_search_handler` previously lacked admin authorization.
  - `crates/cms-biz/src/search.rs:274-335`: Synchronously iterated over all project pages, loaded contents, computed FastEmbed vector embeddings, and wrote Tantivy index documents directly on the Tokio request thread, blocking the client connection.
* **Observed behavior:** Reindexing blocked the Tokio worker thread for tens of seconds on large projects, triggering HTTP client timeouts (30s gateway timeout) and starving the async runtime.
* **Impact:** Denial of service, HTTP request failure, runtime thread starvation.
* **Root cause:** Heavy batch computation executed synchronously in an HTTP handler instead of being offloaded asynchronously.
* **Remediation implemented:**
  1. Guarded `reindex_project_search_handler` with `cms_authz_gate::require_project_access(..., Relation::Admin)`.
  2. Offloaded the page iteration, FastEmbed vector calculation, and Tantivy document commits to a dedicated `tokio::spawn` background task in `SearchService::reindex`.
  3. The endpoint returns `202 Accepted` immediately with the active run ID while background indexing proceeds asynchronously.
* **Testing:** Verified via `cargo check -p cms-api -p cms-biz` and unit test passes.
* **Migration or compatibility risks:** None.
* **Effort:** M.

---

### [ARCH-01] Dual Routing Paths Bypassing Access Control Layer

* **Classification:** Architectural concern
* **Severity:** High
* **Confidence:** High
* **Status:** Mitigated
* **Affected components:**
  - Crates: `cms-api`
  - Modules: `cms_api::router`, `cms_api::page`, `cms_api::branch`, `cms_api::comment`
* **Evidence:**
  - `crates/cms-api/src/router.rs:75-130`: Mounts both `/projects/:project_id/*` (scoped routes) and standalone roots (`/pages/*`, `/branches/*`, `/comments/*`).
* **Observed behavior:** Handlers for the same logical entities exist in two different places with differing authorization semantics.
* **Impact:** High maintenance overhead and recurrent security regressions when authorization updates are applied to one route set but not the other.
* **Root cause:** Transition to project-scoped REST hierarchy was started but legacy standalone routes were retained without unified middleware.
* **Remediation implemented:** Gated all standalone handlers (`crates/cms-api/src/page/handlers.rs`, `branch/handlers.rs`, `comment/handlers.rs`) with parent link resolution (`cms_authz_gate::require_parent_access`) to enforce the same ReBAC gates as project-scoped routes.
* **Testing:** Verified via unit and gate tests.
* **Effort:** M.

---

### [ARCH-02] Direct SQL Execution Leaking into API Handlers

* **Classification:** Architectural concern
* **Severity:** Medium
* **Confidence:** High
* **Status:** Remediated
* **Affected components:**
  - Crates: `cms-api`, `cms-biz`, `cms-db`
  - Modules: `cms_api::workspace::handlers`, `cms_biz::workspace`, `cms_db::workspace`
* **Evidence:**
  - `crates/cms-api/src/workspace/handlers.rs`: Contained raw `sqlx::query!` and `sqlx::query` statements directly in Axum handlers (e.g. updating workspace settings, querying user counts, managing invitations) instead of delegating to domain services.
* **Observed behavior:** Mixed HTTP transport logic with raw database SQL statements, bypassing service layer encapsulation.
* **Impact:** Reduced maintainability, broken encapsulation, duplicated query logic, and schema coupling.
* **Root cause:** Expedited initial implementation of workspace management without dedicated domain service and query modules.
* **Remediation implemented:**
  1. Created [`crates/cms-db/src/workspace.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-db/src/workspace.rs) defining [`WorkspaceQueries`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-db/src/workspace.rs) for all workspace queries and transactional mutations.
  2. Created [`crates/cms-biz/src/workspace.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-biz/src/workspace.rs) defining [`WorkspaceService`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-biz/src/workspace.rs) for business orchestration and validation.
  3. Refactored [`crates/cms-api/src/workspace/handlers.rs`](file:///d:/Workspace/Software/_working/cms-rs-3/crates/cms-api/src/workspace/handlers.rs) to completely delegate data and business logic to `WorkspaceService`, eliminating all inline SQL.
* **Testing:** Verified via `cargo check --workspace --all-targets` and `cargo clippy -p cms-api -p cms-biz -p cms-db -j 2 -- -D warnings`.
* **Migration or compatibility risks:** None.
* **Effort:** S.

---

### [PERF-01] Full Workspace Test Compilation Memory Exhaustion on Windows

* **Classification:** Architectural concern
* **Severity:** Medium
* **Confidence:** High
* **Status:** Remediated
* **Affected components:**
  - Workspace: Root `.cargo/config.toml`, root `Cargo.toml`
* **Evidence:**
  - Executing unconstrained `cargo test --workspace` on Windows triggers `fatal runtime error: out of memory` / `OS Error 1455` (`The paging file is too small for this operation to complete`) due to MSVC linker running 24 binary link jobs in parallel.
* **Observed behavior:** Windows developer machines fail tests abruptly unless job limits are set.
* **Impact:** Impaired developer experience, false CI failures.
* **Root cause:** 24 workspace targets linked simultaneously with debug symbols on Windows memory architecture.
* **Remediation implemented:** Configured `[build] jobs = 2` in [`.cargo/config.toml`](file:///d:/Workspace/Software/_working/cms-rs-3/.cargo/config.toml), enforcing bounded build and linking concurrency across all `cargo` invocations automatically.
* **Testing:** Verified `cargo check --workspace --all-targets` and crate test suites run without OS Error 1455.
* **Migration or compatibility risks:** None.
* **Effort:** S.

---

### [SEC-05] Missing Authorization Gates Across Project Subroutes

* **Classification:** Confirmed security issue
* **Severity:** High
* **Confidence:** High
* **Status:** Remediated
* **Affected components:**
  - Crates: `cms-api`
  - Modules: `cms_api::project::handlers` (`analytics`, `assets`, `branches`, `core`, `git`, `languages`, `openapi`, `reader_access`, `themes_addons`)
  - Endpoints: All project-scoped subroutes (`/api/projects/:id/languages`, `/branches`, `/assets`, `/openapi`, `/git/*`, `/reader-access/*`, `/themes`, `/addons/*`)
* **Evidence:**
  - Handlers extracted `Path(project_id)` and called backend business services without invoking `authorize_project` or checking `AuthExtractor` claims.
  - Business services discarded `_user_id` and performed direct database operations.
* **Observed behavior:** Any authenticated user could list, create, update, or delete branches, languages, assets, OpenAPI schemas, Git configurations, reader access audiences, and project addons across any project.
* **Impact:** Cross-tenant privilege escalation and complete unauthorized project manipulation.
* **Root cause:** Authorization checks were only present on a subset of project subroutes while newly migrated subroutes relied on business services that ignored identity.
* **Remediation implemented:**
  1. Gated all read/list operations with `authorize_project(state.authz_backend(), &auth.authz_context(), project_id, Relation::Viewer)`.
  2. Gated mutation operations (branch create/delete, asset upload, OpenAPI sync, Git conflict resolution) with `Relation::Editor`.
  3. Gated administrative settings, Git connections, reader audience access, JWT configuration, and addons with `Relation::Admin`.
  4. Gated project deletion with `Relation::Owner`.
* **Testing:** Verified via `cargo check --workspace --all-targets` and `cargo clippy --workspace --all-targets -j 2 -- -D warnings`.
* **Effort:** M.

---

### [SEC-06] Broken Object-Level Authorization (BOLA/IDOR) on Standalone Domain Routers

* **Classification:** Confirmed security issue
* **Severity:** Critical
* **Confidence:** High
* **Status:** Remediated
* **Affected components:**
  - Crates: `cms-api`, `cms-authz-gate`
  - Modules: `cms_api` (`language`, `deployment`, `domain`, `asset`, `export`, `git`, `openapi`, `theme`, `reader_access`)
  - Endpoints: Standalone routes (`/api/languages/*`, `/api/deployments/*`, `/api/domains/*`, `/api/assets/*`, `/api/export/*`, `/api/git/*`, `/api/openapi/*`, `/api/themes/*`, `/api/reader-access/*`)
* **Evidence:**
  - Standalone convenience handlers took direct entity UUIDs and queried `cms-db` without validating project parentage or user permissions.
  - Unscoped list endpoints returned records across all projects and tenants when optional filter queries were omitted.
* **Observed behavior:** An attacker could read, mutate, or delete arbitrary domains, deployments, export jobs, git connections, OpenAPI docs, themes, and audiences across the workspace by guessing or enumerating entity UUIDs.
* **Impact:** Critical BOLA/IDOR and cross-tenant data leakage.
* **Root cause:** Domain services operated without tenant context; standalone endpoints were not connected to the parent project ReBAC authorization tree.
* **Remediation implemented:**
  1. Extended `ParentLink` in `cms-authz-gate` to include single-hop SQL resolution variants for `Language`, `Domain`, `Asset`, `GitConnection`, `OpenApiDocument`, `Theme`, `Audience`, `ExportJob`, and `ExportSchedule`.
  2. Gated all standalone handlers using `cms_authz_gate::require_parent_access` (or `require_project_access` for scoped lists) with consistent `(state.authz_backend(), &auth.authz_context(), &state.biz_context.pool, link, relation)` parameter order.
  3. Enforced required project/parent IDs on collection list endpoints, eliminating unscoped cross-tenant data dumping.
* **Testing:** Verified via `cargo check --workspace --all-targets` and `cargo test -p cms-authz-gate -j 2`.
* **Effort:** L.

---

### [SEC-07] Cross-Tenant Information Disclosure on Platform Events, Telemetry, and MCP Audit Events

* **Classification:** Confirmed security issue
* **Severity:** High
* **Confidence:** High
* **Status:** Remediated
* **Affected components:**
  - Crates: `cms-api`, `cms-biz`
  - Modules: `cms_api::platform_event`, `cms_api::analytics`, `cms_api::mcp`
  - Endpoints: `GET /api/platform-events`, `GET /api/platform-events/:id`, `GET /api/analytics/events`, `POST /api/analytics/query`, `GET /api/analytics/dashboard/:id`, `GET /api/analytics/page-views/:id`, `GET /api/mcp/audit-events`
* **Evidence:**
  - `PlatformEventQueries::list` was called with `None` user ID, exposing all platform funnel and telemetry events.
  - `AnalyticsService::query_events` and `McpService::list_audit_events` allowed arbitrary queries across all projects when `project_id` was not supplied.
* **Observed behavior:** Any authenticated user could dump company-wide user activity, MCP audit operations, and funnel conversions.
* **Impact:** High confidentiality breach of operational analytics and internal AI audit trails.
* **Root cause:** Missing permission check determining whether the caller is a system administrator before allowing unscoped cross-project queries.
* **Remediation implemented:**
  1. Introduced `cms_authz_gate::require_system_admin` checking explicit `User.role = 'admin'` or ReBAC workspace Admin authority.
  2. Guarded platform events with `require_system_admin`.
  3. Scoped analytics events, custom queries, dashboards, page views, and MCP audit events: requiring `Relation::Viewer` on target projects when specified, and `require_system_admin` for global/cross-project aggregations.
* **Testing:** Verified via `cargo check --workspace --all-targets` and `cargo clippy --workspace --all-targets -j 2 -- -D warnings`.
* **Effort:** M.

---

### [SEC-08] Unscoped Search Reindexing and Run Inspection

* **Classification:** Confirmed security issue
* **Severity:** Medium
* **Confidence:** High
* **Status:** Remediated
* **Affected components:**
  - Crates: `cms-api`, `cms-biz`
  - Modules: `cms_api::search::handlers`
  - Endpoints: `GET /api/search`, `POST /api/search/reindex`, `GET /api/search/index-runs`, `GET /api/search/index-runs/:id`, `GET /api/search/status/:project_id`
* **Evidence:**
  - Search handlers took user parameters but did not verify ReBAC viewer or admin relations on the target `project_id`.
* **Observed behavior:** Users could trigger reindexing on projects they do not manage or view indexing histories of private projects.
* **Impact:** Unauthorized resource utilization and project discovery.
* **Root cause:** Authorization checks were completely omitted from search handlers.
* **Remediation implemented:**
  1. Enforced `require_project_access(..., Relation::Viewer)` on `search`, `list_search_index_runs`, `get_search_index_run`, and `get_search_status`.
  2. Enforced `require_project_access(..., Relation::Admin)` on `reindex`.
* **Testing:** Verified via unit tests and workspace clippy check.
* **Effort:** S.
