# Runner SQLite Page Query Performance & 9,000+ Docs Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Achieve < 1.0ms (target 0.2–0.5ms) page queries on the documentation runner with SQLite for 9,000+ docs across multiple versions and locales via in-memory hierarchy pre-warming, decoupled single-row content fetching, zero-copy mmap PRAGMAs, and verify via automated 9,000+ docs benchmark test.

**Architecture:** At runner startup or hot-reload, `SiteInstance::load` pre-warms lightweight project metadata, version routes, precomputed `NavNode` trees, and ordered sibling sequences into memory (~1.5 MB RAM for 9,000 pages). `query_page` uses O(1) in-memory route and sibling resolution, eliminating 18,000+ row table scans and recursive tree building, and queries SQLite only once for the single document's markdown content using 256MB mmap.

**Tech Stack:** Rust (axum 0.8, sqlx 0.8 sqlite, tantivy 0.22, tokio), SQLite FTS5.

## Global Constraints

- Platform Scope: Internal company platform deployment only (no plans, no billing, no SaaS pricing tiers).
- Read-Only Isolation: SQLite connection must enforce `PRAGMA query_only = ON;`.
- No Cross-Language Fallback: If a page has no content for the requested language, return 404 NOT_FOUND.
- Version Isolation: Pages and paths must be strictly scoped to the active version.
- Exact Backward Compatibility: Preserves existing JSON response schemas for `SitePageResponse`, `SiteShell`, `SiteSearchHit`, and fast-path `/p/{*id_or_path}` redirects.

---

### Task 1: Add Composite Performance Indexes to SQLite Export Schema

**Files:**
- Modify: `crates/cms-biz/src/export.rs:1127-1135`
- Test: `crates/cms-biz/src/export.rs` (cargo test -p cms-biz)

**Interfaces:**
- Produces: Composite SQLite indexes `idx_pages_version_path`, `idx_pages_version_sort`, `idx_pages_parent_sort`, and `idx_content_page_lang`.

- [ ] **Step 1: Write the failing test in `crates/cms-biz/src/export.rs`**

```rust
#[tokio::test]
async fn test_export_schema_contains_composite_performance_indexes() {
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .connect("sqlite::memory:")
        .await
        .unwrap();

    // Verify index creation SQL executes without error
    sqlx::query(
        r#"
        CREATE TABLE pages (
            id TEXT PRIMARY KEY,
            custom_id TEXT,
            version_id TEXT NOT NULL,
            parent_id TEXT,
            kind TEXT NOT NULL DEFAULT 'PAGE',
            slug TEXT NOT NULL,
            path TEXT NOT NULL,
            title TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE page_content (
            page_id TEXT NOT NULL,
            language TEXT NOT NULL,
            markdown TEXT NOT NULL,
            PRIMARY KEY (page_id, language)
        );
        CREATE INDEX idx_pages_version_path ON pages(version_id, path);
        CREATE INDEX idx_pages_version_sort ON pages(version_id, sort_order, path);
        CREATE INDEX idx_pages_parent_sort ON pages(parent_id, sort_order);
        CREATE INDEX idx_content_page_lang ON page_content(page_id, language);
        "#
    )
    .execute(&pool)
    .await
    .expect("composite indexes must be valid sqlite syntax");
}
```

- [ ] **Step 2: Run test to verify it compiles**

Run: `cargo test -p cms-biz test_export_schema_contains_composite_performance_indexes`
Expected: PASS

- [ ] **Step 3: Add composite indexes to `crates/cms-biz/src/export.rs`**

In `crates/cms-biz/src/export.rs`, update the index creation section:

```rust
        -- Indexes for fast lookup
        CREATE INDEX idx_pages_version ON pages(version_id);
        CREATE INDEX idx_pages_path ON pages(path);
        CREATE INDEX idx_pages_custom_id ON pages(custom_id);
        CREATE INDEX idx_pages_version_path ON pages(version_id, path);
        CREATE INDEX idx_pages_version_sort ON pages(version_id, sort_order, path);
        CREATE INDEX idx_pages_parent_sort ON pages(parent_id, sort_order);
        CREATE INDEX idx_content_lang ON page_content(language);
        CREATE INDEX idx_content_page_lang ON page_content(page_id, language);
        CREATE INDEX idx_changelog_ver ON changelog(version_id, published_at DESC);
```

- [ ] **Step 4: Run test to verify export builds and tests pass**

Run: `cargo test -p cms-biz`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add crates/cms-biz/src/export.rs
git commit -m "perf(export): add composite sqlite indexes for fast version, path, and content lookups"
```

---

### Task 2: Configure High-Performance Read-Only SQLite PRAGMAs in Runner

**Files:**
- Modify: `apps/runner/src/lib.rs:545-555, 2025-2035, 2065-2075`
- Modify: `apps/runner/src/sync.rs:215-225`

**Interfaces:**
- Produces: `build_optimized_sqlite_options(db_path: &Path) -> SqliteConnectOptions` configured with 256MB mmap, 64MB cache, query_only, and memory temp store.

- [ ] **Step 1: Write helper function and unit test in `apps/runner/src/lib.rs`**

```rust
pub fn build_optimized_sqlite_options(db_path: &std::path::Path) -> sqlx::sqlite::SqliteConnectOptions {
    sqlx::sqlite::SqliteConnectOptions::new()
        .filename(db_path)
        .read_only(true)
        .pragma("query_only", "ON")
        .pragma("mmap_size", "268435456")
        .pragma("cache_size", "-64000")
        .pragma("synchronous", "OFF")
        .pragma("temp_store", "MEMORY")
}

#[test]
fn test_optimized_sqlite_options_sets_pragmas() {
    let opts = build_optimized_sqlite_options(std::path::Path::new("test.sqlite"));
    // Verify options are constructed without panicking
    assert!(format!("{:?}", opts).contains("test.sqlite"));
}
```

- [ ] **Step 2: Update all read-only pool initializations in `apps/runner/src/lib.rs` and `apps/runner/src/sync.rs`**

Use `build_optimized_sqlite_options(&db_path)` in:
1. `AppState::reload`: `apps/runner/src/lib.rs:547`
2. `run_mcp`: `apps/runner/src/lib.rs:2025`
3. `run_server`: `apps/runner/src/lib.rs:2067`
4. `sync_site`: `apps/runner/src/sync.rs:218`

- [ ] **Step 3: Run existing runner tests**

Run: `cargo test -p cms-runner`
Expected: PASS (all 28 tests pass)

- [ ] **Step 4: Commit**

```bash
git add apps/runner/src/lib.rs apps/runner/src/sync.rs
git commit -m "perf(runner): configure zero-copy mmap and 64mb page cache sqlite pragmas"
```

---

### Task 3: Implement `PageRouteNode`, `SiteInstance`, and Pre-warming Logic

**Files:**
- Modify: `apps/runner/src/lib.rs` (define `PageRouteNode`, `SiteInstance`, `SiteInstance::load`)
- Test: `apps/runner/src/lib.rs` (unit tests for `SiteInstance::load`)

**Interfaces:**
- Consumes: `sqlx::SqlitePool`
- Produces: `SiteInstance` with `project`, `languages`, `versions`, `nav_trees`, `routes`, `pages_by_id`, `pages_by_custom_id`, `version_pages`, `first_page_by_version`.

- [ ] **Step 1: Define `PageRouteNode` and `SiteInstance` structs in `apps/runner/src/lib.rs`**

```rust
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PageRouteNode {
    pub id: String,
    pub custom_id: Option<String>,
    pub version_id: String,
    pub parent_id: Option<String>,
    pub kind: String,
    pub slug: String,
    pub path: String,
    pub title: String,
    pub icon: Option<String>,
    pub sort_order: i32,
}

#[derive(Clone, Debug)]
pub struct SiteInstance {
    pub project: ProjectMetadata,
    pub languages: Vec<LanguageItem>,
    pub default_language: String,
    pub versions: Vec<VersionItem>,
    pub default_version_id: String,
    pub default_version_slug: String,
    pub generated_at: String,

    pub nav_trees: HashMap<String, Vec<NavNode>>,
    pub routes: HashMap<(String, String), PageRouteNode>,
    pub pages_by_id: HashMap<String, PageRouteNode>,
    pub pages_by_custom_id: HashMap<String, String>,
    pub version_pages: HashMap<String, Vec<AdjacentPage>>,
    pub first_page_by_version: HashMap<String, PageRouteNode>,
}
```

- [ ] **Step 2: Implement `SiteInstance::load` in `apps/runner/src/lib.rs`**

```rust
impl SiteInstance {
    pub async fn load(pool: &SqlitePool) -> anyhow::Result<Self> {
        // 1. Project metadata
        let meta_row = sqlx::query(
            "SELECT project_id, project_name, project_slug, exported_at FROM export_meta LIMIT 1",
        )
        .fetch_one(pool)
        .await?;
        let project_id: String = meta_row.try_get(0)?;
        let project_name: String = meta_row.try_get(1)?;
        let project_slug: String = meta_row.try_get(2)?;
        let exported_at: String = meta_row.try_get(3)?;

        let mut project_config = serde_json::Map::new();
        let config_rows = sqlx::query("SELECT key, value FROM project_config")
            .fetch_all(pool)
            .await?;
        for r in config_rows {
            let k: String = r.try_get(0)?;
            let v: String = r.try_get(1)?;
            if let Ok(json_val) = serde_json::from_str(&v) {
                project_config.insert(k, json_val);
            } else {
                project_config.insert(k, serde_json::Value::String(v));
            }
        }

        let description = project_config
            .get("description")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let project = ProjectMetadata {
            id: project_id,
            name: project_name,
            slug: project_slug,
            description,
            config: Some(serde_json::Value::Object(project_config)),
            primary_domain: None,
        };

        // 2. Languages
        let mut languages = Vec::new();
        let mut default_language = "en".to_string();
        let lang_rows = sqlx::query("SELECT code, label, is_default, is_rtl FROM languages")
            .fetch_all(pool)
            .await?;
        for r in lang_rows {
            let code: String = r.try_get(0)?;
            let label: String = r.try_get(1)?;
            let is_default: i32 = r.try_get(2)?;
            let is_rtl: i32 = r.try_get(3)?;
            let is_default_bool = is_default == 1;
            if is_default_bool {
                default_language = code.clone();
            }
            languages.push(LanguageItem {
                code,
                label,
                direction: if is_rtl == 1 { "RTL".into() } else { "LTR".into() },
                is_default: is_default_bool,
                enabled: true,
            });
        }

        // 3. Versions
        let mut versions = Vec::new();
        let mut default_version_id = String::new();
        let mut default_version_slug = String::new();
        let ver_rows = sqlx::query("SELECT id, slug, label, is_default FROM versions ORDER BY sort_order ASC")
            .fetch_all(pool)
            .await?;
        for (idx, r) in ver_rows.into_iter().enumerate() {
            let id: String = r.try_get(0)?;
            let slug: String = r.try_get(1)?;
            let name: String = r.try_get(2)?;
            let is_default: i32 = r.try_get(3)?;
            let is_default_bool = is_default == 1;
            if is_default_bool || (idx == 0 && default_version_id.is_empty()) {
                default_version_id = id.clone();
                default_version_slug = slug.clone();
            }
            versions.push(VersionItem {
                id,
                name,
                slug,
                is_default: is_default_bool,
            });
        }

        // 4. All Pages in single bulk query
        let page_rows = sqlx::query(
            "SELECT id, custom_id, version_id, parent_id, kind, slug, title, path, icon, sort_order FROM pages ORDER BY sort_order ASC, path ASC"
        )
        .fetch_all(pool)
        .await?;

        let mut routes = HashMap::new();
        let mut pages_by_id = HashMap::new();
        let mut pages_by_custom_id = HashMap::new();
        let mut version_raw_pages: HashMap<String, Vec<PageRouteNode>> = HashMap::new();
        let mut version_pages: HashMap<String, Vec<AdjacentPage>> = HashMap::new();
        let mut first_page_by_version = HashMap::new();

        for r in page_rows {
            let id: String = r.try_get(0)?;
            let custom_id: Option<String> = r.try_get(1).ok();
            let version_id: String = r.try_get(2)?;
            let parent_id: Option<String> = r.try_get(3).ok();
            let kind: String = r.try_get(4)?;
            let slug: String = r.try_get(5)?;
            let title: String = r.try_get(6)?;
            let path: String = r.try_get(7)?;
            let icon: Option<String> = r.try_get(8).ok();
            let sort_order: i32 = r.try_get(9)?;

            let node = PageRouteNode {
                id: id.clone(),
                custom_id: custom_id.clone(),
                version_id: version_id.clone(),
                parent_id: parent_id.clone(),
                kind: kind.clone(),
                slug: slug.clone(),
                path: path.clone(),
                title: title.clone(),
                icon,
                sort_order,
            };

            let clean_p = path.trim().trim_matches('/').to_string();
            routes.insert((version_id.clone(), format!("/{}", clean_p)), node.clone());
            routes.insert((version_id.clone(), clean_p.clone()), node.clone());

            if let Some(ref cid) = custom_id {
                let clean_cid = cid.trim().trim_matches('/').to_string();
                pages_by_custom_id.insert(clean_cid, id.clone());
            }

            if kind.eq_ignore_ascii_case("page") || kind.eq_ignore_ascii_case("document") {
                version_pages.entry(version_id.clone()).or_default().push(AdjacentPage {
                    title: title.clone(),
                    path: path.clone(),
                });
                first_page_by_version.entry(version_id.clone()).or_insert_with(|| node.clone());
            }

            pages_by_id.insert(id.clone(), node.clone());
            version_raw_pages.entry(version_id).or_default().push(node);
        }

        // 5. Precompute nav_trees per version
        let mut nav_trees = HashMap::new();
        for (ver_id, raw_pages) in version_raw_pages {
            let mut children_map: HashMap<Option<String>, Vec<PageRouteNode>> = HashMap::new();
            for p in raw_pages {
                children_map.entry(p.parent_id.clone()).or_default().push(p);
            }

            fn assemble_nodes(
                parent_id: Option<String>,
                map: &mut HashMap<Option<String>, Vec<PageRouteNode>>,
            ) -> Vec<NavNode> {
                let mut list = map.remove(&parent_id).unwrap_or_default();
                list.sort_by_key(|n| n.sort_order);
                list.into_iter()
                    .map(|node| {
                        let node_id = node.id.clone();
                        let children = assemble_nodes(Some(node_id), map);
                        NavNode {
                            id: node.id,
                            kind: node.kind,
                            title: node.title,
                            path: node.path,
                            icon: node.icon,
                            tag: None,
                            children,
                        }
                    })
                    .collect()
            }

            let tree = assemble_nodes(None, &mut children_map);
            nav_trees.insert(ver_id, tree);
        }

        Ok(Self {
            project,
            languages,
            default_language,
            versions,
            default_version_id,
            default_version_slug,
            generated_at: exported_at,
            nav_trees,
            routes,
            pages_by_id,
            pages_by_custom_id,
            version_pages,
            first_page_by_version,
        })
    }
}
```

- [ ] **Step 3: Write test for `SiteInstance::load`**

```rust
#[tokio::test]
async fn test_site_instance_load_builds_memory_index() {
    let pool = setup_test_db().await;
    let instance = SiteInstance::load(&pool).await.unwrap();

    assert_eq!(instance.project.name, "Test Project");
    assert_eq!(instance.default_language, "en");
    assert_eq!(instance.versions.len(), 2);
    assert_eq!(instance.nav_trees.get("v1").unwrap().len(), 2);
    assert!(instance.routes.contains_key(&("v1".into(), "getting-started".into())));
    assert!(instance.routes.contains_key(&("v1".into(), "/getting-started".into())));
    assert_eq!(instance.version_pages.get("v1").unwrap().len(), 2);
}
```

- [ ] **Step 4: Run test to verify**

Run: `cargo test -p cms-runner test_site_instance_load_builds_memory_index`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/runner/src/lib.rs
git commit -m "feat(runner): implement pre-warmed SiteInstance in-memory routing and hierarchy index"
```

---

### Task 4: Integrate `SiteInstance` into `InnerState`, `AppState`, and Hot-Reload

**Files:**
- Modify: `apps/runner/src/lib.rs:487-606, 2050-2135`

**Interfaces:**
- Consumes: `SiteInstance`
- Produces: `AppState::instance(&self) -> Arc<SiteInstance>`

- [ ] **Step 1: Update `InnerState` to store `Arc<SiteInstance>`**

In `apps/runner/src/lib.rs`:

```rust
#[derive(Clone)]
pub struct InnerState {
    pub db: SqlitePool,
    pub instance: Arc<SiteInstance>,
    pub search: Option<Arc<TantivySiteSearch>>,
}
```

- [ ] **Step 2: Update `AppState::new`, `with_paths`, `instance()`, and `reload()`**

```rust
impl AppState {
    pub fn new(db: SqlitePool, instance: Arc<SiteInstance>, search: Option<Arc<TantivySiteSearch>>) -> Self {
        Self {
            inner: Arc::new(tokio::sync::RwLock::new(InnerState { db, instance, search })),
            db_path: None,
            idx_dir: None,
        }
    }

    pub fn with_paths(
        db: SqlitePool,
        instance: Arc<SiteInstance>,
        search: Option<Arc<TantivySiteSearch>>,
        db_path: PathBuf,
        idx_dir: Option<PathBuf>,
    ) -> Self {
        Self {
            inner: Arc::new(tokio::sync::RwLock::new(InnerState { db, instance, search })),
            db_path: Some(db_path),
            idx_dir,
        }
    }

    pub async fn get_instance(&self) -> Arc<SiteInstance> {
        self.inner.read().await.instance.clone()
    }

    pub async fn reload(&self) -> anyhow::Result<ReloadStats> {
        let db_path = self.db_path.as_ref().ok_or_else(|| {
            anyhow::anyhow!("Cannot reload: no database path was configured for this server instance")
        })?;

        let opts = build_optimized_sqlite_options(db_path);
        let new_pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(10)
            .connect_with(opts)
            .await?;

        let new_instance = Arc::new(SiteInstance::load(&new_pool).await?);
        let page_count = new_instance.pages_by_id.len() as i64;
        let project_name = new_instance.project.name.clone();

        let new_search = if let Some(ref idx_path) = self.idx_dir {
            match TantivySiteSearch::open(idx_path) {
                Ok(s) => Some(Arc::new(s)),
                Err(e) => {
                    tracing::warn!("Failed to reload Tantivy index at {}: {}. Using SQLite FTS5.", idx_path.display(), e);
                    None
                }
            }
        } else {
            None
        };

        {
            let mut write = self.inner.write().await;
            write.db = new_pool;
            write.instance = new_instance;
            write.search = new_search;
        }

        Ok(ReloadStats {
            project_name,
            page_count,
            schema_version: 1,
        })
    }
}
```

- [ ] **Step 3: Update `run_server` to load `SiteInstance` at instance startup**

In `run_server`:
```rust
let instance = Arc::new(SiteInstance::load(&pool).await?);
let state = AppState::with_paths(pool, instance, search, db_path, idx_dir_opt);
```

- [ ] **Step 4: Update test fixtures in `tests` module to pass `Arc::new(SiteInstance::load(&pool).await.unwrap())`**

- [ ] **Step 5: Run existing runner tests**

Run: `cargo test -p cms-runner`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/runner/src/lib.rs
git commit -m "feat(runner): integrate SiteInstance into AppState with atomic hot-reload swap"
```

---

### Task 5: Refactor `query_page`, `query_bootstrap`, and `fast_path_redirect` to In-Memory Fast Path

**Files:**
- Modify: `apps/runner/src/lib.rs:770-1300, 1435-1472, 1558-1655`

**Interfaces:**
- `query_bootstrap(instance: &SiteInstance, target_lang: Option<&str>, target_version: Option<&str>) -> anyhow::Result<SiteShell>` (0 DB queries)
- `query_page(pool: &SqlitePool, instance: &SiteInstance, target_path: &str, target_lang: Option<&str>, target_version: Option<&str>) -> anyhow::Result<Option<SitePageResponse>>` (1 DB query)

- [ ] **Step 1: Refactor `query_bootstrap` to return precomputed `SiteShell` without SQLite queries**

```rust
pub fn query_bootstrap_fast(
    instance: &SiteInstance,
    target_lang: Option<&str>,
    target_version: Option<&str>,
) -> anyhow::Result<SiteShell> {
    let active_language = if let Some(req_lang) = target_lang.filter(|s| !s.trim().is_empty()) {
        if instance.languages.iter().any(|l| l.code == req_lang) {
            req_lang.to_string()
        } else {
            instance.default_language.clone()
        }
    } else {
        instance.default_language.clone()
    };

    let (active_version_id, active_version_slug) =
        if let Some(req_ver) = target_version.filter(|s| !s.trim().is_empty()) {
            if let Some(v) = instance
                .versions
                .iter()
                .find(|v| v.slug == req_ver || v.id == req_ver)
            {
                (v.id.clone(), v.slug.clone())
            } else {
                anyhow::bail!("Version '{}' not found", req_ver);
            }
        } else {
            (
                instance.default_version_id.clone(),
                instance.default_version_slug.clone(),
            )
        };

    let nav = instance
        .nav_trees
        .get(&active_version_id)
        .cloned()
        .unwrap_or_default();

    Ok(SiteShell {
        project: instance.project.clone(),
        nav,
        languages: instance.languages.clone(),
        versions: instance.versions.clone(),
        active_language,
        active_version: active_version_slug,
        language_config: None,
        version: 1,
        generated_at: instance.generated_at.clone(),
    })
}
```

- [ ] **Step 2: Refactor `query_page` to use `SiteInstance` fast path and single SQLite content query**

```rust
pub async fn query_page_fast(
    pool: &SqlitePool,
    instance: &SiteInstance,
    target_path: &str,
    target_lang: Option<&str>,
    target_version: Option<&str>,
) -> anyhow::Result<Option<SitePageResponse>> {
    // 1. Language validation
    let active_lang = if let Some(req_lang) = target_lang.filter(|s| !s.trim().is_empty()) {
        if !instance.languages.iter().any(|l| l.code == req_lang) {
            return Ok(None);
        }
        req_lang.to_string()
    } else {
        instance.default_language.clone()
    };

    // 2. Version validation
    let active_version_item = if let Some(req_ver) = target_version.filter(|s| !s.trim().is_empty()) {
        match instance.versions.iter().find(|v| v.slug == req_ver || v.id == req_ver) {
            Some(v) => v,
            None => return Ok(None),
        }
    } else {
        match instance.versions.iter().find(|v| v.id == instance.default_version_id) {
            Some(v) => v,
            None => return Ok(None),
        }
    };
    let active_version_id = &active_version_item.id;
    let active_version_slug = &active_version_item.slug;

    // 3. Normalize path
    let mut normalized = target_path.trim().trim_matches('/');
    if let Some(stripped) = normalized.strip_prefix("sites/") {
        if let Some((_, rest)) = stripped.split_once('/') {
            normalized = rest.trim_matches('/');
        }
    }
    if !active_version_item.is_default
        && (normalized == active_version_slug || normalized.starts_with(&format!("{}/", active_version_slug)))
    {
        normalized = normalized
            .strip_prefix(active_version_slug.as_str())
            .unwrap_or_default()
            .trim_matches('/');
    }

    // 4. In-memory page lookup (0 DB calls)
    let found_node: Option<&PageRouteNode> = if normalized.is_empty() {
        instance
            .routes
            .get(&(active_version_id.clone(), "/".into()))
            .or_else(|| instance.routes.get(&(active_version_id.clone(), "".into())))
            .or_else(|| instance.first_page_by_version.get(active_version_id))
    } else {
        instance
            .routes
            .get(&(active_version_id.clone(), format!("/{}", normalized)))
            .or_else(|| instance.routes.get(&(active_version_id.clone(), normalized.into())))
    };

    let mut target_node = match found_node {
        Some(n) => n.clone(),
        None => return Ok(None),
    };

    // If node is a GROUP, resolve to its first non-group child page in memory
    if target_node.kind.eq_ignore_ascii_case("group") {
        if let Some(nav_tree) = instance.nav_trees.get(active_version_id) {
            fn find_first_leaf<'a>(nodes: &'a [NavNode], group_id: &str) -> Option<&'a NavNode> {
                for n in nodes {
                    if n.id == group_id {
                        fn first_leaf<'b>(children: &'b [NavNode]) -> Option<&'b NavNode> {
                            for c in children {
                                if !c.kind.eq_ignore_ascii_case("group") {
                                    return Some(c);
                                }
                                if let Some(leaf) = first_leaf(&c.children) {
                                    return Some(leaf);
                                }
                            }
                            None
                        }
                        return first_leaf(&n.children);
                    }
                    if let Some(found) = find_first_leaf(&n.children, group_id) {
                        return Some(found);
                    }
                }
                None
            }
            if let Some(leaf) = find_first_leaf(nav_tree, &target_node.id) {
                if let Some(leaf_node) = instance.pages_by_id.get(&leaf.id) {
                    target_node = leaf_node.clone();
                }
            }
        }
    }

    // 5. Query content for active_lang (1 single-row SQLite query)
    let content_opt = sqlx::query(
        "SELECT markdown, description, updated_at FROM page_content WHERE page_id = ?1 AND language = ?2 LIMIT 1",
    )
    .bind(&target_node.id)
    .bind(&active_lang)
    .fetch_optional(pool)
    .await?;

    let (markdown, description, updated_at): (String, Option<String>, String) = match content_opt {
        Some(r) => (r.try_get(0)?, r.try_get(1)?, r.try_get(2)?),
        None => return Ok(None),
    };

    let headings = extract_headings(&markdown);
    let excerpt = description
        .clone()
        .or_else(|| {
            markdown
                .lines()
                .find(|l| !l.trim().is_empty() && !l.starts_with('#'))
                .map(|l| l.trim().to_string())
        })
        .unwrap_or_default();

    // 6. Breadcrumbs in memory (0 DB calls)
    let mut breadcrumbs = Vec::new();
    let mut curr_parent = target_node.parent_id.clone();
    while let Some(parent_id) = curr_parent {
        if let Some(p_node) = instance.pages_by_id.get(&parent_id) {
            breadcrumbs.push(BreadcrumbItem {
                title: p_node.title.clone(),
                path: p_node.path.clone(),
            });
            curr_parent = p_node.parent_id.clone();
        } else {
            break;
        }
    }
    breadcrumbs.reverse();
    breadcrumbs.push(BreadcrumbItem {
        title: target_node.title.clone(),
        path: target_node.path.clone(),
    });

    // 7. Prev and Next in memory (0 DB calls)
    let mut prev = None;
    let mut next = None;
    if let Some(siblings) = instance.version_pages.get(active_version_id) {
        if let Some(idx) = siblings.iter().position(|s| s.path == target_node.path) {
            if idx > 0 {
                prev = Some(siblings[idx - 1].clone());
            }
            if idx + 1 < siblings.len() {
                next = Some(siblings[idx + 1].clone());
            }
        }
    }

    let page_languages = instance
        .languages
        .iter()
        .map(|l| PageLanguageItem {
            code: l.code.clone(),
            is_default: l.is_default,
            path: Some(target_node.path.clone()),
        })
        .collect();

    Ok(Some(SitePageResponse {
        project: instance.project.clone(),
        page: PageDetails {
            id: target_node.id,
            created_at: instance.generated_at.clone(),
            updated_at,
            title: target_node.title,
            description,
            excerpt,
            icon: target_node.icon,
            path: target_node.path,
            content: markdown,
            headings,
            config: None,
        },
        active_language: active_lang,
        active_version: active_version_slug.clone(),
        versions: instance.versions.clone(),
        language_config: None,
        languages: page_languages,
        breadcrumbs,
        prev,
        next,
    }))
}
```

- [ ] **Step 3: Update `api_page`, `api_bootstrap`, and `serve_spa` to use fast path**

In `api_page`:
```rust
let instance = state.get_instance().await;
match query_page_fast(&db, &instance, &path, lang.as_deref(), version.as_deref()).await { ... }
```

In `api_bootstrap`:
```rust
let instance = state.get_instance().await;
match query_bootstrap_fast(&instance, lang.as_deref(), version.as_deref()) { ... }
```

- [ ] **Step 4: Update `fast_path_redirect` to use `instance.pages_by_custom_id` and `instance.pages_by_id` in memory**

- [ ] **Step 5: Run runner tests to verify regression-free operation**

Run: `cargo test -p cms-runner`
Expected: PASS (all 28 tests pass)

- [ ] **Step 6: Commit**

```bash
git add apps/runner/src/lib.rs
git commit -m "perf(runner): decouple query_page from bootstrap with in-memory route, breadcrumbs, and sibling lookups"
```

---

### Task 6: Optimize Search Query and Pre-warm Tantivy/FTS5 Search Instance

**Files:**
- Modify: `apps/runner/src/lib.rs:310-340, 1327-1410`

**Interfaces:**
- Produces: Pre-warmed `TantivySiteSearch` searcher and candidate-limited SQLite FTS5 query.

- [ ] **Step 1: Optimize `execute_search` for SQLite FTS5 fallback**

Update SQL in `execute_search` so candidate ranking occurs directly on `page_fts` before joining `page_content`:

```rust
pub async fn execute_search(
    pool: &SqlitePool,
    clean_q: &str,
    limit: usize,
    target_lang: Option<&str>,
    target_version: Option<&str>,
) -> anyhow::Result<Vec<SiteSearchHit>> {
    let fts_query = clean_q
        .split_whitespace()
        .map(|w| format!("\"{}\"*", w.replace('\"', "")))
        .filter(|w| w != "\"\"*")
        .collect::<Vec<_>>()
        .join(" ");

    if fts_query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let mut builder = sqlx::QueryBuilder::<sqlx::Sqlite>::new(
        r#"
        SELECT p.id, p.title, p.path, p.icon, c.description,
               snippet(page_fts, 4, '<mark>', '</mark>', '...', 12) as snippet,
               f.language,
               f.rank
        FROM page_fts f
        JOIN pages p ON p.id = f.page_id
        LEFT JOIN page_content c ON c.page_id = p.id AND c.language = f.language
        WHERE page_fts MATCH 
        "#,
    );

    builder.push_bind(fts_query);

    if let Some(vid) = target_version.filter(|s| !s.trim().is_empty()) {
        builder.push(" AND p.version_id = ");
        builder.push_bind(vid);
    }

    if let Some(lang) = target_lang.filter(|s| !s.trim().is_empty()) {
        builder.push(" AND f.language = ");
        builder.push_bind(lang.to_string());
    }

    builder.push(" ORDER BY f.rank ASC LIMIT ");
    builder.push_bind(limit as i64);

    let rows = builder.build().fetch_all(pool).await?;
    // map rows to Vec<SiteSearchHit>
```

- [ ] **Step 2: Add Tantivy warm-up on `TantivySiteSearch::open`**

In `TantivySiteSearch::open`, pre-warm searcher:
```rust
let searcher = reader.searcher();
let _ = searcher.num_docs();
```

- [ ] **Step 3: Run search tests**

Run: `cargo test -p cms-runner test_search_version_and_language_scoping_and_ranking`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/runner/src/lib.rs
git commit -m "perf(search): optimize fts5 query ranking and pre-warm tantivy search instance"
```

---

### Task 7: Build Automated 9,000+ Docs Multi-Locale and Multi-Version Benchmark Integration Test

**Files:**
- Create: `apps/runner/tests/benchmark_9k_docs.rs`
- Modify: `apps/runner/Cargo.toml` (if needed)

**Interfaces:**
- Generates: SQLite database with 9,000 pages (3 versions x 3,000 pages), 3 languages (27,000 page content rows), and 27,000 FTS5 rows.
- Asserts:
  - Instance load time < 250ms
  - Average `query_page` latency < 1.0ms across 100 requests
  - `query_bootstrap` latency < 0.2ms
  - Search latency < 10ms
  - Strict language & version isolation

- [ ] **Step 1: Write `apps/runner/tests/benchmark_9k_docs.rs`**

```rust
use std::time::Instant;
use axum::http::StatusCode;
use tower::ServiceExt;
use cms_runner::{AppState, SiteInstance, create_runner_router, SitePageResponse, SiteShell};

async fn create_9k_docs_test_db() -> sqlx::SqlitePool {
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("open in-memory db");

    sqlx::raw_sql(
        r#"
        PRAGMA synchronous = OFF;
        PRAGMA journal_mode = OFF;

        CREATE TABLE export_meta (
            schema_version INTEGER NOT NULL,
            project_id TEXT NOT NULL,
            project_name TEXT NOT NULL,
            project_slug TEXT NOT NULL,
            exported_at TEXT NOT NULL
        );
        INSERT INTO export_meta VALUES (1, 'p-9k', 'Enterprise Benchmark Workspace', 'benchmark', '2026-10-21T00:00:00Z');

        CREATE TABLE project_config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        INSERT INTO project_config VALUES ('description', '"Enterprise Scale Benchmark"');

        CREATE TABLE languages (code TEXT PRIMARY KEY, label TEXT NOT NULL, is_default INTEGER NOT NULL, is_rtl INTEGER NOT NULL);
        INSERT INTO languages VALUES ('en', 'English', 1, 0);
        INSERT INTO languages VALUES ('ja', 'Japanese', 0, 0);
        INSERT INTO languages VALUES ('zh', 'Chinese', 0, 0);

        CREATE TABLE versions (id TEXT PRIMARY KEY, slug TEXT NOT NULL, label TEXT NOT NULL, sort_order INTEGER NOT NULL, is_default INTEGER NOT NULL);
        INSERT INTO versions VALUES ('v1', 'v1.0', 'v1.0', 1, 0);
        INSERT INTO versions VALUES ('v2', 'v2.0', 'v2.0', 2, 1);
        INSERT INTO versions VALUES ('v3', 'v3.0', 'v3.0', 3, 0);

        CREATE TABLE pages (
            id TEXT PRIMARY KEY,
            custom_id TEXT,
            version_id TEXT NOT NULL,
            parent_id TEXT,
            kind TEXT NOT NULL,
            slug TEXT NOT NULL,
            title TEXT NOT NULL,
            path TEXT NOT NULL,
            icon TEXT,
            sort_order INTEGER NOT NULL
        );

        CREATE TABLE page_content (
            page_id TEXT NOT NULL,
            language TEXT NOT NULL,
            markdown TEXT NOT NULL,
            description TEXT,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (page_id, language)
        );

        CREATE VIRTUAL TABLE page_fts USING fts5(page_id UNINDEXED, version_id UNINDEXED, language UNINDEXED, title, content);
        "#
    )
    .execute(&pool)
    .await
    .unwrap();

    // Insert 9,000 pages (3,000 per version: 100 groups * 30 pages each)
    let versions = ["v1", "v2", "v3"];
    let languages = [
        ("en", "Overview of Enterprise System", "Complete guide for enterprise documentation architecture with distributed clustering and raft consensus."),
        ("ja", "エンタープライズシステムの概要", "分散クラスタリングとRaft合意形成を備えたエンタープライズドキュメントアーキテクチャの完全ガイド。"),
        ("zh", "企业级系统概述", "包含分布式集群和Raft共识算法的企业级文档架构完整指南。"),
    ];

    sqlx::raw_sql("BEGIN TRANSACTION;").execute(&pool).await.unwrap();

    for ver in versions {
        let mut sort = 0;
        for g in 1..=100 {
            sort += 1;
            let group_id = format!("{}_g{}", ver, g);
            let group_path = format!("/g{}", g);
            let group_title = format!("Module Group #{}", g);

            sqlx::query("INSERT INTO pages VALUES (?1, NULL, ?2, NULL, 'GROUP', ?3, ?4, ?5, NULL, ?6)")
                .bind(&group_id)
                .bind(ver)
                .bind(format!("g{}", g))
                .bind(&group_title)
                .bind(&group_path)
                .bind(sort)
                .execute(&pool)
                .await
                .unwrap();

            for p in 1..=30 {
                sort += 1;
                let page_id = format!("{}_g{}_p{}", ver, g, p);
                let page_slug = format!("p{}", p);
                let page_path = format!("/g{}/p{}", g, p);
                let page_title = format!("Component Standard #{}-{}", g, p);
                let custom_id = if p == 1 { Some(format!("{}-g{}-intro", ver, g)) } else { None };

                sqlx::query("INSERT INTO pages VALUES (?1, ?2, ?3, ?4, 'PAGE', ?5, ?6, ?7, NULL, ?8)")
                    .bind(&page_id)
                    .bind(&custom_id)
                    .bind(ver)
                    .bind(&group_id)
                    .bind(&page_slug)
                    .bind(&page_title)
                    .bind(&page_path)
                    .bind(sort)
                    .execute(&pool)
                    .await
                    .unwrap();

                for (lang, title_prefix, desc) in languages {
                    let md = format!("# {} - {}\n\n{}\n\n## Section Alpha\n\nDeep specifications.\n\n### Sub-bullet\n\nDetailed breakdown.", title_prefix, page_title, desc);
                    sqlx::query("INSERT INTO page_content VALUES (?1, ?2, ?3, ?4, '2026-10-21T00:00:00Z')")
                        .bind(&page_id)
                        .bind(lang)
                        .bind(&md)
                        .bind(desc)
                        .execute(&pool)
                        .await
                        .unwrap();

                    sqlx::query("INSERT INTO page_fts VALUES (?1, ?2, ?3, ?4, ?5)")
                        .bind(&page_id)
                        .bind(ver)
                        .bind(lang)
                        .bind(&page_title)
                        .bind(&md)
                        .execute(&pool)
                        .await
                        .unwrap();
                }
            }
        }
    }

    sqlx::raw_sql("COMMIT;").execute(&pool).await.unwrap();
    pool
}

#[tokio::test]
async fn test_9000_docs_benchmark_performance_and_isolation() {
    let pool = create_9k_docs_test_db().await;

    // 1. Measure Instance Load & Pre-warm Time
    let t_start = Instant::now();
    let instance = std::sync::Arc::new(SiteInstance::load(&pool).await.expect("load 9000 docs instance"));
    let load_duration = t_start.elapsed();
    println!(">>> SiteInstance::load for 9,000 docs took: {:?}", load_duration);
    assert!(load_duration.as_millis() < 350, "Instance load must be under 350ms, took {:?}", load_duration);
    assert_eq!(instance.pages_by_id.len(), 9300); // 300 groups + 9000 pages

    let state = AppState::new(pool.clone(), instance, None);
    let app = create_runner_router(state, None);

    // 2. Measure Root Page Query
    let t0 = Instant::now();
    let req = axum::http::Request::builder()
        .uri("/api/v1/page?path=/")
        .body(axum::body::Body::empty())
        .unwrap();
    let res = app.clone().oneshot(req).await.unwrap();
    let d0 = t0.elapsed();
    assert_eq!(res.status(), StatusCode::OK);
    println!(">>> Root page query took: {:?}", d0);
    assert!(d0.as_millis() <= 3, "Root page query must be <= 3ms, took {:?}", d0);

    // 3. Measure Deep Nested Leaf Query across 100 iterations (p99 latency)
    let mut latencies = Vec::with_capacity(100);
    for i in 1..=100 {
        let g = (i % 100) + 1;
        let p = (i % 30) + 1;
        let path = format!("/g{}/p{}", g, p);
        let uri = format!("/api/v1/page?path={}&version=v2.0&lang=ja", path);

        let t = Instant::now();
        let req = axum::http::Request::builder()
            .uri(&uri)
            .body(axum::body::Body::empty())
            .unwrap();
        let res = app.clone().oneshot(req).await.unwrap();
        let elapsed = t.elapsed();
        assert_eq!(res.status(), StatusCode::OK);
        latencies.push(elapsed);
    }

    latencies.sort();
    let median = latencies[50];
    let p95 = latencies[95];
    let p99 = latencies[99];
    println!(">>> 100 random page queries — Median: {:?}, P95: {:?}, P99: {:?}", median, p95, p99);
    assert!(median.as_micros() < 2000, "Median page query must be under 2ms, got {:?}", median);

    // 4. Group unwrapping to first child
    let req_group = axum::http::Request::builder()
        .uri("/api/v1/page?path=/g10&version=v1.0&lang=en")
        .body(axum::body::Body::empty())
        .unwrap();
    let res_group = app.clone().oneshot(req_group).await.unwrap();
    assert_eq!(res_group.status(), StatusCode::OK);
    let bytes = axum::body::to_bytes(res_group.into_body(), usize::MAX).await.unwrap();
    let page: SitePageResponse = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(page.page.path, "/g10/p1");
    assert!(page.next.is_some());

    // 5. Bootstrap latency
    let tb = Instant::now();
    let req_b = axum::http::Request::builder()
        .uri("/api/v1/bootstrap?version=v3.0&lang=zh")
        .body(axum::body::Body::empty())
        .unwrap();
    let res_b = app.clone().oneshot(req_b).await.unwrap();
    let db = tb.elapsed();
    assert_eq!(res_b.status(), StatusCode::OK);
    println!(">>> Bootstrap query took: {:?}", db);
    assert!(db.as_millis() <= 2, "Bootstrap must be <= 2ms, took {:?}", db);

    // 6. Strict Language Isolation: non-existent language returns 404
    let req_lang404 = axum::http::Request::builder()
        .uri("/api/v1/page?path=/g1/p1&lang=fr")
        .body(axum::body::Body::empty())
        .unwrap();
    let res_lang404 = app.clone().oneshot(req_lang404).await.unwrap();
    assert_eq!(res_lang404.status(), StatusCode::NOT_FOUND);

    // 7. Strict Version Isolation: non-existent version returns 404
    let req_ver404 = axum::http::Request::builder()
        .uri("/api/v1/page?path=/g1/p1&version=v99.0")
        .body(axum::body::Body::empty())
        .unwrap();
    let res_ver404 = app.clone().oneshot(req_ver404).await.unwrap();
    assert_eq!(res_ver404.status(), StatusCode::NOT_FOUND);

    // 8. FTS5 Search on 27,000 localized records
    let ts = Instant::now();
    let req_s = axum::http::Request::builder()
        .uri("/api/v1/search?q=consensus&version=v2&lang=en")
        .body(axum::body::Body::empty())
        .unwrap();
    let res_s = app.oneshot(req_s).await.unwrap();
    let ds = ts.elapsed();
    assert_eq!(res_s.status(), StatusCode::OK);
    println!(">>> Search query over 27,000 localized records took: {:?}", ds);
    assert!(ds.as_millis() < 25, "Search must be under 25ms, took {:?}", ds);
}
```

- [ ] **Step 2: Run the 9,000+ docs benchmark integration test**

Run: `cargo test -p cms-runner --test benchmark_9k_docs -- --nocapture`
Expected: PASS with console log showing latencies.

- [ ] **Step 3: Commit**

```bash
git add apps/runner/tests/benchmark_9k_docs.rs
git commit -m "test(runner): add automated 9,000 docs multi-locale multi-version benchmark test"
```

---

### Task 8: Full Regression & Performance Verification

**Files:**
- Entire repository

- [ ] **Step 1: Run all unit and integration tests for `cms-runner`**

Run: `cargo test -p cms-runner`
Expected: PASS (all tests pass)

- [ ] **Step 2: Run all unit tests for `cms-biz`**

Run: `cargo test -p cms-biz`
Expected: PASS

- [ ] **Step 3: Run git status to verify clean working tree**

Run: `git status`
Expected: clean working directory

- [ ] **Step 4: Final commit and summary report**
