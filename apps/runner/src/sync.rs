use std::path::{Path, PathBuf};
use std::time::Duration;
use clap::Parser;
use crate::diagnostics::{check_sqlite_integrity, DiagnosticItem};

#[derive(Parser, Debug, Clone)]
pub struct SyncArgs {
    /// URL of the hosted CMS API or direct export artifact download URL
    #[arg(long, default_value = "http://localhost:8080")]
    pub url: String,

    /// Project ID or slug to sync documentation for
    #[arg(long)]
    pub project: Option<String>,

    /// API authentication token (Bearer token or API Key, or via CMS_API_TOKEN env var)
    #[arg(long)]
    pub token: Option<String>,

    /// Target path to save the SQLite database (default: docs.sqlite)
    #[arg(short, long, default_value = "docs.sqlite")]
    pub db: PathBuf,

    /// Target directory for site export containing docs.sqlite
    #[arg(long)]
    pub dir: Option<PathBuf>,

    /// Port of the local cms-site server to notify for hot reload (default: 8080)
    #[arg(short, long, default_value_t = 8080)]
    pub port: u16,

    /// Watch and poll for updates continuously at the specified interval in seconds
    #[arg(long)]
    pub watch: Option<u64>,

    /// Skip notifying local server via POST /api/v1/reload after sync
    #[arg(long)]
    pub no_reload: bool,
}

/// Atomically writes content to a temporary file, verifies SQLite integrity and schema v1,
/// and only swaps to the final destination if verification completely passes.
pub async fn verify_and_swap_sqlite(target_db: &Path, content: &[u8]) -> anyhow::Result<DiagnosticItem> {
    let tmp_path = target_db.with_extension("tmp");

    if let Some(parent) = target_db.parent() {
        std::fs::create_dir_all(parent)?;
    }

    // Write to .tmp first
    std::fs::write(&tmp_path, content)?;

    // Verify integrity before replacing target
    let report = check_sqlite_integrity(&tmp_path).await;
    if !report.passed {
        let _ = std::fs::remove_file(&tmp_path);
        anyhow::bail!("SQLite integrity check failed on downloaded artifact: {}", report.message);
    }

    // Atomically replace target
    std::fs::rename(&tmp_path, target_db)?;
    Ok(report)
}

/// Sends a POST /api/v1/reload request to the locally running cms-site server.
pub async fn notify_local_reload(port: u16) -> anyhow::Result<bool> {
    let reload_url = format!("http://127.0.0.1:{}/api/v1/reload", port);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(1500))
        .build()?;

    let resp = match client
        .post(&reload_url)
        .header(reqwest::header::HOST, format!("127.0.0.1:{}", port))
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            tracing::info!(
                "Local server on port {} not running or unreachable ({}); skipped hot reload notification.",
                port,
                e
            );
            return Ok(false);
        }
    };

    if resp.status().is_success() {
        let json_body: serde_json::Value = resp.json().await.unwrap_or_default();
        let proj = json_body["stats"]["projectName"].as_str().unwrap_or("docs");
        let pages = json_body["stats"]["pageCount"].as_i64().unwrap_or(0);
        println!("✓ Notified local cms-site server on port {}: reloaded '{}' ({} pages)", port, proj, pages);
        Ok(true)
    } else {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        tracing::warn!("Local reload request returned HTTP {}: {}", status, text);
        Ok(false)
    }
}

/// Resolves the direct download URL for the latest completed SQLite export job.
pub async fn resolve_download_url(
    client: &reqwest::Client,
    base_url: &str,
    project: Option<&str>,
    token: Option<&str>,
) -> anyhow::Result<String> {
    let clean_base = base_url.trim_end_matches('/');

    // If base_url already points directly to a file or download endpoint, use it directly
    if clean_base.ends_with(".sqlite") || clean_base.ends_with("/download") {
        return Ok(clean_base.to_string());
    }

    // Build export jobs list query
    let mut jobs_url = format!("{}/api/v1/export/jobs?status=completed&format=sqlite&limit=1", clean_base);
    if let Some(proj) = project.filter(|p| !p.trim().is_empty()) {
        jobs_url.push_str(&format!("&project_id={}", proj));
    }

    let mut req = client.get(&jobs_url);
    if let Some(tok) = token.filter(|t| !t.trim().is_empty()) {
        req = req.bearer_auth(tok);
    }

    let resp = req.send().await.map_err(|e| {
        anyhow::anyhow!("Failed to query export jobs from {}: {}", jobs_url, e)
    })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        anyhow::bail!("API server returned HTTP {} when querying export jobs: {}", status, text);
    }

    let jobs_json: serde_json::Value = resp.json().await?;
    let items = jobs_json.get("items")
        .and_then(|v| v.as_array())
        .ok_or_else(|| anyhow::anyhow!("Invalid response from export jobs endpoint (missing 'items' array)"))?;

    if items.is_empty() {
        anyhow::bail!("No completed SQLite export jobs found on server for project: {:?}", project);
    }

    let job_id = items[0].get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("Export job missing 'id' string"))?;

    // Query download URL for the job
    let dl_meta_url = format!("{}/api/v1/export/jobs/{}/download", clean_base, job_id);
    let mut dl_req = client.get(&dl_meta_url);
    if let Some(tok) = token.filter(|t| !t.trim().is_empty()) {
        dl_req = dl_req.bearer_auth(tok);
    }

    let dl_resp = dl_req.send().await?;
    if !dl_resp.status().is_success() {
        anyhow::bail!("Failed to get download URL for job {}: HTTP {}", job_id, dl_resp.status());
    }

    let dl_json: serde_json::Value = dl_resp.json().await?;
    let raw_url = dl_json.get("download_url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("Missing 'download_url' in job download response"))?;

    let resolved_url = if raw_url.starts_with("http://") || raw_url.starts_with("https://") {
        raw_url.to_string()
    } else {
        format!("{}{}", clean_base, if raw_url.starts_with('/') { "" } else { "/" }) + raw_url
    };

    Ok(resolved_url)
}

/// Executes a single sync cycle.
pub async fn run_sync_once(args: &SyncArgs) -> anyhow::Result<()> {
    let target_db = if let Some(ref dir) = args.dir {
        dir.join("docs.sqlite")
    } else {
        args.db.clone()
    };

    println!("Syncing documentation from {}...", args.url);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()?;

    let effective_token = args.token.clone().or_else(|| std::env::var("CMS_API_TOKEN").ok());

    let download_url = resolve_download_url(
        &client,
        &args.url,
        args.project.as_deref(),
        effective_token.as_deref(),
    )
    .await?;

    println!("Downloading latest export artifact from: {}", download_url);

    let mut dl_req = client.get(&download_url);
    if let Some(ref tok) = effective_token.as_ref().filter(|t| !t.trim().is_empty()) {
        dl_req = dl_req.bearer_auth(tok);
    }

    let resp = dl_req.send().await?;
    if !resp.status().is_success() {
        anyhow::bail!("Failed to download export artifact: HTTP {}", resp.status());
    }

    let bytes = resp.bytes().await?;
    println!("Downloaded {:.2} MB. Verifying SQLite integrity...", (bytes.len() as f64) / (1024.0 * 1024.0));

    let report = verify_and_swap_sqlite(&target_db, &bytes).await?;
    println!("✓ SQLite verification passed: {}", report.message);
    println!("✓ Successfully updated {}", target_db.display());

    if !args.no_reload {
        let _ = notify_local_reload(args.port).await;
    }

    Ok(())
}

/// Main entrypoint for cms-site sync command (supports single sync or --watch loop).
pub async fn run_sync(args: SyncArgs) -> anyhow::Result<()> {
    match args.watch {
        Some(interval_secs) => {
            let interval = Duration::from_secs(interval_secs.max(5));
            println!("Starting cms-site sync watcher (polling every {} seconds)...", interval.as_secs());

            loop {
                if let Err(e) = run_sync_once(&args).await {
                    eprintln!("! Sync cycle failed: {}", e);
                }
                tokio::time::sleep(interval).await;
            }
        }
        None => run_sync_once(&args).await,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_sync_atomic_replace_verifies_integrity() {
        let temp = tempfile::tempdir().unwrap();
        let target_db = temp.path().join("docs.sqlite");
        let corrupt_bytes = b"corrupt sqlite content";

        let res = verify_and_swap_sqlite(&target_db, corrupt_bytes).await;
        assert!(res.is_err(), "Corrupt sqlite bytes must fail verification");
        assert!(!target_db.exists(), "Target file must not be created if integrity check fails");
    }

    #[tokio::test]
    async fn test_sync_atomic_replace_success_on_valid_sqlite() {
        let temp = tempfile::tempdir().unwrap();
        let target_db = temp.path().join("docs.sqlite");
        let source_db = temp.path().join("source.sqlite");

        // Create valid sqlite db
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .connect_with(
                sqlx::sqlite::SqliteConnectOptions::new()
                    .filename(&source_db)
                    .create_if_missing(true),
            )
            .await
            .unwrap();

        sqlx::query(
            "CREATE TABLE export_meta (project_id TEXT PRIMARY KEY, project_name TEXT NOT NULL, project_slug TEXT NOT NULL, exported_at TEXT NOT NULL, schema_version INTEGER NOT NULL DEFAULT 1); \
             INSERT INTO export_meta VALUES ('p1', 'Valid Sync Project', 'sync', '2026-10-17T00:00:00Z', 1); \
             CREATE TABLE pages (id TEXT PRIMARY KEY); \
             CREATE TABLE page_content (page_id TEXT, language TEXT, PRIMARY KEY(page_id, language)); \
             CREATE TABLE versions (id TEXT PRIMARY KEY); \
             CREATE TABLE languages (code TEXT PRIMARY KEY);"
        )
        .execute(&pool)
        .await
        .unwrap();

        pool.close().await;

        let valid_bytes = std::fs::read(&source_db).unwrap();
        let report = verify_and_swap_sqlite(&target_db, &valid_bytes).await.unwrap();
        assert!(report.passed);
        assert!(target_db.exists(), "Target file must exist after successful swap");
    }
}
