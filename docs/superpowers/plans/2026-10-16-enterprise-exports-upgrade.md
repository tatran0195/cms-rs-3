# Enterprise Production-Grade Export System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Level up the documentation Export system to full production enterprise grade by adding real snapshot audit tracking (deployment versions, page counts), direct project indexing, multi-format artifacts with file sizes, and rich UI display.

**Architecture:** 
1. Database migration adds `deployment_version` and `pages_count` to `"ExportSnapshot"`, and `project_id`, `formats`, and `trigger` to `"ExportJob"` with proper indexes.
2. `cms-biz` calculates actual published deployment version and page counts at snapshot creation time, providing true point-in-time immutability.
3. Export worker records individual `ExportArtifact` rows with format and byte sizes upon generating Markdown, PDF, HTML, or SQLite files.
4. `cms-api` returns rich `ExportJobResponse` with nested `snapshot` and `artifacts`, giving the Studio UI full revision tracking and download buttons.

**Tech Stack:** Rust (Axum, SQLx, Tokio, PostgreSQL), React 19, Vite, TanStack Query, TypeScript.

## Global Constraints
- Internal company platform: Strictly NO plan, billing, pricing tiers, payment gateways, or public marketing pages (`AGENTS.md`).
- Fully typed interfaces with zero `any` or placeholder code.
- Zero TypeScript errors (`tsc --noEmit`) and all test suites passing.

---

### Task 1: Database Migration for Enterprise Exports

**Files:**
- Create: `migrations/20261016000000_enterprise_export_snapshots_and_jobs.sql`

**Interfaces:**
- Produces: SQL schema changes adding `deployment_version`, `pages_count` to `ExportSnapshot`, and `project_id`, `formats`, `trigger` to `ExportJob`, plus `format` and `size` to `ExportArtifact`.

- [ ] **Step 1: Write the migration file**
  - Add `deployment_version BIGINT` and `pages_count INTEGER DEFAULT 0` to `"ExportSnapshot"`.
  - Add `project_id TEXT REFERENCES "Project"(id) ON DELETE CASCADE`, `trigger TEXT NOT NULL DEFAULT 'MANUAL'`, `formats TEXT[]` to `"ExportJob"`.
  - Add `format TEXT`, `size BIGINT DEFAULT 0` to `"ExportArtifact"`.
  - Backfill `ExportJob.project_id` from `"ExportSnapshot"`.
  - Add indexes:
    - `"ExportJob_project_id_created_at_idx"` on `"ExportJob" (project_id, created_at DESC)`
    - `"ExportJob_snapshot_id_idx"` on `"ExportJob" (snapshot_id)`
    - `"ExportSnapshot_project_id_idx"` on `"ExportSnapshot" (project_id, created_at DESC)`
    - `"ExportArtifact_job_id_idx"` on `"ExportArtifact" (job_id)`

- [ ] **Step 2: Apply the migration to the running database**
  - Execute SQL statements against the Postgres database pool using SQLx / `cms-db` or script.

---

### Task 2: Entity & Response Models (`cms-entity`)

**Files:**
- Modify: `crates/cms-entity/src/export.rs`

**Interfaces:**
- Produces:
  - `ExportSnapshot`: includes `pub deployment_version: Option<i64>`, `pub pages_count: Option<i32>`.
  - `ExportSnapshotDetails`: `{ id: Id, deployment_version: Option<i64>, pages_count: Option<i32>, created_at: DateTime<Utc> }`.
  - `ExportJob`: includes `pub project_id: Option<Id>`, `pub formats: Option<Vec<String>>`, `pub trigger: Option<String>`.
  - `ExportJobResponse`: includes `pub project_id: Option<Id>`, `pub formats: Option<Vec<String>>`, `pub trigger: Option<String>`, `pub snapshot: Option<ExportSnapshotDetails>`, `pub artifacts: Vec<ExportArtifactResponse>`.
  - `ExportArtifactResponse`: includes `pub format: Option<String>`, `pub size: i64`.

- [ ] **Step 1: Write unit tests in `crates/cms-entity/tests/` for serialization of enriched ExportJobResponse**
- [ ] **Step 2: Update struct definitions and `From<ExportJob>` / `From<ExportArtifact>` converters**
- [ ] **Step 3: Run `cargo test -p cms-entity` to verify**

---

### Task 3: Database Queries Layer (`cms-db`)

**Files:**
- Modify: `crates/cms-db/src/export.rs`

**Interfaces:**
- Produces:
  - `ExportSnapshotQueries::create(pool, project_id, branch_id, language_id, deployment_version, pages_count)`
  - `ExportJobQueries::create_with_meta(pool, snapshot_id, project_id, format, formats, trigger, status)`
  - `ExportJobQueries::get_by_project_enriched(pool, project_id, limit, offset)` returning jobs with snapshot details and artifacts.
  - `ExportArtifactQueries::create_with_format(pool, job_id, format, file_name, file_size, storage_path, download_url)`

- [ ] **Step 1: Update `ExportSnapshotRow` and `ExportSnapshotQueries` to persist & read `deployment_version` and `pages_count`**
- [ ] **Step 2: Update `ExportJobRow` and queries to persist & read `project_id`, `formats`, `trigger`**
- [ ] **Step 3: Update `ExportArtifactRow` and queries to persist & read `format`, `size`**
- [ ] **Step 4: Implement enriched job listing that bundles artifacts and snapshot details for each job**
- [ ] **Step 5: Run `cargo check -p cms-db`**

---

### Task 4: Business Logic & Snapshot Calculation (`cms-biz`)

**Files:**
- Modify: `crates/cms-biz/src/export.rs`

**Interfaces:**
- Produces:
  - `create_export_snapshot`: calculates latest deployment version from `DeploymentSnapshot` (or `Deployment`) and counts branch pages, persisting real point-in-time data.
  - `list_export_jobs`: returns enriched paginated jobs with snapshot details and artifacts.
  - `process_export_job`: stores `ExportArtifact` rows for generated formats.

- [ ] **Step 1: In `create_export_snapshot`, query active deployment version and page count**
- [ ] **Step 2: In `create_export_job`, accept multi-format array `formats` and pass `trigger`**
- [ ] **Step 3: In `list_export_jobs`, fetch jobs using enriched queries**
- [ ] **Step 4: In `process_export_job`, create `ExportArtifact` records for each generated export artifact**
- [ ] **Step 5: Run `cargo check -p cms-biz`**

---

### Task 5: API Layer Handlers (`cms-api`)

**Files:**
- Modify: `crates/cms-api/src/export/handlers.rs`

**Interfaces:**
- Produces:
  - `list_export_jobs_handler`: returns rich `PaginatedResponse<ExportJobResponse>` with populated `snapshot` and `artifacts`.
  - `create_export_job_handler`: accepts optional `formats: Option<Vec<ExportFormat>>` and creates job with all formats requested.

- [ ] **Step 1: Update handlers to map enriched biz models to `ExportJobResponse`**
- [ ] **Step 2: Run `cargo check -p cms-api`**
- [ ] **Step 3: Run `cargo test -p cms-api`**

---

### Task 6: Studio UI & Verification (`apps/studio`)

**Files:**
- Modify: `apps/studio/src/features/project-settings/components/exports-section.tsx`
- Modify: `apps/studio/src/features/project-settings/components/exports-section.test.tsx`

**Interfaces:**
- Consumes: Enriched `ExportJob` with `run.snapshot.deploymentVersion`, `run.snapshot.pagesCount`, `run.artifacts`, `run.trigger`.

- [ ] **Step 1: Update `exports-section.tsx` to handle multi-format payload and display enriched snapshot version & artifact buttons**
- [ ] **Step 2: Run `bun run typecheck` in `apps/studio`**
- [ ] **Step 3: Run `bun run test` in `apps/studio`**
- [ ] **Step 4: Recompile `cms-server` with `cargo build -p cms-server` and restart backend process**
- [ ] **Step 5: Browser verification: create a live export run and confirm revision/page count and artifact downloads render perfectly**
