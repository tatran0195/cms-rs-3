mod common;

use axum::http::{Method, StatusCode};
use common::*;
use serde_json::json;
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_09_preview_branches_and_isolation() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();

    let project = create_project(
        &ctx.app,
        &cookie,
        format!("Branch E2E {}", Uuid::new_v4().simple()),
        true,
    )
    .await?;
    let project_id = required_string(&project, "id", "project")?;
    let project_slug = required_string(&project, "slug", "project")?;
    let public_host = format!("{project_slug}.cms.app");

    let languages = expect_status(
        request(
            &ctx.app,
            Method::GET,
            &format!("/api/app/projects/{project_id}/languages"),
            Some(&cookie),
            None,
        )
        .await?,
        StatusCode::OK,
        "languages",
    )?;
    let english_id = languages["data"][0]["id"].as_str().unwrap();

    let main_dep = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/deployments"),
            Some(&cookie),
            Some(json!({ "message": "main" })),
        )
        .await?,
        StatusCode::OK,
        "main dep",
    )?;
    let main_dep_id = required_string(&main_dep["data"], "id", "main dep id")?;
    wait_for_deployment_ready(&ctx.state, main_dep_id).await?;

    let preview_branch_resp = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/branches"),
            Some(&cookie),
            Some(json!({ "project_id": project_id, "name": "Preview", "is_protected": true })),
        )
        .await?,
        StatusCode::OK,
        "create preview branch",
    )?;
    let preview_branch_id =
        required_string(&preview_branch_resp["data"], "id", "preview branch id")?;

    let _preview_page = create_page(
        &ctx.app,
        &cookie,
        project_id,
        json!({
            "title": "Preview Only",
            "slug": "preview-only",
            "kind": "PAGE",
            "branchId": preview_branch_id,
            "languageId": english_id,
            "isPublished": true,
            "content": "Secret preview content",
        }),
    )
    .await?;

    let preview_dep = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/branches/{preview_branch_id}/merge"),
            Some(&cookie),
            Some(json!({})),
        )
        .await?,
        StatusCode::OK,
        "publish preview branch",
    )?;
    let preview_dep_id = required_string(&preview_dep["data"], "id", "preview dep id")?;
    wait_for_deployment_ready(&ctx.state, preview_dep_id).await?;

    let preview_read = expect_status(
        request(
            &ctx.app,
            Method::GET,
            &format!(
                "/api/public/sites/{project_id}/page?path=preview-only&lang=en&version=preview"
            ),
            None,
            None,
        )
        .await?,
        StatusCode::OK,
        "read preview page explicitly",
    )?;
    anyhow::ensure!(preview_read["data"]["page"]["content"]
        .as_str()
        .unwrap()
        .contains("Secret preview content"));

    expect_status(
        request(
            &ctx.app,
            Method::GET,
            &format!("/api/public/sites/{project_id}/page?path=preview-only&lang=en&version=main"),
            None,
            None,
        )
        .await?,
        StatusCode::NOT_FOUND,
        "preview page hidden on main branch",
    )?;

    let (preview_host_status, _) = site_request(&ctx.app, &public_host, "/preview-only").await?;
    anyhow::ensure!(
        preview_host_status == StatusCode::NOT_FOUND,
        "preview content not served on default host"
    );

    ctx.teardown().await
}
