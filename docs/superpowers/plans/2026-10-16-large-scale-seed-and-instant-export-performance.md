# Large-Scale Seed & Instant Export Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide an enterprise-scale seed generator (3,000+ long docs per locale, 3+ locales, 5+ versions) and optimize export processing (SQLite, Markdown, HTML, PDF) to achieve sub-second execution with fine-grained performance telemetry.

**Architecture:** 
- Ingest high-volume deterministic technical docs using PostgreSQL batch unnesting via Bun.
- Eliminate database N+1 queries by fetching complete pages with content in a single indexed query.
- Accelerate SQLite exports with single-transaction WAL/memory pragmas and set-based FTS5 population.
- Parallelize CPU-intensive markdown rendering and HTML sanitization across Rayon thread pools.
- Instrument every export phase (`fetch`, `render`, `storage`, `total`) and surface throughput in Studio.

**Tech Stack:** Rust (Axum, sqlx, rayon, pulldown-cmark, ammonia, printpdf), TypeScript (Bun, pg, TanStack Query, React, Tailwind).

## Global Constraints
- Internal company platform deployment (strictly NO billing, pricing, or payment tiers).
- Preserve existing documentation and comments.
- Zero TypeScript errors (`tsc --noEmit`) and all unit tests passing.

---

## File Structure & Responsibilities

| File | Responsibility |
|------|----------------|
| `crates/cms-entity/src/export.rs` | Data models for `ExportMetrics`, telemetry extensions on `ExportJobResponse` and `ExportArtifact` |
| `crates/cms-db/src/page.rs` | High-efficiency `get_export_pages` query selecting full `Page` with content |
| `crates/cms-biz/src/export.rs` | Instrumented export pipeline, Rayon parallel markdown/HTML rendering, optimized SQLite transaction & FTS5 |
| `scripts/seed-benchmark.ts` | High-speed batch seed runner generating 3,000+ long docs across 3+ locales and 5+ versions |
| `apps/studio/src/features/project-settings/components/exports-section.tsx` | Visual display of export execution duration, throughput, and word counts in history table |
| `packages/sdk/src/resources/exports.ts` | Updated SDK types reflecting export performance metrics |

---

## Tasks

### Task 1: Add High-Precision Export Telemetry & Measurement Model
- [ ] Add `ExportMetrics` struct in `crates/cms-entity/src/export.rs`:
  ```rust
  #[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
  pub struct ExportMetrics {
      pub fetch_ms: u64,
      pub render_ms: u64,
      pub storage_ms: u64,
      pub total_ms: u64,
      pub pages_count: usize,
      pub words_count: usize,
      pub throughput_pages_per_sec: f64,
  }
  ```
- [ ] Add `metrics: Option<ExportMetrics>` to `ExportJobResponse` and `ExportArtifactResponse`.
- [ ] Instrument `process_export_job` in `crates/cms-biz/src/export.rs` using `std::time::Instant` around:
  - Phase 1: Database Page Retrieval (`fetch_ms`)
  - Phase 2: Format Generation (`render_ms`)
  - Phase 3: Storage Upload (`storage_ms`)
  - Calculate word counts and throughput (`pages_count / (total_ms / 1000.0)`).
- [ ] Emit structured log: `tracing::info!(target: "cms::export::perf", ...)`.
- [ ] Verify `cargo check -p cms-entity -p cms-biz`.

### Task 2: Optimized Bulk Page Retrieval Query
- [ ] In `crates/cms-db/src/page.rs`, add `PageQueries::get_export_pages`:
  - Fetch `id, project_id, branch_id, language_id, parent_id, kind, path, slug, title, description, content, icon, config, translation_key, position, is_published, created_at, updated_at`.
  - Use `SELECT * FROM "Page" WHERE project_id = $1 AND branch_id = $2 ORDER BY position ASC, path ASC`.
  - Return `Vec<Page>` so content is always fully present.
- [ ] Update `process_export_job` in `crates/cms-biz/src/export.rs` to call `PageQueries::get_export_pages`.
- [ ] Add unit test in `cms-db` verifying `get_export_pages` populates `content`.

### Task 3: Sub-Second SQLite Export Optimization
- [ ] In `crates/cms-biz/src/export.rs`, update `build_sqlite_export_database`:
  - Set PRAGMAs on connection:
    ```sql
    PRAGMA synchronous = OFF;
    PRAGMA cache_size = -64000;
    PRAGMA temp_store = MEMORY;
    ```
  - Wrap all table insertions in an explicit transaction:
    `sqlx::raw_sql("BEGIN TRANSACTION").execute(&pool).await?;`
    ...
    `sqlx::raw_sql("COMMIT").execute(&pool).await?;`
  - Remove per-row `INSERT INTO page_fts` inside the page loop.
  - Execute a single bulk FTS5 population query after page and page_content inserts:
    ```sql
    INSERT INTO page_fts (page_id, version_id, language, title, content)
    SELECT p.id, p.version_id, pc.language, p.title, pc.markdown
    FROM pages p
    JOIN page_content pc ON p.id = pc.page_id;
    ```
- [ ] Add benchmark test in `crates/cms-biz` verifying 3,000 records build in < 250ms.

### Task 4: Parallel Markdown & HTML Rendering with Rayon
- [ ] Add `rayon` dependency to `crates/cms-biz/Cargo.toml` (if not already included).
- [ ] In `crates/cms-biz/src/export.rs`:
  - Pre-allocate HTML string buffer: `String::with_capacity(estimated_bytes)`.
  - Use Rayon `par_iter()` to sanitize and render markdown pages concurrently:
    ```rust
    let rendered_articles: Vec<(String, String)> = pages
        .par_iter()
        .map(|page| {
            let clean_title = ammonia::clean(&page.title);
            let clean_html = render_markdown(page.content.as_deref().unwrap_or(""));
            (clean_title, clean_html)
        })
        .collect();
    ```
  - Join pre-rendered articles into the master HTML document in single sequential buffer copy.
- [ ] Optimize `generate_markdown_export` with capacity pre-allocation.
- [ ] Verify `cargo check -p cms-biz`.

### Task 5: High-Performance Benchmark Seed Script (`scripts/seed-benchmark.ts`)
- [ ] Create `scripts/seed-benchmark.ts`:
  - Deterministic technical document generator producing:
    - 1,000–1,500 words per document (headings, code blocks in Rust/TS/Python, parameters table, alerts).
  - Target:
    - Dedicated project: `Benchmark Enterprise Docs` (`benchmark-docs`).
    - 5 Versions: `v1.0`, `v1.1`, `v2.0`, `v2.1`, `v3.0`.
    - 3+ Locales: `en`, `es`, `fr`, `de`, `ja`.
    - 3,000+ long pages per locale.
  - Ingestion:
    - Uses `pg` package in Bun.
    - Inserts via bulk UNNEST in batches of 500 rows per transaction.
    - Emits progress bar and execution duration.
- [ ] Add script to root `package.json`: `"seed:benchmark": "bun run scripts/seed-benchmark.ts"`.
- [ ] Execute `bun run seed:benchmark` and verify PostgreSQL counts.

### Task 6: Studio UI Display of Export Metrics
- [ ] In `apps/studio/src/features/project-settings/components/exports-section.tsx`:
  - Update table headers to include Duration / Throughput metrics.
  - Render duration badges (e.g., `184ms`, `2,140 pages/s`, `1.4M words`).
- [ ] Verify `bun run --cwd apps/studio typecheck` and Vitest tests pass.

### Task 7: Full End-to-End Benchmarking & Verification
- [ ] Rebuild backend: `cargo build -p cms-server`.
- [ ] Restart server daemon and verify health.
- [ ] Trigger exports for all formats (Markdown, HTML, SQLite, PDF).
- [ ] Verify sub-second processing and check browser subagent screenshot with active metrics.
