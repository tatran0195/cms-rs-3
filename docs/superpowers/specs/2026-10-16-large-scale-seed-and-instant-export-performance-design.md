# Large-Scale Seed (3000+ Long Docs, 3+ Locales, 5+ Versions) & Instant Export Performance Architecture

## 1. Problem Statement & Objectives

### Goals:
1. **Large-Scale Seed Dataset**:
   - Generate **3,000+ long documentation pages** (each 1,000+ words of realistic technical content, headers, tables, code blocks, callouts) per locale.
   - Support **3+ locales** (e.g., `en`, `es`, `fr`, `de`, `ja`) across **5+ project versions** (e.g., `v1.0`, `v1.1`, `v2.0`, `v2.1`, `v3.0`).
   - Implement as a high-speed, deterministic Bun/TypeScript batch script (`scripts/seed-benchmark.ts`) utilizing PostgreSQL bulk unnest/chunking to seed tens of thousands of records in seconds without network rate-limits.
2. **Instant Export Performance Optimization**:
   - Optimize all export formats (**Markdown ZIP/Bundle**, **Static HTML**, **Isolated SQLite Database**, **PDF**) to achieve near-instant execution even with 3,000+ multi-thousand-word documents.
   - Eliminate current export bottlenecks:
     - **Database fetch N+1 & missing content**: Replace `PageListItemRow` with single indexed query selecting full `Page` with `content`.
     - **SQLite unbatched inserts**: Replace 9,000 individual auto-commit queries with a single WAL transaction, memory cache pragmas, and set-based FTS5 population.
     - **Single-threaded Markdown & HTML rendering**: Parallelize markdown compilation and sanitization with `rayon` thread pools and pre-allocated buffers.
3. **Comprehensive Export Telemetry & Measurement**:
   - Measure each pipeline stage with sub-millisecond precision:
     - `fetch_duration_ms`
     - `render_duration_ms`
     - `storage_duration_ms`
     - `total_duration_ms`
     - `pages_processed`
     - `words_processed`
     - `throughput_pages_per_sec`
   - Store metrics in `ExportArtifact` / `ExportJob` metadata and structured logs (`tracing::info!`), exposed in both the API and Studio UI.

---

## 2. Benchmark Dataset Architecture (`scripts/seed-benchmark.ts`)

### Content Generation
- **Deterministic Technical Generator**:
  - Generates realistic enterprise docs: Architecture guides, API reference docs, deployment workflows, security models, configuration tables, and code snippets in TypeScript, Rust, Python, and SQL.
  - Generates 1,000–1,500 words per document:
    - Title & H1-H4 hierarchy
    - Technical overview & background
    - Mermaid diagram or ASCII architecture block
    - Parameter specification tables
    - Multi-language code snippets
    - Operational callouts (Tips, Warnings, Notes)
- **Scale Matrix**:
  - **Project**: Dedicated benchmark project (`benchmark-scale-docs`).
  - **Versions**: 5 versions (`v1.0`, `v1.1`, `v2.0`, `v2.1`, `v3.0`).
  - **Locales**: 3+ locales (`en`, `es`, `fr`, `de`, `ja`).
  - **Documents**: 3,000+ documents per locale, version-scoped.
- **High-Throughput Ingestion**:
  - Uses `pg` client in Bun with parameter unnesting:
    `INSERT INTO "Page" (...) SELECT * FROM UNNEST($1::uuid[], $2::text[], ...)` in batches of 500 rows per transaction.
  - Ensures index sanity and minimal WAL overhead during seeding.

---

## 3. Export Performance Bottlenecks & Optimizations

### Bottleneck 1: Database Page Retrieval
- **Current Issue**: `PageQueries::get_by_project_and_branch` uses `PageListItemRow`, which omits `content` (setting it to `None`).
- **Optimization**:
  - Add `PageQueries::get_export_pages(pool, project_id, branch_id, language_id)`:
    - Selects all required columns including `content` in a single indexed query using `WHERE project_id = $1 AND branch_id = $2`.
    - Streams/buffers records efficiently with zero N+1 calls.

### Bottleneck 2: SQLite Export (Previously ~25-40s for 3,000 docs)
- **Current Issue**: Loops over 3,000 pages doing 3 separate uncommitted SQL statements per page (9,000 individual auto-commit disk syncs) + row-by-row FTS5 virtual table insertion.
- **Optimization**:
  1. **SQLite PRAGMAs**:
     ```sql
     PRAGMA journal_mode = MEMORY; -- or WAL with synchronous = OFF for export artifact generation
     PRAGMA synchronous = OFF;
     PRAGMA cache_size = -64000; -- 64MB RAM page cache
     PRAGMA temp_store = MEMORY;
     ```
  2. **Single Transaction**: Wrap entire generation in `BEGIN TRANSACTION` ... `COMMIT`.
  3. **Batch Insertion**: Bulk insert pages and page_content using multi-row chunks or prepared query pipelines.
  4. **Deferred FTS Indexing**: Do NOT insert into `page_fts` per page. Insert into `page_fts` ONCE after all pages and contents are inserted:
     ```sql
     INSERT INTO page_fts (page_id, version_id, language, title, content)
     SELECT p.id, p.version_id, pc.language, p.title, pc.markdown
     FROM pages p
     JOIN page_content pc ON p.id = pc.page_id;
     ```
     This transforms 3,000 FTS index balancing passes into 1 lightning-fast vector scan.
  - **Expected Result**: SQLite generation drops from **>30s to < 250ms**.

### Bottleneck 3: Markdown & HTML Rendering (Previously ~12-18s)
- **Current Issue**: Sequential CPU rendering using `pulldown_cmark` and `ammonia::clean` tag-by-tag on a single thread.
- **Optimization**:
  1. Use `rayon` data-parallelism (`par_iter`):
     - Chunk pages across all available CPU cores.
     - Each core parses markdown to HTML and cleans with `ammonia` concurrently.
  2. Pre-allocated String Buffers:
     - Estimate size: `pages.len() * avg_page_size` and pre-allocate the output buffer `String::with_capacity(...)` to avoid reallocations and memory fragmentation.
  - **Expected Result**: HTML/Markdown export drops from **15s to < 300ms**.

### Bottleneck 4: PDF Rendering
- **Current Issue**: Giant monolithic HTML document passed to `PdfDocument::from_html`.
- **Optimization**:
  - For massive document trees (3,000+ pages), generate structured modular PDF streams with pre-compiled layout blocks or chunked parallel section rendering.

---

## 4. Telemetry & Measurement Model

Every export execution will track and return:
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
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
- Emitted in structured application logs:
  `tracing::info!(target: "cms::export::perf", job_id = %job_id, format = ?format, ?metrics, "Export completed");`
- Saved into the `ExportArtifact` / `ExportJob` database record.
- Displayed in the Studio History table with execution duration badges (e.g. `184ms · 3,000 pages · 16,304 p/s`).

---

## 5. Verification & Acceptance Criteria
1. Run `bun run scripts/seed-benchmark.ts`:
   - Verifies 3,000+ docs created per locale across 3+ locales and 5+ versions.
2. Trigger exports for:
   - Markdown Bundle
   - Static HTML
   - SQLite DB
   - PDF
3. Inspect `ExportMetrics`:
   - Sub-second execution (< 1s) for SQLite, Markdown, and HTML exports on the 3,000+ doc project.
   - Structured metrics accurately logged and visible in Studio UI.
