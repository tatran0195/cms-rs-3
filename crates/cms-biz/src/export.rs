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
    common::{MemberRole, PaginatedResponse},
    export::{
        CreateExportRequest, ExportArtifact, ExportFormat, ExportJob, ExportSchedule,
        ExportSnapshot, ExportStatus,
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
        user_id: &str,
        request: CreateExportRequest,
    ) -> Result<ExportSnapshot, AppError> {
        // Verify project exists
        let _project = ProjectQueries::get_by_id(&ctx.pool, &request.project_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Project not found".to_string()))?;

        // Check if user has access to the project
        ctx.authz
            .require_project_role(user_id, &request.project_id, MemberRole::Viewer)
            .await?;

        let snapshot = ExportSnapshotQueries::create(
            &ctx.pool,
            &request.project_id,
            request.branch_id.as_deref(),
            request.language_id.as_deref(),
        )
        .await?;

        Ok(snapshot)
    }

    /// Get an export snapshot
    pub async fn get_export_snapshot(
        ctx: &BizContext,
        user_id: &str,
        snapshot_id: &str,
    ) -> Result<ExportSnapshot, AppError> {
        let snapshot = ExportSnapshotQueries::get_by_id(&ctx.pool, snapshot_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Export snapshot not found".to_string()))?;

        // Check if user has access to the project
        ctx.authz
            .require_project_role(user_id, &snapshot.project_id, MemberRole::Viewer)
            .await?;

        Ok(snapshot)
    }

    /// List export snapshots for a project
    pub async fn list_export_snapshots(
        ctx: &BizContext,
        user_id: &str,
        project_id: &str,
        page: u64,
        page_size: u64,
    ) -> Result<PaginatedResponse<ExportSnapshot>, AppError> {
        let _project = ProjectQueries::get_by_id(&ctx.pool, project_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Project not found".to_string()))?;

        // Check if user has access to the project
        ctx.authz
            .require_project_role(user_id, project_id, MemberRole::Viewer)
            .await?;

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
        user_id: &str,
        snapshot_id: &str,
        format: ExportFormat,
    ) -> Result<ExportJob, AppError> {
        let snapshot = ExportSnapshotQueries::get_by_id(&ctx.pool, snapshot_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Export snapshot not found".to_string()))?;

        // Check if user has access to the project
        ctx.authz
            .require_project_role(user_id, &snapshot.project_id, MemberRole::Viewer)
            .await?;

        // Autumn-style active entitlement check: verify export feature is entitled
        if let Ok(Some(proj)) =
            cms_db::project::ProjectQueries::get_by_id(&ctx.pool, &snapshot.project_id).await
        {
            crate::entitlement::EntitlementService::require_feature_entitlement(
                ctx,
                &proj.organization_id,
                "export",
            )
            .await?;
        }

        let job =
            ExportJobQueries::create(&ctx.pool, snapshot_id, format, ExportStatus::Pending).await?;

        Ok(job)
    }

    /// Get an export job
    pub async fn get_export_job(
        ctx: &BizContext,
        user_id: &str,
        job_id: &str,
    ) -> Result<ExportJob, AppError> {
        let job = ExportJobQueries::get_by_id(&ctx.pool, job_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Export job not found".to_string()))?;

        let snapshot = ExportSnapshotQueries::get_by_id(&ctx.pool, &job.snapshot_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Export snapshot not found".to_string()))?;

        // Check if user has access to the project
        ctx.authz
            .require_project_role(user_id, &snapshot.project_id, MemberRole::Viewer)
            .await?;

        Ok(job)
    }

    /// List export jobs for a project
    pub async fn list_export_jobs(
        ctx: &BizContext,
        user_id: &str,
        project_id: &str,
        page: u64,
        page_size: u64,
    ) -> Result<PaginatedResponse<ExportJob>, AppError> {
        let _project = ProjectQueries::get_by_id(&ctx.pool, project_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Project not found".to_string()))?;

        // Check if user has access to the project
        ctx.authz
            .require_project_role(user_id, project_id, MemberRole::Viewer)
            .await?;

        let limit = page_size.max(1) as i64;
        let offset = page.saturating_sub(1) as i64 * limit;
        let jobs =
            ExportJobQueries::get_by_project(&ctx.pool, project_id, Some(limit), Some(offset))
                .await?;

        let total = ExportJobQueries::count_by_project(&ctx.pool, project_id).await?;

        Ok(PaginatedResponse::new(jobs, total as u64, page, page_size))
    }

    /// Get export artifacts for a job
    pub async fn get_export_artifacts(
        ctx: &BizContext,
        user_id: &str,
        job_id: &str,
    ) -> Result<Vec<ExportArtifact>, AppError> {
        let job = ExportJobQueries::get_by_id(&ctx.pool, job_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Export job not found".to_string()))?;

        let snapshot = ExportSnapshotQueries::get_by_id(&ctx.pool, &job.snapshot_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Export snapshot not found".to_string()))?;

        // Check if user has access to the project
        ctx.authz
            .require_project_role(user_id, &snapshot.project_id, MemberRole::Viewer)
            .await?;

        ExportArtifactQueries::get_by_job(&ctx.pool, job_id).await
    }

    /// Create an export schedule
    #[allow(clippy::too_many_arguments)]
    pub async fn create_export_schedule(
        ctx: &BizContext,
        user_id: &str,
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

        // Check if user has admin role in the project
        ctx.authz
            .require_project_role(user_id, project_id, MemberRole::Admin)
            .await?;

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
        user_id: &str,
        schedule_id: &str,
    ) -> Result<ExportSchedule, AppError> {
        let schedule = ExportScheduleQueries::get_by_id(&ctx.pool, schedule_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Export schedule not found".to_string()))?;

        // Check if user has access to the project
        ctx.authz
            .require_project_role(user_id, &schedule.project_id, MemberRole::Viewer)
            .await?;

        Ok(schedule)
    }

    /// Delete an export schedule
    pub async fn delete_export_schedule(
        ctx: &BizContext,
        user_id: &str,
        schedule_id: &str,
    ) -> Result<bool, AppError> {
        let schedule = ExportScheduleQueries::get_by_id(&ctx.pool, schedule_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Export schedule not found".to_string()))?;

        // Check if user has admin role in the project
        ctx.authz
            .require_project_role(user_id, &schedule.project_id, MemberRole::Admin)
            .await?;

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
        user_id: &str,
        project_id: &str,
    ) -> Result<Vec<ExportSchedule>, AppError> {
        ctx.authz
            .require_project_role(user_id, project_id, MemberRole::Viewer)
            .await?;
        ExportScheduleQueries::get_by_project(&ctx.pool, project_id).await
    }

    /// Update export schedule
    pub async fn update_export_schedule(
        ctx: &BizContext,
        user_id: &str,
        schedule_id: &str,
        request: cms_entity::export::UpdateExportScheduleRequest,
    ) -> Result<ExportSchedule, AppError> {
        let schedule = ExportScheduleQueries::get_by_id(&ctx.pool, schedule_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Export schedule not found".to_string()))?;
        ctx.authz
            .require_project_role(user_id, &schedule.project_id, MemberRole::Admin)
            .await?;
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

    // Get all pages for the snapshot
    let pages = if let Some(branch_id) = &snapshot.branch_id {
        PageQueries::get_by_project_and_branch(
            pool,
            &snapshot.project_id,
            branch_id,
            None,
            None,
            None,
            None,
            None,
        )
        .await?
    } else {
        // Get default branch
        let default_branch = cms_db::branch::BranchQueries::get_default(pool, &snapshot.project_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Default branch not found".to_string()))?;

        PageQueries::get_by_project_and_branch(
            pool,
            &snapshot.project_id,
            &default_branch.id,
            None,
            None,
            None,
            None,
            None,
        )
        .await?
    };

    // Generate export content based on format
    let content_result = match job.format {
        ExportFormat::Html => generate_html_export(&pages, &snapshot.project_id).await,
        ExportFormat::Pdf => generate_pdf_export(&pages, &snapshot.project_id).await,
        ExportFormat::Markdown => Ok(generate_markdown_export(&pages).await),
        ExportFormat::Epub => generate_epub_export(&pages, &snapshot.project_id).await,
        ExportFormat::Sqlite => {
            generate_sqlite_export(pool, &snapshot.project_id, &pages, Some(storage.as_ref())).await
        }
    };

    let content = match content_result {
        Ok(c) => c,
        Err(e) => {
            tracing::error!("Export generation failed for job {}: {}", job_id, e);
            ExportJobQueries::update_status(pool, job_id, ExportStatus::Failed).await?;
            return Err(e);
        }
    };

    // Store the export artifact
    let extension = match &job.format {
        ExportFormat::Html => "html",
        ExportFormat::Pdf => "pdf",
        ExportFormat::Markdown => "md",
        ExportFormat::Epub => "epub",
        ExportFormat::Sqlite => "sqlite",
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
        ExportFormat::Sqlite => "application/vnd.sqlite3",
    };

    let content_len = content.len() as i64;
    storage.put(&storage_key, content, content_type).await?;

    // Create artifact record
    let _artifact = ExportArtifactQueries::create(
        pool,
        job_id,
        &format!("export.{}", extension),
        content_len,
        &storage_key,
        None, // download_url
    )
    .await?;

    // Update job status to completed
    ExportJobQueries::update_status(pool, job_id, ExportStatus::Completed).await?;
    ExportJobQueries::update_output_path(pool, job_id, &storage_key).await?;

    tracing::info!(
        "Export job {} completed successfully -> {}",
        job_id,
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

/// Generate HTML export
async fn generate_html_export(
    pages: &[cms_entity::page::PageListItem],
    project_id: &str,
) -> Result<Bytes, AppError> {
    let mut doc = format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Documentation Export - {}</title>
  <style>
    body {{ max-width: 900px; margin: 0 auto; padding: 2rem; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }}
    nav {{ background: #f8f9fa; padding: 1rem 1.5rem; border-radius: 8px; margin-bottom: 2rem; border: 1px solid #e9ecef; }}
    nav h2 {{ margin-top: 0; font-size: 1.25rem; }}
    nav ul {{ margin: 0; padding-left: 1.5rem; }}
    article {{ margin-bottom: 4rem; padding-bottom: 2rem; border-bottom: 1px solid #dee2e6; }}
    pre {{ background: #f8f9fa; padding: 1rem; border-radius: 4px; overflow-x: auto; border: 1px solid #e9ecef; font-family: monospace; font-size: 0.9em; }}
    code {{ background: #e9ecef; padding: 0.2em 0.4em; border-radius: 3px; font-family: monospace; font-size: 0.9em; }}
    pre code {{ background: none; padding: 0; }}
    table {{ border-collapse: collapse; width: 100%; margin: 1rem 0; }}
    th, td {{ border: 1px solid #dee2e6; padding: 0.5rem 0.75rem; text-align: left; }}
    th {{ background: #f8f9fa; }}
  </style>
</head>
<body>
  <header>
    <h1>Project Documentation Export</h1>
  </header>
  <nav>
    <h2>Table of Contents</h2>
    <ul>
"#,
        ammonia::clean(project_id)
    );

    for (i, page) in pages.iter().enumerate() {
        let anchor = format!("page-{}", i);
        doc.push_str(&format!(
            "      <li><a href=\"#{}\">{}</a></li>\n",
            anchor,
            ammonia::clean(&page.title)
        ));
    }

    doc.push_str("    </ul>\n  </nav>\n  <main>\n");

    for (i, page) in pages.iter().enumerate() {
        let anchor = format!("page-{}", i);
        let raw_md = page.content.as_deref().unwrap_or("");
        let clean_html = render_markdown(raw_md);

        doc.push_str(&format!(
            r#"    <article id="{}">
      <h2>{}</h2>
      <div>
{}
      </div>
    </article>
"#,
            anchor,
            ammonia::clean(&page.title),
            clean_html
        ));
    }

    doc.push_str("  </main>\n</body>\n</html>");

    Ok(Bytes::from(doc))
}

/// Generate Markdown export
async fn generate_markdown_export(pages: &[cms_entity::page::PageListItem]) -> Bytes {
    let mut md = String::from("# Documentation Export\n\n");

    for page in pages {
        md.push_str(&format!("## {}\n\n", page.title));
        if let Some(content) = &page.content {
            md.push_str(content);
            md.push_str("\n\n");
        }
        md.push_str("---\n\n");
    }

    Bytes::from(md)
}

/// Generate PDF export using printpdf
async fn generate_pdf_export(
    pages: &[cms_entity::page::PageListItem],
    project_id: &str,
) -> Result<Bytes, AppError> {
    use printpdf::*;

    let (doc, page1, layer1) = PdfDocument::new(
        format!("Documentation - {}", project_id),
        Mm(210.0),
        Mm(297.0),
        "Layer 1",
    );

    let font_title = doc
        .add_builtin_font(BuiltinFont::HelveticaBold)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to add bold font: {:?}", e)))?;

    let font_body = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to add regular font: {:?}", e)))?;

    let current_layer = doc.get_page(page1).get_layer(layer1);

    // Title on cover page
    current_layer.use_text(
        format!("Project Documentation - {}", project_id),
        22.0,
        Mm(20.0),
        Mm(260.0),
        &font_title,
    );

    current_layer.use_text(
        format!("Generated on {}", Utc::now().format("%Y-%m-%d %H:%M UTC")),
        12.0,
        Mm(20.0),
        Mm(245.0),
        &font_body,
    );

    let mut current_y = 220.0;

    // Table of contents on first page
    current_layer.use_text(
        "Table of Contents:",
        14.0,
        Mm(20.0),
        Mm(current_y),
        &font_title,
    );
    current_y -= 10.0;

    for (i, page) in pages.iter().take(15).enumerate() {
        let entry = format!("{}. {}", i + 1, page.title);
        current_layer.use_text(&entry, 10.0, Mm(25.0), Mm(current_y), &font_body);
        current_y -= 7.0;
    }

    // Add content pages
    for page in pages {
        let (page_idx, layer_idx) = doc.add_page(Mm(210.0), Mm(297.0), "Content Layer");
        let content_layer = doc.get_page(page_idx).get_layer(layer_idx);

        // Page title
        content_layer.use_text(&page.title, 18.0, Mm(20.0), Mm(270.0), &font_title);

        let mut y = 250.0;
        if let Some(content) = &page.content {
            for line in content.lines().take(35) {
                if y < 30.0 {
                    break;
                }
                // Strip markdown formatting symbols for basic PDF text
                let clean_line = line
                    .trim_start_matches('#')
                    .trim_start_matches('-')
                    .trim_start_matches('*')
                    .trim();

                if clean_line.is_empty() {
                    y -= 4.0;
                    continue;
                }

                // Truncate long lines to fit page
                let truncated: String = clean_line.chars().take(85).collect();
                content_layer.use_text(&truncated, 10.0, Mm(20.0), Mm(y), &font_body);
                y -= 6.0;
            }
        }
    }

    let pdf_bytes = doc
        .save_to_bytes()
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to render PDF: {:?}", e)))?;

    Ok(Bytes::from(pdf_bytes))
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

    build_sqlite_export_database(project, branches, pages.to_vec(), languages, assets).await
}

/// Helper function to build the isolated SQLite artifact from entity records
pub async fn build_sqlite_export_database(
    project: cms_entity::project::Project,
    branches: Vec<cms_entity::branch::Branch>,
    pages: Vec<cms_entity::page::PageListItem>,
    languages: Vec<cms_entity::language::Language>,
    assets: Vec<ExportAssetItem>,
) -> Result<Bytes, AppError> {
    tokio::task::spawn_blocking(move || -> Result<Bytes, AppError> {
        let temp_file = tempfile::NamedTempFile::new()
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to create temp sqlite file: {}", e)))?;
        let path = temp_file.path();

        let conn = rusqlite::Connection::open(path)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to open sqlite db: {}", e)))?;

        // Initialize reader-optimized schema
        conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;

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
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to create sqlite schema: {}", e)))?;

        // 1. Insert export_meta (schema_version = 1)
        conn.execute(
            r#"
            INSERT INTO export_meta (schema_version, project_id, project_name, project_slug, exported_at)
            VALUES (?1, ?2, ?3, ?4, ?5)
            "#,
            rusqlite::params![
                1,
                project.id,
                project.name,
                project.slug,
                Utc::now().to_rfc3339(),
            ],
        )
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to insert export_meta: {}", e)))?;

        // 2. Insert languages
        let mut default_lang_code = "en".to_string();
        let mut lang_id_to_code: std::collections::HashMap<String, String> = std::collections::HashMap::new();

        if languages.is_empty() {
            conn.execute(
                r#"
                INSERT INTO languages (code, label, is_default, is_rtl)
                VALUES (?1, ?2, ?3, ?4)
                "#,
                rusqlite::params!["en", "English", 1, 0],
            )
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to insert default language: {}", e)))?;
        } else {
            for (idx, lang) in languages.iter().enumerate() {
                lang_id_to_code.insert(lang.id.clone(), lang.code.clone());
                let is_def = if lang.is_default || idx == 0 {
                    default_lang_code = lang.code.clone();
                    1
                } else {
                    0
                };
                conn.execute(
                    r#"
                    INSERT OR REPLACE INTO languages (code, label, is_default, is_rtl)
                    VALUES (?1, ?2, ?3, ?4)
                    "#,
                    rusqlite::params![
                        lang.code,
                        lang.name,
                        is_def,
                        if lang.is_rtl { 1 } else { 0 },
                    ],
                )
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
            let is_def = if b.is_default || (!has_explicit_default && idx == 0) { 1 } else { 0 };
            conn.execute(
                r#"
                INSERT INTO versions (id, slug, label, sort_order, is_default)
                VALUES (?1, ?2, ?3, ?4, ?5)
                "#,
                rusqlite::params![
                    b.id,
                    b.slug,
                    b.name,
                    idx as i32,
                    is_def,
                ],
            )
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to insert version: {}", e)))?;
        }

        // 4. Insert pages, page_content, and page_fts
        for p in &pages {
            let target_version_id = if remapped_main && (p.branch_id == "main" || !valid_version_ids.contains(&p.branch_id)) {
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
                    cfg.get("openapi_url").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    cfg.get("link_url").and_then(|v| v.as_str()).map(|s| s.to_string()),
                )
            } else {
                (None, None)
            };

            conn.execute(
                r#"
                INSERT INTO pages (id, version_id, parent_id, kind, slug, path, title, icon, sort_order, is_draft, openapi_url, link_url)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
                "#,
                rusqlite::params![
                    p.id,
                    target_version_id,
                    p.parent_id,
                    p.kind.as_deref().unwrap_or("PAGE"),
                    p.slug,
                    p.path,
                    p.title,
                    p.icon,
                    p.position,
                    if p.is_published { 0 } else { 1 },
                    openapi_url,
                    link_url,
                ],
            )
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to insert page: {}", e)))?;

            // Resolve language code
            let lang_code = p.language_id
                .as_ref()
                .and_then(|id| lang_id_to_code.get(id))
                .cloned()
                .unwrap_or_else(|| default_lang_code.clone());

            let markdown_content = p.content.as_deref().unwrap_or("");
            conn.execute(
                r#"
                INSERT OR REPLACE INTO page_content (page_id, language, markdown, description, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5)
                "#,
                rusqlite::params![
                    p.id,
                    lang_code,
                    markdown_content,
                    p.description,
                    p.updated_at.to_rfc3339(),
                ],
            )
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to insert page_content: {}", e)))?;

            // Insert into FTS5 index
            conn.execute(
                r#"
                INSERT INTO page_fts (page_id, version_id, language, title, content)
                VALUES (?1, ?2, ?3, ?4, ?5)
                "#,
                rusqlite::params![
                    p.id,
                    target_version_id,
                    lang_code,
                    p.title,
                    markdown_content,
                ],
            )
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to insert page_fts: {}", e)))?;
        }

        // 5. Insert project_config
        conn.execute(
            r#"
            INSERT OR REPLACE INTO project_config (key, value)
            VALUES (?1, ?2), (?3, ?4), (?5, ?6)
            "#,
            rusqlite::params![
                "name",
                serde_json::to_string(&project.name).unwrap_or_default(),
                "slug",
                serde_json::to_string(&project.slug).unwrap_or_default(),
                "description",
                serde_json::to_string(&project.description).unwrap_or_default(),
            ],
        )
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to insert project_config: {}", e)))?;

        if let Some(config_val) = &project.config {
            if let Some(obj) = config_val.as_object() {
                for (k, v) in obj {
                    conn.execute(
                        r#"
                        INSERT OR REPLACE INTO project_config (key, value)
                        VALUES (?1, ?2)
                        "#,
                        rusqlite::params![k, v.to_string()],
                    )
                    .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to insert custom config: {}", e)))?;
                }
            }
        }

        // 6. Insert assets
        for a in &assets {
            conn.execute(
                r#"
                INSERT OR REPLACE INTO assets (path, mime_type, data, width, height)
                VALUES (?1, ?2, ?3, ?4, ?5)
                "#,
                rusqlite::params![
                    a.path,
                    a.mime_type,
                    a.data,
                    a.width,
                    a.height,
                ],
            )
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to insert asset: {}", e)))?;

            if !a.storage_key.is_empty() && a.storage_key != a.path {
                conn.execute(
                    r#"
                    INSERT OR IGNORE INTO assets (path, mime_type, data, width, height)
                    VALUES (?1, ?2, ?3, ?4, ?5)
                    "#,
                    rusqlite::params![
                        a.storage_key,
                        a.mime_type,
                        a.data,
                        a.width,
                        a.height,
                    ],
                )
                .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to insert asset alias: {}", e)))?;
            }
        }

        // Checkpoint WAL so everything is in the main database file
        conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to checkpoint sqlite: {}", e)))?;

        drop(conn);

        let data = std::fs::read(path)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to read generated sqlite file: {}", e)))?;

        Ok(Bytes::from(data))
    })
    .await
    .map_err(|e| AppError::Internal(anyhow::anyhow!("SQLite export task panicked: {}", e)))?
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
            organization_id: "org-1".to_string(),
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
        let conn = rusqlite::Connection::open(temp.path()).unwrap();

        // Check schema version in export_meta
        let (schema_ver, proj_name): (i32, String) = conn
            .query_row(
                "SELECT schema_version, project_name FROM export_meta",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(schema_ver, 1);
        assert_eq!(proj_name, "Test Project");

        // Verify 'main' branch was excluded, only 'v1.0' exists
        let version_slugs: Vec<String> = {
            let mut stmt = conn.prepare("SELECT slug FROM versions").unwrap();
            let rows = stmt.query_map([], |r| r.get(0)).unwrap();
            rows.map(|r| r.unwrap()).collect()
        };
        assert_eq!(version_slugs, vec!["v1.0".to_string()]);

        // Verify FTS5 search works
        let search_hits: Vec<String> = {
            let mut stmt = conn
                .prepare("SELECT title FROM page_fts WHERE page_fts MATCH 'Getting'")
                .unwrap();
            let rows = stmt.query_map([], |r| r.get(0)).unwrap();
            rows.map(|r| r.unwrap()).collect()
        };
        assert_eq!(search_hits, vec!["Getting Started".to_string()]);

        // Verify embedded asset blob
        let asset_data: Vec<u8> = conn
            .query_row("SELECT data FROM assets WHERE path = 'logo.png'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(asset_data, vec![1, 2, 3, 4]);
    }
}
