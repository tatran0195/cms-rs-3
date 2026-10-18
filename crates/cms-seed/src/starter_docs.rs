//! Starter documentation generator

use cms_db::{branch::BranchQueries, page::PageQueries, project::ProjectQueries, PgPool};
use cms_error::AppError;

pub async fn create_starter_project(
    pool: &PgPool,
    user_id: &str,
    project_name: &str,
    project_slug: &str,
) -> Result<(String, String), AppError> {
    // 1. Create project with creator as owner (this also creates default branch, language, settings)
    let project = ProjectQueries::create_atomic(
        pool,
        project_name,
        project_slug,
        Some("Internal company documentation workspace"),
        None,
        false,
        Some(user_id),
    )
    .await?;

    // 2. Fetch default branch
    let default_branch = BranchQueries::get_default(pool, &project.id)
        .await?
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("Default branch was not created")))?;

    // 3. Create starter page
    let welcome_content = r#"# Welcome to Your Documentation Workspace

This platform is deployed for internal company engineering, product, and operations documentation.

## Features
- **Notion-Style Visual & Markdown Editor**: Real-time drafting with frontmatter, callouts, and code highlighting.
- **Embedded Fast Search**: Tantivy full-text index with multi-language tokenization.
- **Portable Distribution**: Run documentation offline anywhere using `cms-site.exe` bundles.

## Getting Started
1. Create a new document in the sidebar.
2. Edit content and publish snapshots.
3. Invite team members in Project Settings.
"#;

    let _page = PageQueries::create_with_custom_id(
        pool,
        &project.id,
        &default_branch.id,
        None,
        None,
        Some("PAGE"),
        "welcome",
        "Welcome",
        Some("Getting started with the CMS platform"),
        Some(welcome_content),
        None,
        None,
        None,
        Some("welcome-page"),
        0,
        true,
    )
    .await?;

    Ok((project.id, project.slug))
}
