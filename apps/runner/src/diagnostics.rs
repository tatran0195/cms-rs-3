use std::path::Path;
use sqlx::{Row, SqlitePool};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiagnosticItem {
    pub category: String,
    pub name: String,
    pub passed: bool,
    pub message: String,
}

impl DiagnosticItem {
    pub fn ok(category: impl Into<String>, name: impl Into<String>, msg: impl Into<String>) -> Self {
        Self {
            category: category.into(),
            name: name.into(),
            passed: true,
            message: msg.into(),
        }
    }

    pub fn fail(category: impl Into<String>, name: impl Into<String>, msg: impl Into<String>) -> Self {
        Self {
            category: category.into(),
            name: name.into(),
            passed: false,
            message: msg.into(),
        }
    }

    pub fn warn(category: impl Into<String>, name: impl Into<String>, msg: impl Into<String>) -> Self {
        Self {
            category: category.into(),
            name: name.into(),
            passed: true,
            message: msg.into(),
        }
    }
}

/// Checks the integrity and schema version of the SQLite export database.
pub async fn check_sqlite_integrity(db_path: &Path) -> DiagnosticItem {
    if !db_path.exists() {
        return DiagnosticItem::fail(
            "Database",
            "File Exists",
            format!("Database file not found at: {}", db_path.display()),
        );
    }

    let file_size = match std::fs::metadata(db_path) {
        Ok(m) => m.len(),
        Err(e) => {
            return DiagnosticItem::fail(
                "Database",
                "File Access",
                format!("Failed to read metadata for {}: {}", db_path.display(), e),
            );
        }
    };

    if file_size == 0 {
        return DiagnosticItem::fail(
            "Database",
            "File Size",
            format!("Database file at {} is empty (0 bytes)", db_path.display()),
        );
    }

    let opts = sqlx::sqlite::SqliteConnectOptions::new()
        .filename(db_path)
        .read_only(true);

    let pool = match sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(opts)
        .await
    {
        Ok(p) => p,
        Err(e) => {
            return DiagnosticItem::fail(
                "Database",
                "SQLite Connection",
                format!("Failed to open SQLite database: {}", e),
            );
        }
    };

    // 1. PRAGMA integrity_check
    let integrity_row = match sqlx::query("PRAGMA integrity_check").fetch_one(&pool).await {
        Ok(r) => r,
        Err(e) => {
            return DiagnosticItem::fail(
                "Database",
                "PRAGMA Integrity Check",
                format!("Failed to run PRAGMA integrity_check: {}", e),
            );
        }
    };

    let check_result: String = integrity_row.try_get(0).unwrap_or_default();
    if check_result != "ok" {
        return DiagnosticItem::fail(
            "Database",
            "PRAGMA Integrity Check",
            format!("Integrity check failed: {}", check_result),
        );
    }

    // 2. Validate export_meta and schema_version
    let meta_row = match sqlx::query(
        "SELECT schema_version, project_id, project_name, exported_at FROM export_meta LIMIT 1",
    )
    .fetch_one(&pool)
    .await
    {
        Ok(r) => r,
        Err(e) => {
            return DiagnosticItem::fail(
                "Database",
                "Schema Validation",
                format!("Missing export_meta table or corrupted metadata: {}", e),
            );
        }
    };

    let schema_ver: i32 = meta_row.try_get(0).unwrap_or(0);
    let proj_name: String = meta_row.try_get(2).unwrap_or_else(|_| "Unknown".into());

    if schema_ver != 1 {
        return DiagnosticItem::fail(
            "Database",
            "Schema Version",
            format!(
                "Unsupported schema_version {} (expected 1) for project '{}'",
                schema_ver, proj_name
            ),
        );
    }

    // 3. Count pages and content records
    let page_count: i64 = sqlx::query("SELECT COUNT(*) FROM pages")
        .fetch_one(&pool)
        .await
        .and_then(|r| r.try_get(0))
        .unwrap_or(0);

    let content_count: i64 = sqlx::query("SELECT COUNT(*) FROM page_content")
        .fetch_one(&pool)
        .await
        .and_then(|r| r.try_get(0))
        .unwrap_or(0);

    let ver_count: i64 = sqlx::query("SELECT COUNT(*) FROM versions")
        .fetch_one(&pool)
        .await
        .and_then(|r| r.try_get(0))
        .unwrap_or(0);

    let lang_count: i64 = sqlx::query("SELECT COUNT(*) FROM languages")
        .fetch_one(&pool)
        .await
        .and_then(|r| r.try_get(0))
        .unwrap_or(0);

    DiagnosticItem::ok(
        "Database",
        "SQLite Integrity & Schema",
        format!(
            "'{}' (schema v{}) - {} pages, {} content rows, {} versions, {} languages ({:.2} MB, PRAGMA ok)",
            proj_name,
            schema_ver,
            page_count,
            content_count,
            ver_count,
            lang_count,
            (file_size as f64) / (1024.0 * 1024.0)
        ),
    )
}

/// Checks the Tantivy search index and SQLite FTS5 fallback.
pub async fn check_search_engine(db_path: &Path, idx_dir: Option<&Path>) -> DiagnosticItem {
    if let Some(dir) = idx_dir {
        if dir.exists() {
            match crate::TantivySiteSearch::open(dir) {
                Ok(search) => {
                    let doc_count = search.reader.searcher().num_docs();
                    return DiagnosticItem::ok(
                        "Search Engine",
                        "Tantivy Index",
                        format!(
                            "Loaded Tantivy index from {} with {} indexed documents",
                            dir.display(),
                            doc_count
                        ),
                    );
                }
                Err(e) => {
                    return DiagnosticItem::warn(
                        "Search Engine",
                        "Tantivy Index",
                        format!(
                            "Failed to open Tantivy index at {}: {}. Falling back to SQLite FTS5.",
                            dir.display(),
                            e
                        ),
                    );
                }
            }
        }
    }

    // Check SQLite FTS5
    if db_path.exists() {
        let opts = sqlx::sqlite::SqliteConnectOptions::new()
            .filename(db_path)
            .read_only(true);

        if let Ok(pool) = SqlitePool::connect_with(opts).await {
            match sqlx::query("SELECT count(*) FROM page_fts").fetch_one(&pool).await {
                Ok(r) => {
                    let fts_rows: i64 = r.try_get(0).unwrap_or(0);
                    return DiagnosticItem::ok(
                        "Search Engine",
                        "SQLite FTS5",
                        format!("SQLite FTS5 table operational (page_fts: {} entries)", fts_rows),
                    );
                }
                Err(e) => {
                    return DiagnosticItem::warn(
                        "Search Engine",
                        "SQLite FTS5",
                        format!("page_fts table missing or unreadable: {}", e),
                    );
                }
            }
        }
    }

    DiagnosticItem::warn(
        "Search Engine",
        "Search Index",
        "No Tantivy index found; standard database queries will be used for fallback",
    )
}

/// Checks Windows HKCU registry for PATH inclusion and cms-doc:// protocol registration.
pub fn check_windows_registry() -> Vec<DiagnosticItem> {
    #[cfg(windows)]
    {
        use winreg::enums::{HKEY_CURRENT_USER, KEY_READ};
        use winreg::RegKey;

        let mut items = Vec::new();
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);

        // 1. Check PATH
        let current_exe = match std::env::current_exe() {
            Ok(p) => p,
            Err(e) => {
                items.push(DiagnosticItem::fail(
                    "Registry",
                    "Current Executable",
                    format!("Failed to determine current executable path: {}", e),
                ));
                return items;
            }
        };

        let bin_dir = current_exe.parent().unwrap_or(Path::new("."));
        let bin_dir_str = bin_dir.to_string_lossy().to_string();

        match hkcu.open_subkey_with_flags("Environment", KEY_READ) {
            Ok(env_key) => {
                let user_path: String = env_key.get_value("Path").unwrap_or_default();
                let is_in_path = user_path.split(';').any(|p| {
                    p.trim().trim_end_matches(['\\', '/']).eq_ignore_ascii_case(
                        bin_dir_str.trim().trim_end_matches(['\\', '/']),
                    )
                });

                if is_in_path {
                    items.push(DiagnosticItem::ok(
                        "Registry",
                        "User PATH",
                        format!("'{}' is present in HKCU\\Environment PATH", bin_dir.display()),
                    ));
                } else {
                    items.push(DiagnosticItem::warn(
                        "Registry",
                        "User PATH",
                        format!(
                            "'{}' is NOT in HKCU\\Environment PATH. Run 'cms-site install' to add it.",
                            bin_dir.display()
                        ),
                    ));
                }
            }
            Err(e) => {
                items.push(DiagnosticItem::fail(
                    "Registry",
                    "User PATH",
                    format!("Failed to open HKCU\\Environment: {}", e),
                ));
            }
        }

        // 2. Check cms-doc:// protocol registration
        match hkcu.open_subkey_with_flags(r"Software\Classes\cms-doc\shell\open\command", KEY_READ) {
            Ok(cmd_key) => {
                let cmd_val: String = cmd_key.get_value("").unwrap_or_default();
                if !cmd_val.is_empty() {
                    items.push(DiagnosticItem::ok(
                        "Registry",
                        "Protocol Scheme",
                        format!("'cms-doc://' registered -> {}", cmd_val),
                    ));
                } else {
                    items.push(DiagnosticItem::warn(
                        "Registry",
                        "Protocol Scheme",
                        "'cms-doc://' registry key exists but has empty command string. Run 'cms-site install' to fix.",
                    ));
                }
            }
            Err(_) => {
                items.push(DiagnosticItem::warn(
                    "Registry",
                    "Protocol Scheme",
                    "'cms-doc://' URL protocol is not registered. Run 'cms-site install' to enable browser deep-linking.",
                ));
            }
        }

        items
    }

    #[cfg(not(windows))]
    {
        vec![DiagnosticItem::ok(
            "Registry",
            "Platform",
            "Windows registry checks skipped (non-Windows platform)",
        )]
    }
}

/// Checks whether the target HTTP port is available or if an existing cms-site is already running.
pub async fn check_port_collision(port: u16) -> DiagnosticItem {
    match tokio::net::TcpListener::bind(("127.0.0.1", port)).await {
        Ok(_) => DiagnosticItem::ok(
            "Network",
            "HTTP Port",
            format!("Port {} is available for binding", port),
        ),
        Err(_) => {
            // Port is in use. Probe http://127.0.0.1:{port}/healthz
            let probe_url = format!("http://127.0.0.1:{}/healthz", port);
            let client = match reqwest::Client::builder()
                .timeout(std::time::Duration::from_millis(800))
                .build()
            {
                Ok(c) => c,
                Err(e) => {
                    return DiagnosticItem::warn(
                        "Network",
                        "HTTP Port",
                        format!("Port {} is in use (failed to create probe client: {})", port, e),
                    );
                }
            };

            match client.get(&probe_url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    let is_cms = resp
                        .json::<serde_json::Value>()
                        .await
                        .map(|j| j.get("ok").and_then(|v| v.as_bool()).unwrap_or(false))
                        .unwrap_or(false);

                    if is_cms {
                        DiagnosticItem::ok(
                            "Network",
                            "HTTP Port",
                            format!(
                                "Port {} is in use by an active healthy cms-site instance (/healthz responded ok)",
                                port
                            ),
                        )
                    } else {
                        DiagnosticItem::warn(
                            "Network",
                            "HTTP Port",
                            format!(
                                "Port {} is in use by an unknown service (/healthz returned 200 without cms payload)",
                                port
                            ),
                        )
                    }
                }
                _ => DiagnosticItem::fail(
                    "Network",
                    "HTTP Port",
                    format!(
                        "Port {} is occupied by another application and cannot be bound by cms-site",
                        port
                    ),
                ),
            }
        }
    }
}

/// Runs the complete diagnostic suite and prints human-readable formatted results.
pub async fn run_doctor(db_path: &Path, idx_dir: Option<&Path>, port: u16) -> anyhow::Result<bool> {
    println!("\n╭──────────────────────────────────────────────────────────────╮");
    println!("│             CMS Documentation Site Doctor                    │");
    println!("╰──────────────────────────────────────────────────────────────╯\n");

    let mut all_items = Vec::new();

    // 1. Database
    let db_item = check_sqlite_integrity(db_path).await;
    all_items.push(db_item);

    // 2. Search Engine
    let search_item = check_search_engine(db_path, idx_dir).await;
    all_items.push(search_item);

    // 3. Registry
    let reg_items = check_windows_registry();
    all_items.extend(reg_items);

    // 4. Port
    let port_item = check_port_collision(port).await;
    all_items.push(port_item);

    // Output formatted report
    let mut critical_failures = 0;
    for item in &all_items {
        let symbol = if item.passed {
            "\x1b[32m[✓]\x1b[0m"
        } else {
            critical_failures += 1;
            "\x1b[31m[✗]\x1b[0m"
        };
        println!("{symbol} \x1b[1m[{}]\x1b[0m {}: {}", item.category, item.name, item.message);
    }

    println!();
    if critical_failures == 0 {
        println!("\x1b[32mAll critical diagnostic checks passed successfully.\x1b[0m\n");
        Ok(true)
    } else {
        println!(
            "\x1b[31m{} diagnostic check(s) failed. Please resolve the issues above.\x1b[0m\n",
            critical_failures
        );
        Ok(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_doctor_sqlite_integrity_check_detects_corrupt_file() {
        let temp = tempfile::tempdir().unwrap();
        let db_path = temp.path().join("docs.sqlite");
        std::fs::write(&db_path, b"not a valid sqlite file").unwrap();

        let item = check_sqlite_integrity(&db_path).await;
        assert!(!item.passed, "Corrupt sqlite file must fail integrity check");
    }

    #[tokio::test]
    async fn test_doctor_sqlite_missing_file() {
        let temp = tempfile::tempdir().unwrap();
        let db_path = temp.path().join("non_existent.sqlite");

        let item = check_sqlite_integrity(&db_path).await;
        assert!(!item.passed, "Missing sqlite file must fail");
    }

    #[tokio::test]
    async fn test_doctor_port_check_on_random_available_port() {
        // Find an available port by binding port 0
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);

        let item = check_port_collision(port).await;
        assert!(item.passed);
        assert!(item.message.contains("available"));
    }
}
