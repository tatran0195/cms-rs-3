use std::path::{Path, PathBuf};
use std::time::Duration;
use clap::Parser;
use serde::{Deserialize, Serialize};
use crate::diagnostics::{check_sqlite_integrity, DiagnosticItem};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SyncWorkerStatus {
    pub enabled: bool,
    pub server_url: Option<String>,
    pub interval_secs: u64,
    pub project: Option<String>,
    pub branch: Option<String>,
    pub last_polled_at: Option<String>,
    pub last_synced_at: Option<String>,
    pub last_job_id: Option<String>,
    pub last_error: Option<String>,
    pub sync_count: u64,
}

impl Default for SyncWorkerStatus {
    fn default() -> Self {
        Self {
            enabled: false,
            server_url: None,
            interval_secs: 30,
            project: None,
            branch: None,
            last_polled_at: None,
            last_synced_at: None,
            last_job_id: None,
            last_error: None,
            sync_count: 0,
        }
    }
}

#[derive(Debug, Clone)]
pub struct RunnerSyncConfig {
    pub enabled: bool,
    pub server_url: String,
    pub interval: Duration,
    pub project: Option<String>,
    pub branch: Option<String>,
    pub token: Option<String>,
}

impl RunnerSyncConfig {
    pub fn from_serve_args(args: &crate::ServeArgs) -> Self {
        let env_auto = std::env::var("CMS_AUTO_SYNC")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true") || v.eq_ignore_ascii_case("yes"))
            .unwrap_or(false);
        let enabled = args.sync || args.sync_url.is_some() || env_auto;
        let server_url = args
            .sync_url
            .clone()
            .or_else(|| std::env::var("CMS_SYNC_URL").ok())
            .unwrap_or_else(|| "http://localhost:3000".to_string());
        let interval = Duration::from_secs(args.sync_interval.max(5));
        let project = args
            .sync_project
            .clone()
            .or_else(|| std::env::var("CMS_SYNC_PROJECT").ok());
        let branch = args
            .sync_branch
            .clone()
            .or_else(|| std::env::var("CMS_SYNC_BRANCH").ok());
        let token = args
            .sync_token
            .clone()
            .or_else(|| std::env::var("CMS_SYNC_TOKEN").ok())
            .or_else(|| std::env::var("CMS_API_TOKEN").ok());

        Self {
            enabled,
            server_url,
            interval,
            project,
            branch,
            token,
        }
    }
}

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

/// Executes a single polling and sync cycle.
/// Returns Ok(true) if a new database was pulled and reloaded,
/// or Ok(false) if the documentation was already up to date.
pub async fn poll_and_sync_cycle(
    state: &crate::AppState,
    config: &RunnerSyncConfig,
) -> anyhow::Result<bool> {
    let db_path = state
        .db_path
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("No database path configured on runner server"))?
        .clone();

    let now_str = chrono::Utc::now().to_rfc3339();
    {
        let mut status = state.sync_status.write().await;
        status.last_polled_at = Some(now_str);
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()?;

    let clean_base = config.server_url.trim_end_matches('/');

    // Case 1: Direct .sqlite file URL
    if clean_base.ends_with(".sqlite") || clean_base.ends_with("/download") {
        let mut req = client.get(clean_base);
        if let Some(ref tok) = config.token.as_ref().filter(|t| !t.trim().is_empty()) {
            req = req.bearer_auth(tok);
        }

        let resp = req.send().await?;
        if !resp.status().is_success() {
            anyhow::bail!("Direct download URL returned HTTP {}", resp.status());
        }

        let bytes = resp.bytes().await?;
        let _report = verify_and_swap_sqlite(&db_path, &bytes).await?;
        let stats = state.reload().await?;

        {
            let mut status = state.sync_status.write().await;
            status.last_synced_at = Some(chrono::Utc::now().to_rfc3339());
            status.last_error = None;
            status.sync_count += 1;
        }

        tracing::info!(
            "✓ Runner sync: Successfully pulled and reloaded database from direct URL ({} pages)",
            stats.page_count
        );
        return Ok(true);
    }

    // Case 2: Standard CMS API endpoint - query completed export jobs
    let mut jobs_url = format!("{clean_base}/api/v1/export/jobs?status=completed&format=sqlite&limit=5");
    if let Some(ref proj) = config.project {
        jobs_url.push_str(&format!("&project_id={proj}"));
    }

    let mut req = client.get(&jobs_url);
    if let Some(ref tok) = config.token.as_ref().filter(|t| !t.trim().is_empty()) {
        req = req.bearer_auth(tok);
    }

    let resp = req.send().await.map_err(|e| {
        anyhow::anyhow!("Failed to query export jobs from {jobs_url}: {e}")
    })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        anyhow::bail!("API server returned HTTP {status} for export jobs: {text}");
    }

    let jobs_json: serde_json::Value = resp.json().await?;
    let items = jobs_json
        .get("items")
        .and_then(|v| v.as_array())
        .ok_or_else(|| anyhow::anyhow!("Invalid response from export jobs endpoint (missing 'items')"))?;

    if items.is_empty() {
        tracing::debug!("Runner sync: No completed SQLite export jobs found on server.");
        return Ok(false);
    }

    // Find latest matching job (respecting branch if specified)
    let latest_job = if let Some(ref branch) = config.branch {
        items.iter().find(|job| {
            let snap = &job["snapshot"];
            snap["branchName"].as_str() == Some(branch)
                || snap["branch"].as_str() == Some(branch)
                || snap["versionName"].as_str() == Some(branch)
                || snap["slug"].as_str() == Some(branch)
        }).unwrap_or(&items[0])
    } else {
        &items[0]
    };

    let job_id = latest_job
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("Export job missing 'id'"))?;
    let completed_at = latest_job
        .get("completed_at")
        .or_else(|| latest_job.get("completedAt"))
        .and_then(|v| v.as_str());

    // Check if we already synced this job
    let last_job_id = {
        state.sync_status.read().await.last_job_id.clone()
    };

    if last_job_id.as_deref() == Some(job_id) {
        tracing::debug!("Runner sync: Already up to date with job {job_id}");
        return Ok(false);
    }

    // If last_job_id is None (fresh runner start), check current DB exported_at
    if last_job_id.is_none() {
        let current_exported_at = state.get_instance().await.generated_at.clone();
        if let Some(comp) = completed_at {
            if comp <= current_exported_at.as_str() {
                let mut status = state.sync_status.write().await;
                status.last_job_id = Some(job_id.to_string());
                tracing::debug!("Runner sync: Current database is already up to date ({current_exported_at})");
                return Ok(false);
            }
        }
    }

    tracing::info!("Runner sync: New documentation export detected: {job_id} (completed: {:?}). Pulling...", completed_at);

    // Resolve download URL for this job
    let dl_meta_url = format!("{clean_base}/api/v1/export/jobs/{job_id}/download");
    let mut dl_meta_req = client.get(&dl_meta_url);
    if let Some(ref tok) = config.token.as_ref().filter(|t| !t.trim().is_empty()) {
        dl_meta_req = dl_meta_req.bearer_auth(tok);
    }

    let dl_resp = dl_meta_req.send().await?;
    if !dl_resp.status().is_success() {
        anyhow::bail!("Failed to get download URL for job {job_id}: HTTP {}", dl_resp.status());
    }

    let dl_json: serde_json::Value = dl_resp.json().await?;
    let raw_url = dl_json
        .get("download_url")
        .or_else(|| dl_json.get("downloadUrl"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("Missing 'download_url' in job response"))?;

    let resolved_url = if raw_url.starts_with("http://") || raw_url.starts_with("https://") {
        raw_url.to_string()
    } else {
        format!("{clean_base}{}", if raw_url.starts_with('/') { "" } else { "/" }) + raw_url
    };

    // Download SQLite binary
    let mut download_req = client.get(&resolved_url);
    if let Some(ref tok) = config.token.as_ref().filter(|t| !t.trim().is_empty()) {
        download_req = download_req.bearer_auth(tok);
    }

    let download_resp = download_req.send().await?;
    if !download_resp.status().is_success() {
        anyhow::bail!("Failed to download database artifact from {resolved_url}: HTTP {}", download_resp.status());
    }

    let bytes = download_resp.bytes().await?;
    let report = verify_and_swap_sqlite(&db_path, &bytes).await?;
    let stats = state.reload().await?;

    {
        let mut status = state.sync_status.write().await;
        status.last_synced_at = Some(chrono::Utc::now().to_rfc3339());
        status.last_job_id = Some(job_id.to_string());
        status.last_error = None;
        status.sync_count += 1;
    }

    tracing::info!(
        "✓ Runner sync: Successfully pulled new documentation database (job {}, {} pages, {})",
        job_id,
        stats.page_count,
        report.message
    );
    println!(
        "✓ Runner sync: Pulled new database from server ({} pages reloaded)",
        stats.page_count
    );

    Ok(true)
}

/// Spawns the background sync worker task if enabled in configuration.
pub fn spawn_runner_sync_worker(
    state: crate::AppState,
    config: RunnerSyncConfig,
) -> Option<tokio::task::JoinHandle<()>> {
    if !config.enabled {
        tracing::debug!("Background documentation sync worker is disabled.");
        return None;
    }

    let server_url = config.server_url.clone();
    let interval = config.interval;
    let project = config.project.clone();
    let branch = config.branch.clone();

    // Initialize sync_status in state
    {
        let state_clone = state.clone();
        tokio::spawn(async move {
            let mut status = state_clone.sync_status.write().await;
            status.enabled = true;
            status.server_url = Some(server_url);
            status.interval_secs = interval.as_secs();
            status.project = project;
            status.branch = branch;
        });
    }

    tracing::info!(
        "Starting background documentation sync worker (polling '{}' every {}s)...",
        config.server_url,
        config.interval.as_secs()
    );
    println!(
        "✓ Background documentation sync worker active: polling '{}' every {}s",
        config.server_url,
        config.interval.as_secs()
    );

    let handle = tokio::spawn(async move {
        // Run first check after a brief 2-second warm-up
        tokio::time::sleep(Duration::from_secs(2)).await;

        loop {
            if let Err(e) = poll_and_sync_cycle(&state, &config).await {
                tracing::warn!("Runner sync worker polling error: {}", e);
                let mut status = state.sync_status.write().await;
                status.last_error = Some(e.to_string());
            }

            tokio::time::sleep(config.interval).await;
        }
    });

    Some(handle)
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

    #[test]
    fn test_runner_sync_config_defaults_and_explicit() {
        // Default: disabled
        let default_serve = crate::ServeArgs::default();
        let cfg = RunnerSyncConfig::from_serve_args(&default_serve);
        assert!(!cfg.enabled, "Sync should be disabled by default");
        assert_eq!(cfg.server_url, "http://localhost:3000");

        // Explicit enable via --sync
        let mut enabled_serve = crate::ServeArgs::default();
        enabled_serve.sync = true;
        enabled_serve.sync_url = Some("http://192.168.1.50:3000".to_string());
        enabled_serve.sync_interval = 15;
        enabled_serve.sync_project = Some("proj-123".to_string());
        enabled_serve.sync_branch = Some("feature-v2".to_string());
        enabled_serve.sync_token = Some("secret-token".to_string());

        let cfg2 = RunnerSyncConfig::from_serve_args(&enabled_serve);
        assert!(cfg2.enabled);
        assert_eq!(cfg2.server_url, "http://192.168.1.50:3000");
        assert_eq!(cfg2.interval, Duration::from_secs(15));
        assert_eq!(cfg2.project.as_deref(), Some("proj-123"));
        assert_eq!(cfg2.branch.as_deref(), Some("feature-v2"));
        assert_eq!(cfg2.token.as_deref(), Some("secret-token"));
    }

    #[test]
    fn test_sync_status_default() {
        let status = SyncWorkerStatus::default();
        assert!(!status.enabled);
        assert_eq!(status.sync_count, 0);
        assert!(status.last_synced_at.is_none());
        assert!(status.last_job_id.is_none());
        assert!(status.last_error.is_none());
    }
}
