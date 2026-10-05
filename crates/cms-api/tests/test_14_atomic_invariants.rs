mod common;

use axum::http::{Method, StatusCode};
use common::*;
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_14_atomic_project_creation_invariants() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();

    let project = create_project(
        &ctx.app,
        &cookie,
        format!("Atomic Invariants {}", Uuid::new_v4().simple()),
        &ctx.seed.organization_id,
        true,
    )
    .await?;
    let project_id = required_string(&project, "id", "atomic project")?;

    let (project_count, branch_count, language_count, settings_count): (i64, i64, i64, i64) = sqlx::query_as(
        r#"SELECT
             (SELECT COUNT(*) FROM "Project" WHERE id = $1),
             (SELECT COUNT(*) FROM "Branch" WHERE project_id = $1 AND is_default = TRUE),
             (SELECT COUNT(*) FROM "Language" WHERE project_id = $1 AND is_default = TRUE AND code = 'en'),
             (SELECT COUNT(*) FROM "ProjectSettings" WHERE project_id = $1)"#,
    )
    .bind(project_id)
    .fetch_one(&ctx.state.biz_context.pool)
    .await?;
    anyhow::ensure!(project_count == 1, "project must exist");
    anyhow::ensure!(branch_count == 1, "default branch must exist atomically");
    anyhow::ensure!(language_count == 1, "default english language must exist atomically");
    anyhow::ensure!(settings_count == 1, "project settings must exist atomically");

    let pages_resp = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/app/projects/{project_id}/pages"), Some(&cookie), None).await?,
        StatusCode::OK,
        "read empty pages",
    )?;
    anyhow::ensure!(pages_resp["data"].as_array().is_some_and(Vec::is_empty));

    ctx.teardown().await
}
