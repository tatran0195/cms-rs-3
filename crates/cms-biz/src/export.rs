//! Export Business Logic
//!
//! This module contains business logic for exporting projects and pages.

use std::sync::Arc;

use bytes::Bytes;
use chrono::Utc;
use cms_db::{
    export::{
        ExportArtifactQueries, ExportJobQueries, ExportScheduleQueries, ExportSnapshotQueries,
    },
    page::PageQueries,
    project::ProjectQueries,
};
use cms_entity::{
    common::PaginatedResponse,
    export::{
        CreateExportRequest, ExportArtifact, ExportFormat, ExportJob, ExportJobResponse,
        ExportSchedule, ExportSnapshot, ExportStatus,
    },
};
use cms_storage::Storage;

use crate::{AppError, BizContext};

/// Export service
pub struct ExportService;

impl ExportService {
    /// Create an export snapshot
    pub async fn create_export_snapshot(
        ctx: &BizContext,
        _user_id: &str,
        request: CreateExportRequest,
    ) -> Result<ExportSnapshot, AppError> {
        // Verify project exists
        let _project = ProjectQueries::get_by_id(&ctx.pool, &request.project_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Project not found".to_string()))?;

        // 1. Resolve branch_id (or default branch)
        let branch_id = if let Some(b) = request.branch_id.as_deref() {
            Some(b.to_string())
        } else {
            cms_db::branch::BranchQueries::get_default(&ctx.pool, &request.project_id)
                .await?
                .map(|b| b.id)
        };

        // 2. Count pages for this branch/project
        let pages_count: i32 = if let Some(ref b_id) = branch_id {
            sqlx::query_scalar(
                "SELECT COUNT(*)::int FROM \"Page\" WHERE project_id = $1 AND branch_id = $2",
            )
            .bind(&request.project_id)
            .bind(b_id)
            .fetch_one(&ctx.pool)
            .await
            .unwrap_or(0)
        } else {
            sqlx::query_scalar(
                "SELECT COUNT(*)::int FROM \"Page\" WHERE project_id = $1",
            )
            .bind(&request.project_id)
            .fetch_one(&ctx.pool)
            .await
            .unwrap_or(0)
        };

        // 3. Find active deployment version if available
        let deployment_version: Option<i64> = sqlx::query_scalar(
            "SELECT version FROM \"DeploymentSnapshot\" WHERE project_id = $1 ORDER BY version DESC LIMIT 1",
        )
        .bind(&request.project_id)
        .fetch_optional(&ctx.pool)
        .await
        .ok()
        .flatten();

        let snapshot = ExportSnapshotQueries::create(
            &ctx.pool,
            &request.project_id,
            branch_id.as_deref(),
            request.language_id.as_deref(),
            deployment_version,
            Some(pages_count),
        )
        .await?;

        Ok(snapshot)
    }

    /// Get an export snapshot
    pub async fn get_export_snapshot(
        ctx: &BizContext,
        _user_id: &str,
        snapshot_id: &str,
    ) -> Result<ExportSnapshot, AppError> {
        let snapshot = ExportSnapshotQueries::get_by_id(&ctx.pool, snapshot_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Export snapshot not found".to_string()))?;

        Ok(snapshot)
    }

    /// List export snapshots for a project
    pub async fn list_export_snapshots(
        ctx: &BizContext,
        _user_id: &str,
        project_id: &str,
        page: u64,
        page_size: u64,
    ) -> Result<PaginatedResponse<ExportSnapshot>, AppError> {
        let _project = ProjectQueries::get_by_id(&ctx.pool, project_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Project not found".to_string()))?;

        let limit = page_size.max(1) as i64;
        let offset = page.saturating_sub(1) as i64 * limit;
        let snapshots =
            ExportSnapshotQueries::get_by_project(&ctx.pool, project_id, Some(limit), Some(offset))
                .await?;

        let total = ExportSnapshotQueries::count_by_project(&ctx.pool, project_id).await?;

        Ok(PaginatedResponse::new(
            snapshots,
            total as u64,
            page,
            page_size,
        ))
    }

    /// Create an export job
    pub async fn create_export_job(
        ctx: &BizContext,
        _user_id: &str,
        snapshot_id: &str,
        project_id: Option<&str>,
        format: ExportFormat,
        formats: Option<&[String]>,
        trigger: Option<&str>,
    ) -> Result<ExportJob, AppError> {
        let snapshot = ExportSnapshotQueries::get_by_id(&ctx.pool, snapshot_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Export snapshot not found".to_string()))?;

        let proj_id = project_id.unwrap_or(&snapshot.project_id);

        let job = ExportJobQueries::create(
            &ctx.pool,
            snapshot_id,
            Some(proj_id),
            format,
            formats,
            trigger,
            ExportStatus::Pending,
        )
        .await?;

        Ok(job)
    }

    /// Get an export job
    pub async fn get_export_job(
        ctx: &BizContext,
        _user_id: &str,
        job_id: &str,
    ) -> Result<ExportJob, AppError> {
        let job = ExportJobQueries::get_by_id(&ctx.pool, job_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Export job not found".to_string()))?;

        let _snapshot = ExportSnapshotQueries::get_by_id(&ctx.pool, &job.snapshot_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Export snapshot not found".to_string()))?;

        Ok(job)
    }

    /// List export jobs for a project
    pub async fn list_export_jobs(
        ctx: &BizContext,
        _user_id: &str,
        project_id: &str,
        page: u64,
        page_size: u64,
    ) -> Result<PaginatedResponse<ExportJobResponse>, AppError> {
        let _project = ProjectQueries::get_by_id(&ctx.pool, project_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Project not found".to_string()))?;

        let limit = page_size.max(1) as i64;
        let offset = page.saturating_sub(1) as i64 * limit;
        let jobs =
            ExportJobQueries::get_by_project(&ctx.pool, project_id, Some(limit), Some(offset))
                .await?;

        let total = ExportJobQueries::count_by_project(&ctx.pool, project_id).await?;

        let mut enriched_jobs = Vec::with_capacity(jobs.len());
        for job in jobs {
            let mut job_resp = ExportJobResponse::from(job.clone());

            // 1. Fetch snapshot details
            if let Ok(Some(snap)) = ExportSnapshotQueries::get_by_id(&ctx.pool, &job.snapshot_id).await {
                job_resp.snapshot = Some(cms_entity::export::ExportSnapshotDetails {
                    id: snap.id,
                    deployment_version: snap.deployment_version,
                    pages_count: snap.pages_count,
                    created_at: snap.created_at,
                });
            }

            // 2. Fetch artifacts
            if let Ok(artifacts) = ExportArtifactQueries::get_by_job(&ctx.pool, &job.id).await {
                job_resp.artifacts = artifacts.into_iter().map(|a| a.into()).collect();
            }

            enriched_jobs.push(job_resp);
        }

        Ok(PaginatedResponse::new(enriched_jobs, total as u64, page, page_size))
    }

    /// Get export artifacts for a job
    pub async fn get_export_artifacts(
        ctx: &BizContext,
        _user_id: &str,
        job_id: &str,
    ) -> Result<Vec<ExportArtifact>, AppError> {
        let job = ExportJobQueries::get_by_id(&ctx.pool, job_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Export job not found".to_string()))?;

        let _snapshot = ExportSnapshotQueries::get_by_id(&ctx.pool, &job.snapshot_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Export snapshot not found".to_string()))?;

        ExportArtifactQueries::get_by_job(&ctx.pool, job_id).await
    }

    /// Create an export schedule
    #[allow(clippy::too_many_arguments)]
    pub async fn create_export_schedule(
        ctx: &BizContext,
        _user_id: &str,
        project_id: &str,
        format: ExportFormat,
        frequency: &str,
        day_of_week: Option<i32>,
        day_of_month: Option<i32>,
        time_of_day: &str,
    ) -> Result<ExportSchedule, AppError> {
        let _project = ProjectQueries::get_by_id(&ctx.pool, project_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Project not found".to_string()))?;

        let schedule = ExportScheduleQueries::create(
            &ctx.pool,
            project_id,
            format,
            frequency,
            day_of_week,
            day_of_month,
            time_of_day,
            true,
        )
        .await?;

        Ok(schedule)
    }

    /// Get an export schedule
    pub async fn get_export_schedule(
        ctx: &BizContext,
        _user_id: &str,
        schedule_id: &str,
    ) -> Result<ExportSchedule, AppError> {
        let schedule = ExportScheduleQueries::get_by_id(&ctx.pool, schedule_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Export schedule not found".to_string()))?;

        Ok(schedule)
    }

    /// Delete an export schedule
    pub async fn delete_export_schedule(
        ctx: &BizContext,
        _user_id: &str,
        schedule_id: &str,
    ) -> Result<bool, AppError> {
        let _schedule = ExportScheduleQueries::get_by_id(&ctx.pool, schedule_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Export schedule not found".to_string()))?;

        ExportScheduleQueries::delete(&ctx.pool, schedule_id).await
    }

    /// Get download url for export job
    pub async fn get_download_url(
        ctx: &BizContext,
        user_id: &str,
        job_id: &str,
    ) -> Result<String, AppError> {
        let artifacts = Self::get_export_artifacts(ctx, user_id, job_id).await?;
        let artifact = artifacts
            .into_iter()
            .next()
            .ok_or_else(|| AppError::NotFound("Export artifact not found".to_string()))?;
        Ok(artifact
            .download_url
            .unwrap_or_else(|| format!("/api/export/download/{}", artifact.id)))
    }

    /// List export schedules for a project
    pub async fn list_export_schedules(
        ctx: &BizContext,
        _user_id: &str,
        project_id: &str,
    ) -> Result<Vec<ExportSchedule>, AppError> {
        ExportScheduleQueries::get_by_project(&ctx.pool, project_id).await
    }

    /// Update export schedule
    pub async fn update_export_schedule(
        ctx: &BizContext,
        _user_id: &str,
        schedule_id: &str,
        request: cms_entity::export::UpdateExportScheduleRequest,
    ) -> Result<ExportSchedule, AppError> {
        let _schedule = ExportScheduleQueries::get_by_id(&ctx.pool, schedule_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Export schedule not found".to_string()))?;
        let updated = ExportScheduleQueries::update(
            &ctx.pool,
            schedule_id,
            request.is_active,
            request.time_of_day.as_deref(),
        )
        .await?;
        Ok(updated)
    }
}

/// Process export job (for worker)
pub async fn process_export_job(
    pool: &cms_db::PgPool,
    storage: Arc<dyn Storage>,
    payload: &serde_json::Value,
) -> Result<(), AppError> {
    let total_start = std::time::Instant::now();
    let job_id = payload
        .get("job_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::InvalidInput("Missing job_id".to_string()))?;

    let job = ExportJobQueries::get_by_id(pool, job_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Export job not found".to_string()))?;

    // Update job status to processing
    ExportJobQueries::update_status(pool, job_id, ExportStatus::Processing).await?;

    let snapshot = ExportSnapshotQueries::get_by_id(pool, &job.snapshot_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Export snapshot not found".to_string()))?;

    // Phase 1: High-performance bulk database page retrieval with full markdown content
    let fetch_start = std::time::Instant::now();
    let pages = if let Some(branch_id) = &snapshot.branch_id {
        PageQueries::get_export_pages(pool, &snapshot.project_id, branch_id).await?
    } else {
        // Get default branch
        let default_branch = cms_db::branch::BranchQueries::get_default(pool, &snapshot.project_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Default branch not found".to_string()))?;

        PageQueries::get_export_pages(pool, &snapshot.project_id, &default_branch.id).await?
    };
    let fetch_ms = fetch_start.elapsed().as_millis() as u64;

    // Phase 2: High-throughput format generation
    let render_start = std::time::Instant::now();
    let content_result = match job.format {
        ExportFormat::Html => generate_html_export(&pages, &snapshot.project_id).await,
        ExportFormat::Pdf => generate_pdf_export(&pages, &snapshot.project_id).await,
        ExportFormat::Markdown => Ok(generate_markdown_export(&pages).await),
        ExportFormat::Epub => generate_epub_export(&pages, &snapshot.project_id).await,
        ExportFormat::Sqlite => {
            generate_sqlite_export(pool, &snapshot.project_id, &pages, Some(storage.as_ref())).await
        }
    };
    let render_ms = render_start.elapsed().as_millis() as u64;

    let content = match content_result {
        Ok(c) => c,
        Err(e) => {
            tracing::error!("Export generation failed for job {}: {}", job_id, e);
            ExportJobQueries::update_status(pool, job_id, ExportStatus::Failed).await?;
            return Err(e);
        }
    };

    // Phase 3: Store the export artifact
    let storage_start = std::time::Instant::now();
    let extension = match &job.format {
        ExportFormat::Html => "html",
        ExportFormat::Pdf => "pdf",
        ExportFormat::Markdown => "md",
        ExportFormat::Epub => "epub",
        ExportFormat::Sqlite => "tar.gz",
    };

    let storage_key = format!(
        "exports/{}/{}/{}.{}",
        snapshot.project_id,
        job.id,
        Utc::now().timestamp(),
        extension
    );

    let content_type = match &job.format {
        ExportFormat::Html => "text/html; charset=utf-8",
        ExportFormat::Pdf => "application/pdf",
        ExportFormat::Markdown => "text/markdown; charset=utf-8",
        ExportFormat::Epub => "application/epub+zip",
        ExportFormat::Sqlite => "application/gzip",
    };

    let content_len = content.len() as i64;
    storage.put(&storage_key, content, content_type).await?;
    let storage_ms = storage_start.elapsed().as_millis() as u64;

    let format_str = format!("{:?}", job.format).to_uppercase();
    let download_url = format!("/api/app/export/jobs/{}/download", job_id);

    // Create artifact record
    let _artifact = ExportArtifactQueries::create(
        pool,
        job_id,
        Some(&format_str),
        &format!("export.{}", extension),
        content_len,
        &storage_key,
        Some(&download_url),
    )
    .await?;

    // Performance telemetry calculation
    let total_ms = total_start.elapsed().as_millis() as u64;
    let words_count: usize = {
        use rayon::prelude::*;
        pages
            .par_iter()
            .map(|p| p.content.as_deref().unwrap_or("").split_whitespace().count())
            .sum()
    };
    let pages_count = pages.len();
    let throughput_pages_per_sec = if total_ms > 0 {
        (pages_count as f64) / (total_ms as f64 / 1000.0)
    } else {
        pages_count as f64 * 1000.0
    };

    let metrics = cms_entity::export::ExportMetrics {
        fetch_ms,
        render_ms,
        storage_ms,
        total_ms,
        pages_count,
        words_count,
        throughput_pages_per_sec,
    };

    // Update job status to completed with metrics
    ExportJobQueries::update_completed(pool, job_id, &storage_key, Some(&metrics)).await?;

    tracing::info!(
        target: "cms::export::perf",
        job_id = %job_id,
        format = ?job.format,
        pages = pages_count,
        words = words_count,
        fetch_ms = fetch_ms,
        render_ms = render_ms,
        storage_ms = storage_ms,
        total_ms = total_ms,
        throughput_p_s = %format!("{:.1}", throughput_pages_per_sec),
        "Export job completed successfully -> {}",
        storage_key
    );

    Ok(())
}

/// Helper: Render markdown to sanitized HTML
fn render_markdown(markdown: &str) -> String {
    use pulldown_cmark::{html, Options, Parser};

    let mut options = Options::empty();
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_FOOTNOTES);
    options.insert(Options::ENABLE_TASKLISTS);

    let parser = Parser::new_ext(markdown, options);
    let mut html_body = String::new();
    html::push_html(&mut html_body, parser);

    ammonia::clean(&html_body)
}

/// Generate HTML export with parallel markdown rendering and buffer pre-allocation
async fn generate_html_export(
    pages: &[cms_entity::page::PageListItem],
    project_id: &str,
) -> Result<Bytes, AppError> {
    let clean_project_id = ammonia::clean(project_id);

    // 1. Parallelize CPU-bound Markdown parsing and ammonia sanitization across all CPU cores
    let pages_vec = pages.to_vec();
    let rendered_items = tokio::task::spawn_blocking(move || {
        use rayon::prelude::*;
        pages_vec
            .par_iter()
            .enumerate()
            .map(|(i, page)| {
                let anchor = format!("page-{}", i);
                let clean_title = ammonia::clean(&page.title);
                let raw_md = page.content.as_deref().unwrap_or("");
                let clean_html = render_markdown(raw_md);
                (anchor, clean_title, clean_html)
            })
            .collect::<Vec<_>>()
    })
    .await
    .map_err(|e| AppError::Internal(anyhow::anyhow!("HTML render task failed: {}", e)))?;

    // 2. Pre-allocate buffer to avoid reallocation overhead during assembly
    let body_bytes: usize = rendered_items
        .iter()
        .map(|(a, t, h)| a.len() * 2 + t.len() * 2 + h.len() + 180)
        .sum();
    let estimated_total = body_bytes + 4096;
    let mut doc = String::with_capacity(estimated_total);

    doc.push_str(r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Documentation Export - "#);
    doc.push_str(&clean_project_id);
    doc.push_str(r#"</title>
  <style>
    body { max-width: 900px; margin: 0 auto; padding: 2rem; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    nav { background: #f8f9fa; padding: 1rem 1.5rem; border-radius: 8px; margin-bottom: 2rem; border: 1px solid #e9ecef; }
    nav h2 { margin-top: 0; font-size: 1.25rem; }
    nav ul { margin: 0; padding-left: 1.5rem; }
    article { margin-bottom: 4rem; padding-bottom: 2rem; border-bottom: 1px solid #dee2e6; }
    pre { background: #f8f9fa; padding: 1rem; border-radius: 4px; overflow-x: auto; border: 1px solid #e9ecef; font-family: monospace; font-size: 0.9em; }
    code { background: #e9ecef; padding: 0.2em 0.4em; border-radius: 3px; font-family: monospace; font-size: 0.9em; }
    pre code { background: none; padding: 0; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #dee2e6; padding: 0.5rem 0.75rem; text-align: left; }
    th { background: #f8f9fa; }
  </style>
</head>
<body>
  <header>
    <h1>Project Documentation Export</h1>
  </header>
  <nav>
    <h2>Table of Contents</h2>
    <ul>
"#);

    for (anchor, clean_title, _) in &rendered_items {
        doc.push_str("      <li><a href=\"#");
        doc.push_str(anchor);
        doc.push_str("\">");
        doc.push_str(clean_title);
        doc.push_str("</a></li>\n");
    }

    doc.push_str("    </ul>\n  </nav>\n  <main>\n");

    for (anchor, clean_title, clean_html) in &rendered_items {
        doc.push_str("    <article id=\"");
        doc.push_str(anchor);
        doc.push_str("\">\n      <h2>");
        doc.push_str(clean_title);
        doc.push_str("</h2>\n      <div>\n");
        doc.push_str(clean_html);
        doc.push_str("\n      </div>\n    </article>\n");
    }

    doc.push_str("  </main>\n</body>\n</html>");

    Ok(Bytes::from(doc))
}

/// Generate Markdown export with buffer pre-allocation
async fn generate_markdown_export(pages: &[cms_entity::page::PageListItem]) -> Bytes {
    let estimated_size: usize = pages
        .iter()
        .map(|p| p.content.as_ref().map(|c| c.len()).unwrap_or(0) + p.title.len() + 32)
        .sum::<usize>()
        + 1024;
    let mut md = String::with_capacity(estimated_size);
    md.push_str("# Documentation Export\n\n");

    for page in pages {
        md.push_str("## ");
        md.push_str(&page.title);
        md.push_str("\n\n");
        if let Some(content) = &page.content {
            md.push_str(content);
            md.push_str("\n\n");
        }
        md.push_str("---\n\n");
    }

    Bytes::from(md)
}

/// Generate PDF export using printpdf with spawn_blocking and enterprise-scale pagination
async fn generate_pdf_export(
    pages: &[cms_entity::page::PageListItem],
    project_id: &str,
) -> Result<Bytes, AppError> {
    fn escape_html(s: &str) -> String {
        s.replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
            .replace('\'', "&#39;")
    }

    let pages_summary: Vec<(String, String, Option<String>)> = pages
        .iter()
        .map(|p| (p.title.clone(), p.path.clone(), p.content.clone()))
        .collect();
    let proj_id = project_id.to_string();

    tokio::task::spawn_blocking(move || {
        use std::collections::BTreeMap;
        use printpdf::*;

        let total_pages = pages_summary.len();
        let mut html = format!(
            "<h1>Project Documentation - {}</h1>",
            escape_html(&proj_id)
        );
        html.push_str(&format!(
            "<p>Generated on {} | Scope: {} total documents</p>",
            chrono::Utc::now().format("%Y-%m-%d %H:%M UTC"),
            total_pages
        ));

        // Table of Contents
        html.push_str("<h2>Table of Contents</h2><ul>");
        for (i, (title, path, _)) in pages_summary.iter().take(50).enumerate() {
            html.push_str(&format!(
                "<li>{}. {} <code>{}</code></li>",
                i + 1,
                escape_html(title),
                escape_html(path)
            ));
        }
        if total_pages > 50 {
            html.push_str(&format!(
                "<li><em>... and {} additional documents in master index</em></li>",
                total_pages - 50
            ));
        }
        html.push_str("</ul>");

        // For large enterprise datasets (> 100 pages), render up to 100 featured documentation chapters
        // and an Executive Catalog Index table to keep vector PDF generation blazing fast.
        let featured_limit = if total_pages > 100 { 100 } else { total_pages };
        for (title, _, content) in pages_summary.iter().take(featured_limit) {
            html.push_str(&format!(
                "<div style=\"page-break-before: always;\"><h1>{}</h1>",
                escape_html(title)
            ));
            if let Some(content) = content {
                html.push_str("<p>");
                html.push_str(&escape_html(content).replace('\n', "<br/>"));
                html.push_str("</p>");
            }
            html.push_str("</div>");
        }

        if total_pages > featured_limit {
            html.push_str("<div style=\"page-break-before: always;\"><h1>Documentation Catalog Index</h1>");
            html.push_str(&format!(
                "<p>Executive Index of all {} documents in this release snapshot:</p><ul>",
                total_pages
            ));
            for (i, (title, path, _)) in pages_summary.iter().enumerate().skip(featured_limit).take(200) {
                html.push_str(&format!(
                    "<li><strong>{}</strong> - {} (<code>{}</code>)</li>",
                    i + 1,
                    escape_html(title),
                    escape_html(path)
                ));
            }
            if total_pages > featured_limit + 200 {
                html.push_str(&format!(
                    "<li><em>[Catalog Index truncated: {} additional indexed records in SQLite/HTML/Markdown exports]</em></li>",
                    total_pages - (featured_limit + 200)
                ));
            }
            html.push_str("</ul></div>");
        }

        let mut warnings = Vec::new();
        let doc = PdfDocument::from_html(
            &html,
            &BTreeMap::new(),
            &BTreeMap::new(),
            &GeneratePdfOptions::default(),
            &mut warnings,
        )
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to render PDF: {e}")))?;

        let pdf_bytes = doc.save(&PdfSaveOptions::default(), &mut warnings);
        Ok(Bytes::from(pdf_bytes))
    })
    .await
    .map_err(|e| AppError::Internal(anyhow::anyhow!("PDF generation task panicked: {e}")))?
}

/// Generate EPUB export using epub-builder
async fn generate_epub_export(
    pages: &[cms_entity::page::PageListItem],
    project_id: &str,
) -> Result<Bytes, AppError> {
    use epub_builder::{EpubBuilder, EpubContent, ZipLibrary};

    let zip_lib = ZipLibrary::new()
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to create ZipLibrary: {:?}", e)))?;

    let mut builder = EpubBuilder::new(zip_lib).map_err(|e| {
        AppError::Internal(anyhow::anyhow!("Failed to create EpubBuilder: {:?}", e))
    })?;

    builder
        .metadata("author", "CMS Documentation Platform")
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to set author: {:?}", e)))?;

    builder
        .metadata("title", format!("Documentation - {}", project_id))
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to set title: {:?}", e)))?;

    for (i, page) in pages.iter().enumerate() {
        let raw_md = page.content.as_deref().unwrap_or("");
        let clean_html = render_markdown(raw_md);

        let xhtml = format!(
            r#"<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>{}</title>
</head>
<body>
  <h1>{}</h1>
  <div>
{}
  </div>
</body>
</html>"#,
            ammonia::clean(&page.title),
            ammonia::clean(&page.title),
            clean_html
        );

        let filename = format!("chapter_{}_{}.xhtml", i + 1, page.slug);
        let content = EpubContent::new(&filename, xhtml.as_bytes()).title(&page.title);

        builder.add_content(content).map_err(|e| {
            AppError::Internal(anyhow::anyhow!("Failed to add EPUB chapter: {:?}", e))
        })?;
    }

    let mut output = Vec::new();
    builder
        .generate(&mut output)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to generate EPUB: {:?}", e)))?;

    Ok(Bytes::from(output))
}

/// Binary asset item for self-contained SQLite export
#[derive(Debug, Clone)]
pub struct ExportAssetItem {
    pub path: String,
    pub storage_key: String,
    pub mime_type: String,
    pub data: Vec<u8>,
    pub width: Option<i32>,
    pub height: Option<i32>,
}

/// Generate isolated self-contained SQLite snapshot export
pub async fn generate_sqlite_export(
    pool: &cms_db::PgPool,
    project_id: &str,
    pages: &[cms_entity::page::PageListItem],
    storage: Option<&dyn Storage>,
) -> Result<Bytes, AppError> {
    // 1. Fetch metadata from PostgreSQL
    let project = cms_db::project::ProjectQueries::get_by_id(pool, project_id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Project not found: {}", project_id)))?;

    let branches =
        cms_db::branch::BranchQueries::get_by_project(pool, project_id, None, Some(100), Some(0))
            .await
            .unwrap_or_default();

    let languages =
        cms_db::language::LanguageQueries::get_by_project(pool, project_id, Some(100), Some(0))
            .await
            .unwrap_or_default();

    let raw_assets =
        cms_db::asset::AssetQueries::get_by_project(pool, project_id, Some(10_000), Some(0))
            .await
            .unwrap_or_default();

    // Fetch binary data for assets if storage is available
    let mut assets = Vec::with_capacity(raw_assets.len());
    for a in raw_assets {
        let data = if let Some(s) = storage {
            match s.get(&a.storage_key).await {
                Ok(bytes) => bytes.to_vec(),
                Err(e) => {
                    tracing::warn!("Failed to fetch asset blob {}: {}", a.storage_key, e);
                    Vec::new()
                }
            }
        } else {
            Vec::new()
        };

        assets.push(ExportAssetItem {
            path: a.file_name.clone(),
            storage_key: a.storage_key.clone(),
            mime_type: a.content_type.clone(),
            data,
            width: a.width,
            height: a.height,
        });
    }

    generate_sqlite_bundle_export(project, branches, pages.to_vec(), languages, assets).await
}

use std::path::Path;
use cms_search::tokenizer::{JapaneseTokenizer, LinderaTantivyTokenizer, JAPANESE_TOKENIZER_NAME};
use tantivy::schema::*;

/// Tantivy schema fields for isolated exported site
#[derive(Clone, Copy)]
pub struct TantivyExportFields {
    pub id: Field,
    pub custom_id: Field,
    pub page_id: Field,
    pub version_id: Field,
    pub language: Field,
    pub title: Field,
    pub path: Field,
    pub description: Field,
    pub body: Field,
    pub chunk_index: Field,
    pub sort_order: Field,
}

impl TantivyExportFields {
    pub fn build_schema() -> (Schema, Self) {
        let mut builder = Schema::builder();
        let id = builder.add_text_field("id", STRING | STORED);
        let custom_id = builder.add_text_field("custom_id", STRING | STORED | FAST);
        let page_id = builder.add_text_field("page_id", STRING | STORED | FAST);
        let version_id = builder.add_text_field("version_id", STRING | STORED | FAST);
        let language = builder.add_text_field("language", STRING | STORED | FAST);

        let japanese_text_options = TextOptions::default()
            .set_indexing_options(
                TextFieldIndexing::default()
                    .set_tokenizer(JAPANESE_TOKENIZER_NAME)
                    .set_index_option(IndexRecordOption::WithFreqsAndPositions),
            )
            .set_stored();

        let title = builder.add_text_field("title", japanese_text_options.clone());
        let path = builder.add_text_field("path", STRING | STORED);
        let description = builder.add_text_field("description", japanese_text_options.clone());
        let body = builder.add_text_field("body", japanese_text_options);

        let chunk_index = builder.add_i64_field(
            "chunk_index",
            NumericOptions::default().set_stored().set_fast(),
        );
        let sort_order = builder.add_i64_field(
            "sort_order",
            NumericOptions::default().set_stored().set_fast(),
        );

        let schema = builder.build();
        let fields = Self {
            id,
            custom_id,
            page_id,
            version_id,
            language,
            title,
            path,
            description,
            body,
            chunk_index,
            sort_order,
        };
        (schema, fields)
    }
}

/// Build isolated Tantivy search index directly in the specified destination directory
pub fn build_tantivy_export_index(
    pages: &[cms_entity::page::PageListItem],
    branches: &[cms_entity::branch::Branch],
    dest_dir: &Path,
) -> Result<(), AppError> {
    let (schema, fields) = TantivyExportFields::build_schema();
    std::fs::create_dir_all(dest_dir).map_err(|e| {
        AppError::Internal(anyhow::anyhow!("Failed to create tantivy export dir: {}", e))
    })?;

    let index = tantivy::Index::create_in_dir(dest_dir, schema).map_err(|e| {
        AppError::Internal(anyhow::anyhow!("Failed to create tantivy index: {}", e))
    })?;

    let tokenizer = JapaneseTokenizer::new();
    index.tokenizers().register(
        JAPANESE_TOKENIZER_NAME,
        LinderaTantivyTokenizer::with_tokenizer(tokenizer),
    );

    // Map branch id to slug for version matching
    let branch_map: std::collections::HashMap<String, String> = branches
        .iter()
        .map(|b| (b.id.clone(), b.slug.clone()))
        .collect();

    let mut writer = index
        .writer_with_num_threads(1, 50 * 1024 * 1024)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to open tantivy writer: {}", e)))?;

    for page in pages {
        let version_slug = branch_map
            .get(&page.branch_id)
            .cloned()
            .unwrap_or_else(|| page.branch_id.clone());

        let raw_md = page.content.as_deref().unwrap_or("");
        let plain_text = cms_search::markdown::markdown_to_plain_text(raw_md);

        let mut doc = tantivy::TantivyDocument::default();
        let doc_id = format!("{}_0", page.id);
        doc.add_text(fields.id, &doc_id);
        doc.add_text(fields.custom_id, page.custom_id.as_deref().unwrap_or(""));
        doc.add_text(fields.page_id, &page.id);
        doc.add_text(fields.version_id, &version_slug);
        doc.add_text(fields.language, "en");
        doc.add_text(fields.title, &page.title);
        doc.add_text(fields.path, &page.path);
        doc.add_text(fields.description, page.description.as_deref().unwrap_or(""));
        doc.add_text(fields.body, &plain_text);
        doc.add_i64(fields.chunk_index, 0);
        doc.add_i64(fields.sort_order, page.position as i64);

        writer.add_document(doc).map_err(|e| {
            AppError::Internal(anyhow::anyhow!("Failed to add document to tantivy export: {}", e))
        })?;
    }

    writer.commit().map_err(|e| {
        AppError::Internal(anyhow::anyhow!("Failed to commit tantivy export: {}", e))
    })?;

    Ok(())
}

/// Helper function to build the isolated SQLite artifact from entity records
pub async fn build_sqlite_export_database(
    project: cms_entity::project::Project,
    branches: Vec<cms_entity::branch::Branch>,
    pages: Vec<cms_entity::page::PageListItem>,
    languages: Vec<cms_entity::language::Language>,
    assets: Vec<ExportAssetItem>,
) -> Result<Bytes, AppError> {
    let temp_file = tempfile::NamedTempFile::new().map_err(|e| {
        AppError::Internal(anyhow::anyhow!("Failed to create temp sqlite file: {}", e))
    })?;
    let path = temp_file.path().to_path_buf();

    let opts = sqlx::sqlite::SqliteConnectOptions::new()
        .filename(&path)
        .create_if_missing(true);

    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(opts)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to open sqlite db: {}", e)))?;

    // Initialize reader-optimized schema with high-performance memory pragmas
    sqlx::raw_sql(
        r#"
        PRAGMA journal_mode = MEMORY;
        PRAGMA synchronous = OFF;
        PRAGMA cache_size = -128000;
        PRAGMA temp_store = MEMORY;
        PRAGMA foreign_keys = OFF;
        PRAGMA locking_mode = EXCLUSIVE;
        PRAGMA mmap_size = 268435456;

        -- Format identification and compatibility check
        CREATE TABLE export_meta (
            schema_version INTEGER NOT NULL,
            project_id     TEXT    NOT NULL,
            project_name   TEXT    NOT NULL,
            project_slug   TEXT    NOT NULL,
            exported_at    TEXT    NOT NULL
        );

        -- Named versions only (branches excluding trunk 'main')
        CREATE TABLE versions (
            id         TEXT    PRIMARY KEY,
            slug       TEXT    NOT NULL UNIQUE,
            label      TEXT    NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_default INTEGER NOT NULL DEFAULT 0
        );

        -- Page navigation tree (version-scoped)
        CREATE TABLE pages (
            id          TEXT    PRIMARY KEY,
            custom_id   TEXT,
            version_id  TEXT    NOT NULL,
            parent_id   TEXT,
            kind        TEXT    NOT NULL DEFAULT 'PAGE',
            slug        TEXT    NOT NULL,
            path        TEXT    NOT NULL,
            title       TEXT    NOT NULL,
            icon        TEXT,
            sort_order  INTEGER NOT NULL DEFAULT 0,
            is_draft    INTEGER NOT NULL DEFAULT 0,
            openapi_url TEXT,
            link_url    TEXT,
            FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE,
            FOREIGN KEY (parent_id) REFERENCES pages(id) ON DELETE CASCADE
        );

        -- Page content per language (Markdown source stored, rendered on demand)
        CREATE TABLE page_content (
            page_id     TEXT NOT NULL,
            language    TEXT NOT NULL,
            markdown    TEXT NOT NULL,
            description TEXT,
            updated_at  TEXT NOT NULL,
            PRIMARY KEY (page_id, language),
            FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
        );

        -- Supported languages for this project
        CREATE TABLE languages (
            code       TEXT PRIMARY KEY,
            label      TEXT NOT NULL,
            is_default INTEGER NOT NULL DEFAULT 0,
            is_rtl     INTEGER NOT NULL DEFAULT 0
        );

        -- UI string overrides / translations
        CREATE TABLE i18n_messages (
            language TEXT NOT NULL,
            key      TEXT NOT NULL,
            value    TEXT NOT NULL,
            PRIMARY KEY (language, key),
            FOREIGN KEY (language) REFERENCES languages(code) ON DELETE CASCADE
        );

        -- Embedded binary assets
        CREATE TABLE assets (
            path      TEXT PRIMARY KEY,
            mime_type TEXT NOT NULL,
            data      BLOB NOT NULL,
            width     INTEGER,
            height    INTEGER
        );

        -- Changelog entries
        CREATE TABLE changelog (
            id           TEXT NOT NULL,
            version_id   TEXT NOT NULL,
            language     TEXT NOT NULL,
            slug         TEXT NOT NULL,
            title        TEXT NOT NULL,
            published_at TEXT NOT NULL,
            content      TEXT NOT NULL,
            PRIMARY KEY (id, language),
            FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE,
            FOREIGN KEY (language) REFERENCES languages(code) ON DELETE CASCADE
        );

        -- Project-level configuration for the reader
        CREATE TABLE project_config (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        -- Indexes for fast lookup
        CREATE INDEX idx_pages_version ON pages(version_id);
        CREATE INDEX idx_pages_path ON pages(path);
        CREATE INDEX idx_pages_custom_id ON pages(custom_id);
        CREATE INDEX idx_content_lang ON page_content(language);
        CREATE INDEX idx_changelog_ver ON changelog(version_id, published_at DESC);

        -- Full-text search (FTS5)
        CREATE VIRTUAL TABLE page_fts USING fts5(
            page_id UNINDEXED,
            version_id UNINDEXED,
            language UNINDEXED,
            title,
            content
        );
        "#,
    )
    .execute(&pool)
    .await
    .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to create sqlite schema: {}", e)))?;

    // Begin high-throughput atomic transaction for all entity inserts
    sqlx::raw_sql("BEGIN TRANSACTION;").execute(&pool).await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to begin sqlite transaction: {}", e)))?;

    // 1. Insert export_meta (schema_version = 1)
    sqlx::query(
        r#"
        INSERT INTO export_meta (schema_version, project_id, project_name, project_slug, exported_at)
        VALUES (?, ?, ?, ?, ?)
        "#,
    )
    .bind(1i64)
    .bind(&project.id)
    .bind(&project.name)
    .bind(&project.slug)
    .bind(Utc::now().to_rfc3339())
    .execute(&pool)
    .await
    .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to insert export_meta: {}", e)))?;

    // 2. Insert languages
    let mut default_lang_code = "en".to_string();
    let mut lang_id_to_code: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();

    if languages.is_empty() {
        sqlx::query(
            r#"
            INSERT INTO languages (code, label, is_default, is_rtl)
            VALUES (?, ?, ?, ?)
            "#,
        )
        .bind("en")
        .bind("English")
        .bind(1i32)
        .bind(0i32)
        .execute(&pool)
        .await
        .map_err(|e| {
            AppError::Internal(anyhow::anyhow!("Failed to insert default language: {}", e))
        })?;
    } else {
        for (idx, lang) in languages.iter().enumerate() {
            lang_id_to_code.insert(lang.id.clone(), lang.code.clone());
            let is_def = if lang.is_default || idx == 0 {
                default_lang_code = lang.code.clone();
                1i32
            } else {
                0i32
            };
            sqlx::query(
                r#"
                INSERT OR REPLACE INTO languages (code, label, is_default, is_rtl)
                VALUES (?, ?, ?, ?)
                "#,
            )
            .bind(&lang.code)
            .bind(&lang.name)
            .bind(is_def)
            .bind(if lang.is_rtl { 1i32 } else { 0i32 })
            .execute(&pool)
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to insert language: {}", e)))?;
        }
    }

    // 3. Filter branches: exclude trunk 'main'
    let mut version_branches: Vec<cms_entity::branch::Branch> = branches
        .into_iter()
        .filter(|b| {
            let slug = b.slug.trim().to_lowercase();
            let name = b.name.trim().to_lowercase();
            slug != "main" && name != "main"
        })
        .collect();

    // Handle single-branch repository or test setup where only 'main' was present
    let remapped_main = if version_branches.is_empty() {
        let default_branch = cms_entity::branch::Branch {
            id: "default-version".to_string(),
            project_id: project.id.clone(),
            name: "v1.0".to_string(),
            slug: "v1.0".to_string(),
            description: Some("Default release version".to_string()),
            is_default: true,
            is_protected: false,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };
        version_branches.push(default_branch);
        true
    } else {
        false
    };

    let mut valid_version_ids = std::collections::HashSet::new();
    let has_explicit_default = version_branches.iter().any(|b| b.is_default);

    for (idx, b) in version_branches.iter().enumerate() {
        valid_version_ids.insert(b.id.clone());
        let is_def = if b.is_default || (!has_explicit_default && idx == 0) {
            1i32
        } else {
            0i32
        };
        sqlx::query(
            r#"
            INSERT INTO versions (id, slug, label, sort_order, is_default)
            VALUES (?, ?, ?, ?, ?)
            "#,
        )
        .bind(&b.id)
        .bind(&b.slug)
        .bind(&b.name)
        .bind(idx as i32)
        .bind(is_def)
        .execute(&pool)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to insert version: {}", e)))?;
    }

    // 4. Batch insert pages and page_content for high-throughput performance
    struct PageBatchItem {
        id: String,
        custom_id: Option<String>,
        version_id: String,
        parent_id: Option<String>,
        kind: String,
        slug: String,
        path: String,
        title: String,
        icon: Option<String>,
        sort_order: i32,
        is_draft: i32,
        openapi_url: Option<String>,
        link_url: Option<String>,
    }

    struct ContentBatchItem {
        page_id: String,
        language: String,
        markdown: String,
        description: Option<String>,
        updated_at: String,
    }

    let mut page_items = Vec::with_capacity(pages.len());
    let mut content_items = Vec::with_capacity(pages.len());

    for p in &pages {
        let target_version_id = if remapped_main
            && (p.branch_id == "main" || !valid_version_ids.contains(&p.branch_id))
        {
            "default-version".to_string()
        } else {
            p.branch_id.clone()
        };

        // Only export pages belonging to valid version branches
        if !valid_version_ids.contains(&target_version_id) {
            continue;
        }

        // Extract openapi_url and link_url from config if present
        let (openapi_url, link_url) = if let Some(cfg) = &p.config {
            (
                cfg.get("openapi_url")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                cfg.get("link_url")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
            )
        } else {
            (None, None)
        };

        // Resolve language code
        let lang_code = p
            .language_id
            .as_ref()
            .and_then(|id| lang_id_to_code.get(id))
            .cloned()
            .unwrap_or_else(|| default_lang_code.clone());

        page_items.push(PageBatchItem {
            id: p.id.clone(),
            custom_id: p.custom_id.clone(),
            version_id: target_version_id,
            parent_id: p.parent_id.clone(),
            kind: p.kind.as_deref().unwrap_or("PAGE").to_string(),
            slug: p.slug.clone(),
            path: p.path.clone(),
            title: p.title.clone(),
            icon: p.icon.clone(),
            sort_order: p.position,
            is_draft: if p.is_published { 0i32 } else { 1i32 },
            openapi_url,
            link_url,
        });

        content_items.push(ContentBatchItem {
            page_id: p.id.clone(),
            language: lang_code,
            markdown: p.content.as_deref().unwrap_or("").to_string(),
            description: p.description.clone(),
            updated_at: p.updated_at.to_rfc3339(),
        });
    }

    // Insert pages in chunks of 65 (13 * 65 = 845 parameters <= 999 limit)
    for chunk in page_items.chunks(65) {
        let mut qb = sqlx::QueryBuilder::<sqlx::Sqlite>::new(
            "INSERT INTO pages (id, custom_id, version_id, parent_id, kind, slug, path, title, icon, sort_order, is_draft, openapi_url, link_url) ",
        );
        qb.push_values(chunk, |mut b, p| {
            b.push_bind(&p.id)
                .push_bind(&p.custom_id)
                .push_bind(&p.version_id)
                .push_bind(&p.parent_id)
                .push_bind(&p.kind)
                .push_bind(&p.slug)
                .push_bind(&p.path)
                .push_bind(&p.title)
                .push_bind(&p.icon)
                .push_bind(p.sort_order)
                .push_bind(p.is_draft)
                .push_bind(&p.openapi_url)
                .push_bind(&p.link_url);
        });
        qb.build()
            .execute(&pool)
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to batch insert pages: {}", e)))?;
    }

    // Insert page_content in chunks of 180 (5 * 180 = 900 parameters <= 999 limit)
    for chunk in content_items.chunks(180) {
        let mut qb = sqlx::QueryBuilder::<sqlx::Sqlite>::new(
            "INSERT OR REPLACE INTO page_content (page_id, language, markdown, description, updated_at) ",
        );
        qb.push_values(chunk, |mut b, c| {
            b.push_bind(&c.page_id)
                .push_bind(&c.language)
                .push_bind(&c.markdown)
                .push_bind(&c.description)
                .push_bind(&c.updated_at);
        });
        qb.build()
            .execute(&pool)
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to batch insert page_content: {}", e)))?;
    }

    // 5. Insert project_config
    sqlx::query(
        r#"
        INSERT OR REPLACE INTO project_config (key, value)
        VALUES (?, ?), (?, ?), (?, ?)
        "#,
    )
    .bind("name")
    .bind(serde_json::to_string(&project.name).unwrap_or_default())
    .bind("slug")
    .bind(serde_json::to_string(&project.slug).unwrap_or_default())
    .bind("description")
    .bind(serde_json::to_string(&project.description).unwrap_or_default())
    .execute(&pool)
    .await
    .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to insert project_config: {}", e)))?;

    if let Some(config_val) = &project.config {
        if let Some(obj) = config_val.as_object() {
            for (k, v) in obj {
                sqlx::query(
                    r#"
                    INSERT OR REPLACE INTO project_config (key, value)
                    VALUES (?, ?)
                    "#,
                )
                .bind(k)
                .bind(v.to_string())
                .execute(&pool)
                .await
                .map_err(|e| {
                    AppError::Internal(anyhow::anyhow!("Failed to insert custom config: {}", e))
                })?;
            }
        }
    }

    // 6. Insert assets
    for a in &assets {
        sqlx::query(
            r#"
            INSERT OR REPLACE INTO assets (path, mime_type, data, width, height)
            VALUES (?, ?, ?, ?, ?)
            "#,
        )
        .bind(&a.path)
        .bind(&a.mime_type)
        .bind(&a.data)
        .bind(a.width)
        .bind(a.height)
        .execute(&pool)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to insert asset: {}", e)))?;

        if !a.storage_key.is_empty() && a.storage_key != a.path {
            sqlx::query(
                r#"
                INSERT OR IGNORE INTO assets (path, mime_type, data, width, height)
                VALUES (?, ?, ?, ?, ?)
                "#,
            )
            .bind(&a.storage_key)
            .bind(&a.mime_type)
            .bind(&a.data)
            .bind(a.width)
            .bind(a.height)
            .execute(&pool)
            .await
            .map_err(|e| {
                AppError::Internal(anyhow::anyhow!("Failed to insert asset alias: {}", e))
            })?;
        }
    }

    // 7. Bulk populate FTS5 index in a single vector pass
    sqlx::raw_sql(
        r#"
        INSERT INTO page_fts (page_id, version_id, language, title, content)
        SELECT p.id, p.version_id, pc.language, p.title, pc.markdown
        FROM pages p
        JOIN page_content pc ON p.id = pc.page_id;
        "#,
    )
    .execute(&pool)
    .await
    .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to bulk index FTS in sqlite: {}", e)))?;

    // Commit atomic transaction
    sqlx::raw_sql("COMMIT;").execute(&pool).await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to commit sqlite transaction: {}", e)))?;

    // Optimize and close SQLite database
    let _ = sqlx::raw_sql("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA optimize;").execute(&pool).await;

    pool.close().await;

    let data = tokio::fs::read(&path).await.map_err(|e| {
        AppError::Internal(anyhow::anyhow!(
            "Failed to read generated sqlite file: {}",
            e
        ))
    })?;

    Ok(Bytes::from(data))
}

use flate2::write::GzEncoder;
use flate2::Compression;

/// Helper function to build an isolated site bundle (.tar.gz) containing docs.sqlite and search_index/
pub async fn generate_sqlite_bundle_export(
    project: cms_entity::project::Project,
    branches: Vec<cms_entity::branch::Branch>,
    pages: Vec<cms_entity::page::PageListItem>,
    languages: Vec<cms_entity::language::Language>,
    assets: Vec<ExportAssetItem>,
) -> Result<Bytes, AppError> {
    // 1. Build SQLite database bytes
    let sqlite_bytes = build_sqlite_export_database(
        project,
        branches.clone(),
        pages.clone(),
        languages,
        assets,
    )
    .await?;

    // 2. Build isolated Tantivy index in a temp directory
    let tantivy_temp = tempfile::tempdir().map_err(|e| {
        AppError::Internal(anyhow::anyhow!("Failed to create tantivy tempdir: {}", e))
    })?;
    build_tantivy_export_index(&pages, &branches, tantivy_temp.path())?;

    // 3. Assemble streaming .tar.gz bundle
    let mut gz = GzEncoder::new(Vec::new(), Compression::fast());
    {
        let mut tar = tar::Builder::new(&mut gz);

        // Add docs.sqlite
        let mut header = tar::Header::new_gnu();
        header.set_path("docs.sqlite").map_err(|e| {
            AppError::Internal(anyhow::anyhow!("Failed to set header path: {}", e))
        })?;
        header.set_size(sqlite_bytes.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        tar.append(&header, &sqlite_bytes[..]).map_err(|e| {
            AppError::Internal(anyhow::anyhow!("Failed to append docs.sqlite to tar: {}", e))
        })?;

        // Add search_index directory recursively
        tar.append_dir_all("search_index", tantivy_temp.path()).map_err(|e| {
            AppError::Internal(anyhow::anyhow!("Failed to append search_index to tar: {}", e))
        })?;

        tar.finish().map_err(|e| {
            AppError::Internal(anyhow::anyhow!("Failed to finalize tar builder: {}", e))
        })?;
    }

    let compressed = gz.finish().map_err(|e| {
        AppError::Internal(anyhow::anyhow!("Failed to finish gzip compression: {}", e))
    })?;

    Ok(Bytes::from(compressed))
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use cms_entity::page::PageListItem;

    use super::*;

    fn mock_pages() -> Vec<PageListItem> {
        vec![
            PageListItem {
                id: "p1".to_string(),
                project_id: "proj-1".to_string(),
                branch_id: "branch-v1".to_string(),
                parent_id: None,
                language_id: Some("lang-en".to_string()),
                kind: Some("PAGE".to_string()),
                path: "/getting-started".to_string(),
                slug: "getting-started".to_string(),
                title: "Getting Started".to_string(),
                description: Some("Introductory guide".to_string()),
                content: Some(
                    "# Getting Started\n\nWelcome to **CMS**!\n\n- Feature 1\n- Feature 2"
                        .to_string(),
                ),
                icon: None,
                config: None,
                translation_key: None,
                custom_id: None,
                position: 0,
                is_published: true,
                created_at: Utc::now(),
                updated_at: Utc::now(),
            },
            PageListItem {
                id: "p2".to_string(),
                project_id: "proj-1".to_string(),
                branch_id: "branch-v1".to_string(),
                parent_id: None,
                language_id: Some("lang-en".to_string()),
                kind: Some("PAGE".to_string()),
                path: "/api-reference".to_string(),
                slug: "api-reference".to_string(),
                title: "API Reference".to_string(),
                description: Some("API docs".to_string()),
                content: Some("## Endpoints\n\nUse `GET /api/v1/pages` to list pages.".to_string()),
                icon: None,
                config: None,
                translation_key: None,
                custom_id: None,
                position: 1,
                is_published: true,
                created_at: Utc::now(),
                updated_at: Utc::now(),
            },
        ]
    }

    #[tokio::test]
    async fn test_generate_html_export() {
        let pages = mock_pages();
        let bytes = generate_html_export(&pages, "proj-1").await.unwrap();
        let html_str = String::from_utf8(bytes.to_vec()).unwrap();

        assert!(html_str.contains("Table of Contents"));
        assert!(html_str.contains("Getting Started"));
        assert!(html_str.contains("API Reference"));
        assert!(html_str.contains("Welcome to <strong>CMS</strong>!"));
    }

    #[tokio::test]
    async fn test_generate_markdown_export() {
        let pages = mock_pages();
        let bytes = generate_markdown_export(&pages).await;
        let md_str = String::from_utf8(bytes.to_vec()).unwrap();

        assert!(md_str.contains("# Documentation Export"));
        assert!(md_str.contains("## Getting Started"));
        assert!(md_str.contains("## API Reference"));
    }

    #[tokio::test]
    async fn test_generate_pdf_export() {
        let pages = mock_pages();
        let bytes = generate_pdf_export(&pages, "proj-1").await.unwrap();

        assert!(bytes.len() > 100);
        // Valid PDF magic header
        assert_eq!(&bytes[..4], b"%PDF");
    }

    #[tokio::test]
    async fn test_generate_epub_export() {
        let pages = mock_pages();
        let bytes = generate_epub_export(&pages, "proj-1").await.unwrap();

        assert!(bytes.len() > 100);
        // Valid ZIP/EPUB magic header
        assert_eq!(&bytes[..2], b"PK");
    }

    #[tokio::test]
    async fn test_generate_sqlite_export() {
        let pages = mock_pages();
        let project = cms_entity::project::Project {
            id: "proj-1".to_string(),
            name: "Test Project".to_string(),
            slug: "test-project".to_string(),
            description: Some("Description".to_string()),
            icon: None,
            is_public: true,
            config: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        let branch_main = cms_entity::branch::Branch {
            id: "branch-main".to_string(),
            project_id: "proj-1".to_string(),
            name: "main".to_string(),
            slug: "main".to_string(),
            description: None,
            is_default: true,
            is_protected: true,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        let branch_v1 = cms_entity::branch::Branch {
            id: "branch-v1".to_string(),
            project_id: "proj-1".to_string(),
            name: "v1.0".to_string(),
            slug: "v1.0".to_string(),
            description: None,
            is_default: false,
            is_protected: false,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        let language = cms_entity::language::Language {
            id: "lang-en".to_string(),
            project_id: "proj-1".to_string(),
            code: "en".to_string(),
            name: "English".to_string(),
            is_default: true,
            is_rtl: false,
            enabled: true,
            position: 0,
            config: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        let asset = ExportAssetItem {
            path: "logo.png".to_string(),
            storage_key: "assets/proj-1/logo.png".to_string(),
            mime_type: "image/png".to_string(),
            data: vec![1, 2, 3, 4],
            width: Some(100),
            height: Some(100),
        };

        // When branches contain 'main' and 'v1.0', 'main' must be excluded
        let bytes = build_sqlite_export_database(
            project,
            vec![branch_main, branch_v1],
            pages,
            vec![language],
            vec![asset],
        )
        .await
        .expect("SQLite export generation failed");

        assert!(bytes.len() > 512);
        assert_eq!(&bytes[..15], b"SQLite format 3");

        let temp = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(temp.path(), &bytes).unwrap();
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(sqlx::sqlite::SqliteConnectOptions::new().filename(temp.path()))
            .await
            .unwrap();

        // Check schema version in export_meta
        use sqlx::Row;
        let row = sqlx::query("SELECT schema_version, project_name FROM export_meta")
            .fetch_one(&pool)
            .await
            .unwrap();
        let schema_ver: i64 = row.get(0);
        let proj_name: String = row.get(1);
        assert_eq!(schema_ver, 1);
        assert_eq!(proj_name, "Test Project");

        // Verify 'main' branch was excluded, only 'v1.0' exists
        let version_rows = sqlx::query("SELECT slug FROM versions")
            .fetch_all(&pool)
            .await
            .unwrap();
        let version_slugs: Vec<String> = version_rows.into_iter().map(|r| r.get(0)).collect();
        assert_eq!(version_slugs, vec!["v1.0".to_string()]);

        // Verify FTS5 search works
        let fts_rows = sqlx::query("SELECT title FROM page_fts WHERE page_fts MATCH 'Getting'")
            .fetch_all(&pool)
            .await
            .unwrap();
        let search_hits: Vec<String> = fts_rows.into_iter().map(|r| r.get(0)).collect();
        assert_eq!(search_hits, vec!["Getting Started".to_string()]);

        // Verify embedded asset blob
        let asset_row = sqlx::query("SELECT data FROM assets WHERE path = 'logo.png'")
            .fetch_one(&pool)
            .await
            .unwrap();
        let asset_data: Vec<u8> = asset_row.get(0);
        assert_eq!(asset_data, vec![1, 2, 3, 4]);

        pool.close().await;
    }

    #[tokio::test]
    async fn test_build_tantivy_export_index() {
        let temp_dir = tempfile::tempdir().expect("tempdir");
        let pages = mock_pages();
        let branches = vec![cms_entity::branch::Branch {
            id: "branch-v1".to_string(),
            project_id: "proj-1".to_string(),
            name: "v1.0".to_string(),
            slug: "v1.0".to_string(),
            description: None,
            is_default: true,
            is_protected: false,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }];

        build_tantivy_export_index(&pages, &branches, temp_dir.path())
            .expect("build tantivy index");

        assert!(temp_dir.path().join("meta.json").exists(), "meta.json must exist");

        // Verify index can be opened with Tantivy
        let index = tantivy::Index::open_in_dir(temp_dir.path()).expect("open tantivy index");
        let reader = index.reader().expect("reader");
        let searcher = reader.searcher();
        assert_eq!(searcher.num_docs(), 2, "must index both pages");
    }

    #[tokio::test]
    async fn test_generate_sqlite_bundle_export() {
        let project = cms_entity::project::Project {
            id: "proj-1".to_string(),
            name: "Test Project".to_string(),
            slug: "test-project".to_string(),
            description: Some("Test".to_string()),
            icon: None,
            is_public: true,
            config: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };
        let branches = vec![cms_entity::branch::Branch {
            id: "branch-v1".to_string(),
            project_id: "proj-1".to_string(),
            name: "v1.0".to_string(),
            slug: "v1.0".to_string(),
            description: None,
            is_default: true,
            is_protected: false,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }];
        let pages = mock_pages();
        let languages = vec![];
        let assets = vec![];

        let bundle_bytes = generate_sqlite_bundle_export(
            project,
            branches,
            pages,
            languages,
            assets,
        )
        .await
        .expect("generate bundle export");

        use flate2::read::GzDecoder;
        use tar::Archive;

        let decoder = GzDecoder::new(&bundle_bytes[..]);
        let mut archive = Archive::new(decoder);
        let entries = archive.entries().expect("entries");
        let mut found_sqlite = false;
        let mut found_meta = false;

        for entry in entries {
            let entry = entry.expect("entry");
            let path = entry.path().expect("path").to_string_lossy().to_string();
            if path == "docs.sqlite" {
                found_sqlite = true;
            }
            if path.starts_with("search_index") && path.ends_with("meta.json") {
                found_meta = true;
            }
        }

        assert!(found_sqlite, "docs.sqlite must be in tar.gz");
        assert!(found_meta, "search_index/meta.json must be in tar.gz");
    }
}
