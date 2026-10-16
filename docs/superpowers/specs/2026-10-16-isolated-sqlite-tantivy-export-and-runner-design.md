# Isolated SQLite with Tantivy Search Indexes Export & High-Performance Runner Design

## 1. Executive Summary & Problem Statement

### 1.1 Context & Motivation
CMS provides a standalone, portable documentation site runner (`cms-site` in `apps/runner`) designed to serve read-only documentation directly from exported artifacts without requiring network access to PostgreSQL or external services.

Previously:
1. **SQLite Export**: Exported only a `.sqlite` database containing tables for navigation, versions, pages, markdown content, assets, and an SQLite FTS5 table (`page_fts`).
2. **Search Limitations**: SQLite FTS5 lacks advanced CJK morphological analysis (such as Lindera with SudachiDict), phrase position indexing, and rich snippet highlighting provided by the main CMS's Tantivy search engine.
3. **Performance Constraint**: Storing large Tantivy inverted index files inside SQLite BLOBs causes excessive database file bloat, slow startup unpack latencies, and high RAM usage.

### 1.2 Objectives
1. **High-Performance Site Export**:
   - Produce a production-grade isolated site bundle containing:
     - `docs.sqlite`: Highly optimized, read-only SQLite database.
     - `search_index/`: Native, isolated Tantivy full-text search index directory.
   - Package into a streaming `.tar.gz` bundle (or direct site directory) for maximum production speed and zero SQLite bloat.
2. **Enhanced Site Runner (`cms-site`)**:
   - Support ergonomic CLI flags:
     - `--dir <path>`: Run directly against an exported site directory.
     - `--db <path>`: Auto-discover adjacent `search_index/` or `tantivy/` folder.
     - `--index-dir <path>`: Explicit path to search index.
     - `--bundle <path.tar.gz>`: Unpack once and execute.
   - Utilize Tantivy's `MmapDirectory::open` for zero-copy memory-mapped search directly from the OS page cache.
   - Support Japanese morphological analysis via Lindera SudachiDict, multi-field BM25 scoring, and `<mark>` highlighted snippets.
   - Graceful fallback: If no Tantivy index is present, seamlessly fall back to SQLite FTS5 (`page_fts`).

---

## 2. Architecture & Artifact Specification

### 2.1 Artifact Directory Layout
```text
site-export/
├── docs.sqlite                    # Schema v1 SQLite database (pages, content, assets, navigation)
└── search_index/                  # Isolated Tantivy index directory
    ├── meta.json                  # Tantivy schema and segment manifest
    └── *.data / *.idx             # Segment postings, term dictionaries, fast fields
```

When packaged as an archive for download:
- Format: `.tar.gz` (gzipped tarball).
- MIME Type: `application/gzip`.
- Storage Key: `exports/{project_id}/{job_id}/{timestamp}.tar.gz`.

### 2.2 Tantivy Search Schema (`TantivySiteFields`)
The standalone site index contains:
- `id` (Text, Stored | String): Composite identifier `{page_id}_{chunk_index}`.
- `page_id` (Text, Stored | Fast | String): Page UUID.
- `version_id` (Text, Stored | Fast | String): Version ID or version slug (e.g. `v1.0`).
- `language` (Text, Stored | Fast | String): Language code (e.g. `en`, `ja`, `es`).
- `title` (Text, Stored | Japanese Tokenizer): Page title with position indexing.
- `path` (Text, Stored | String): URL path (e.g. `/getting-started`).
- `description` (Text, Stored | Japanese Tokenizer): Page description.
- `body` (Text, Stored | Japanese Tokenizer): Plaintext stripped from Markdown.
- `chunk_index` (i64, Stored | Fast): 0 for document header, >0 for subheadings.
- `sort_order` (i64, Stored | Fast): Deterministic ordering from page navigation tree.

Tokenizer: Lindera Japanese Tokenizer with embedded SudachiDict in Decompose mode, compatible with English, Latin, and CJK text.

---

## 3. Implementation Details

### 3.1 Export Engine (`crates/cms-biz/src/export.rs`)

1. **`build_tantivy_export_index`**:
   - Accepts `pages: &[PageListItem]`, `branches: &[Branch]`, and destination directory `Path`.
   - Allocates an `IndexWriter` with a dedicated memory budget (50MB).
   - In parallel (using `rayon`), parses Markdown into plain text chunks using `pulldown-cmark`.
   - Inserts Tantivy documents with `page_id`, `version_id`, `language`, `title`, `path`, `description`, and `body`.
   - Calls `writer.commit()` to finalize Tantivy segments on disk.

2. **`generate_sqlite_bundle_export`**:
   - Builds `docs.sqlite` via `build_sqlite_export_database`.
   - Concurrently builds `search_index/` via `build_tantivy_export_index`.
   - Streams both into an in-memory or temporary `.tar.gz` archive using `tar::Builder` and `flate2::write::GzEncoder` (fast compression level).
   - Returns `Bytes` for storage or download.

### 3.2 Runner Engine (`apps/runner/src/main.rs`)

1. **CLI Flag Expansion**:
   ```rust
   #[derive(Parser, Debug)]
   #[command(name = "cms-site", author, version, about = "Portable documentation site runner")]
   struct Args {
       #[arg(short, long, default_value = "docs.sqlite")]
       db: PathBuf,

       #[arg(long)]
       dir: Option<PathBuf>,

       #[arg(long, visible_alias = "search-index")]
       index_dir: Option<PathBuf>,

       #[arg(long)]
       bundle: Option<PathBuf>,

       #[arg(short, long, default_value_t = 8080)]
       port: u16,

       #[arg(long, default_value = "127.0.0.1")]
       bind: String,

       #[arg(long)]
       network: bool,

       #[arg(long)]
       cors_origin: Option<String>,
   }
   ```

2. **Auto-Discovery Logic**:
   - If `--bundle` is provided, unpacks into a working directory.
   - If `--dir` is provided, resolves `<dir>/docs.sqlite` and `<dir>/search_index/`.
   - If `--db` is provided, checks if `--index-dir` is passed, or if `<db_dir>/search_index/` or `<db_dir>/tantivy/` exists.
   - Initializes `TantivySiteSearch` if the directory exists and contains `meta.json`.

3. **Tantivy Site Search (`TantivySiteSearch`)**:
   - Uses `MmapDirectory::open(&index_dir)` for zero-copy memory-mapped search.
   - Registers `LinderaTantivyTokenizer`.
   - `search(q, lang, version, limit)`:
     - Parses query with `QueryParser` over `title` (boost 2.5), `description` (boost 1.5), and `body` (boost 1.0).
     - Applies boolean filter terms for `version_id` and `language`.
     - Generates highlighted snippets using `SnippetGenerator` (`<mark>matched</mark>`).
     - Maps into `SiteSearchHit`.

4. **Fallback Mechanism**:
   - If no Tantivy index is found, gracefully falls back to existing SQLite FTS5 query in `execute_search`.

---

## 4. Dependencies & Workspace Updates

1. `crates/cms-biz`:
   - Add `tar = "0.4"` and `flate2 = "1.0"` for streaming bundle archive creation.
   - `cms-search` dependency is already present.
2. `apps/runner`:
   - Add `tar = "0.4"` and `flate2 = "1.0"` for bundle unpacking.
   - Add `cms-search = { path = "../../crates/cms-search", default-features = false }` or `tantivy = { workspace = true }` + `lindera = { workspace = true }`.

---

## 5. Error Handling & Edge Cases

- **Missing/Corrupt Index Directory**: Runner logs a warning and falls back to SQLite FTS5; does not crash.
- **Lenient Query Parsing**: User typos like unmatched quotes or boolean operators (`AND`, `OR`, `(`) are parsed leniently without throwing 500 errors.
- **Version & Language Isolation**: Search hits strictly enforce requested version and language boundaries.
- **Atomic Unpack**: Bundle unpacking writes to a temporary staging folder before renaming, avoiding partially written files.

---

## 6. Verification & Automated Test Plan

1. **`crates/cms-biz` Tests**:
   - Verify `build_tantivy_export_index` indexes pages and generates readable Tantivy segments.
   - Verify `generate_sqlite_bundle_export` builds a valid `.tar.gz` with both `docs.sqlite` and `search_index/`.
2. **`apps/runner` Tests**:
   - Test directory loading (`--dir`).
   - Test adjacent index auto-discovery (`--db` with sibling `search_index/`).
   - Test Tantivy search execution with BM25 scoring and `<mark>` snippet highlighting.
   - Test version and language isolation with Tantivy.
   - Test fallback to SQLite FTS5 when no Tantivy index is supplied.
3. **End-to-End Performance**:
   - Validate with `scripts/run-export-benchmark.ts` to verify export completes in sub-second times.
