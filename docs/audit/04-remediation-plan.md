# 04 - Remediation Plan

This remediation plan establishes a dependency-aware, staged sequence to resolve all confirmed findings in the workspace.

---

## 1. Prioritization & Staging Framework

- **Stage 1 (P0): Critical Correctness & Security**
  - Fix broken object-level authorization (IDOR/BOLA) on standalone page and branch routes.
  - Fix unauthorized project member role changes and member removal.
  - Fix missing authorization gates on project integration routes.
- **Stage 2 (P1): Data Integrity & Background Asynchrony**
  - Fix database check constraint violation on member role updates.
  - Wire disconnected background job enqueueing for Git sync and document exports.
  - Fix comment listing information disclosure.
  - Offload synchronous search reindexing from async request threads.
- **Stage 3 (P2): Architectural Consolidation**
  - Unify routing hierarchy and eliminate duplicate endpoint logic.
  - Refactor direct SQL execution out of handlers and into domain services.
- **Stage 4 (P3): Optimization & Tooling**
  - Enforce bounded build concurrency (`-j 2`) in CI and developer toolchain.
  - Consolidate duplicate crate versions (`tower-http`, `unicode-width`, `windows-sys`).

---

## 2. Staged Remediation Tasks

### Task 1.1: Standalone Page & Branch Authorization Gates (P0)
- **Findings Addressed:** [SEC-01]
- **Affected Crates & Files:**
  - `crates/cms-api/src/page/handlers.rs`
  - `crates/cms-api/src/branch/handlers.rs`
- **Prerequisites:** None (`cms-authz-gate` already supports `ParentLink::Page` and `ParentLink::Branch`).
- **Proposed Changes:**
  - In `get_page_handler`: call `require_parent_access(&state.biz_context.pool, state.authz_backend(), &auth.authz_context(), ParentLink::Page(page_id), Relation::Viewer).await?;`
  - In `update_page_handler`: call `require_parent_access(..., ParentLink::Page(page_id), Relation::Editor).await?;`
  - In `delete_page_handler`: call `require_parent_access(..., ParentLink::Page(page_id), Relation::Editor).await?;`
  - In `get_branch_handler`: call `require_parent_access(..., ParentLink::Branch(branch_id), Relation::Viewer).await?;`
  - In `update_branch_handler`: call `require_parent_access(..., ParentLink::Branch(branch_id), Relation::Editor).await?;`
  - In `delete_branch_handler`: call `require_parent_access(..., ParentLink::Branch(branch_id), Relation::Editor).await?;`
- **Tests & Verification:**
  - `cargo check -p cms-api`
  - Integration test asserting 403 Forbidden for cross-tenant access.
- **Risks & Rollback:** Low risk. If a legitimate user lacks relations, it indicates their project membership was missing.
- **Acceptance Criteria:** Unauthenticated or unauthorized page/branch accesses return `403 Forbidden`.
- **Effort:** M (1 day)

---

### Task 1.2: Project Member Management Authorization (P0)
- **Findings Addressed:** [SEC-02]
- **Affected Crates & Files:**
  - `crates/cms-api/src/project/handlers/members.rs`
- **Prerequisites:** None.
- **Proposed Changes:**
  - In `update_project_member_role_handler`: Add `cms_authz_gate::require_project_access(&state.biz_context.pool, state.authz_backend(), &auth.authz_context(), project_id, Relation::Admin).await?;`
  - In `remove_project_member_handler`: Add `cms_authz_gate::require_project_access(&state.biz_context.pool, state.authz_backend(), &auth.authz_context(), project_id, Relation::Admin).await?;`
- **Tests & Verification:**
  - `cargo check -p cms-api`
  - Negative test attempting member removal without Admin relation.
- **Risks & Rollback:** Zero regression risk.
- **Acceptance Criteria:** Non-admin users cannot alter roles or remove members.
- **Effort:** S (2 hours)

---

### Task 1.3: Project Integration Authorization (P0)
- **Findings Addressed:** [SEC-03]
- **Affected Crates & Files:**
  - `crates/cms-api/src/project/handlers/integrations.rs`
- **Prerequisites:** None.
- **Proposed Changes:**
  - Add `require_project_access` with `Relation::Viewer` on `list_project_integrations_handler`.
  - Add `require_project_access` with `Relation::Admin` on `create_project_integration_handler`, `update_project_integration_handler`, `delete_project_integration_handler`, and `verify_project_integration_handler`.
- **Tests & Verification:**
  - `cargo check -p cms-api`
- **Risks & Rollback:** Zero risk.
- **Acceptance Criteria:** Non-admins cannot manipulate or trigger webhook verifications.
- **Effort:** S (2 hours)

---

### Task 2.1: Reconcile Member Role DB Constraint & Enums (P1)
- **Findings Addressed:** [COR-01], [ARCH-02]
- **Affected Crates & Files:**
  - `crates/cms-api/src/project/handlers/members.rs`
  - `migrations/20260114000000_custom_roles_and_project_members.sql`
- **Prerequisites:** Task 1.2.
- **Proposed Changes:**
  - Reconcile `update_project_member_role_handler` to assign `role = 'member'` and set `role_id` for custom roles (`editor`, `admin`, `viewer`), or add a migration aligning `check_project_member_role` to include the standard role strings.
- **Tests & Verification:**
  - Execute role update and assert HTTP 200 without DB constraint violation.
- **Risks & Rollback:** Low risk; keeps database and API enums in sync.
- **Acceptance Criteria:** Updating a member's role to Editor, Admin, or Viewer succeeds without 500 error.
- **Effort:** S (3 hours)

---

### Task 2.2: Wire Background Workers for Git Sync and Exports (P1)
- **Findings Addressed:** [COR-02]
- **Affected Crates & Files:**
  - `crates/cms-biz/src/git.rs`
  - `crates/cms-biz/src/export.rs`
- **Prerequisites:** None.
- **Proposed Changes:**
  - Provide `Arc<dyn JobQueue>` to `GitService` and `ExportService`.
  - In `GitService::trigger_sync`, call `self.job_queue.enqueue(JobType::Git, payload).await?`.
  - In `ExportService::create_export_job`, call `self.job_queue.enqueue(JobType::Export, payload).await?`.
- **Tests & Verification:**
  - Unit test verifying enqueue call upon job creation.
- **Risks & Rollback:** If worker is not running, jobs remain queued (which is the intended durable state).
- **Acceptance Criteria:** Enqueueing a Git sync or export moves job to processing and completion.
- **Effort:** M (4 hours)

---

### Task 2.3: Offload Heavy Search Reindexing to Background Job (P1)
- **Findings Addressed:** [COR-03]
- **Affected Crates & Files:**
  - `crates/cms-api/src/project/handlers/search.rs`
  - `crates/cms-biz/src/search.rs`
- **Prerequisites:** None.
- **Proposed Changes:**
  - Guard `reindex_project_search_handler` with `Relation::Admin`.
  - Offload full reindexing loop either via `JobQueue::enqueue(JobType::Search, ...)` or by wrapping intensive batch loops in `tokio::task::spawn_blocking`.
- **Tests & Verification:**
  - Measure response latency of reindex endpoint (< 100ms returning 202 Accepted).
- **Risks & Rollback:** Low risk.
- **Acceptance Criteria:** HTTP thread is not blocked by Tantivy indexing or FastEmbed embeddings.
- **Effort:** M (4 hours)

---

### Task 3.1: Windows Test Concurrency and Memory Optimization (P2)
- **Findings Addressed:** [PERF-01]
- **Affected Crates & Files:**
  - `.cargo/config.toml`
  - `Makefile` / `build.ps1`
- **Proposed Changes:**
  - Add `[build] jobs = 2` to `.cargo/config.toml` or document `-j 2` in developer and CI scripts.
- **Acceptance Criteria:** `cargo test` executes without paging file exhaustion on Windows.
- **Effort:** S (1 hour)
