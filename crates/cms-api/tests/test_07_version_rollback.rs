mod common;

use axum::http::{Method, StatusCode};
use common::*;
use serde_json::json;
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_07_version_progression_and_deployment_rollback() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();

    let project = create_project(
        &ctx.app,
        &cookie,
        format!("Rollback E2E {}", Uuid::new_v4().simple()),
        true,
    )
    .await?;
    let project_id = required_string(&project, "id", "project")?;

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

    let page = create_page(
        &ctx.app,
        &cookie,
        project_id,
        json!({
            "title": "Version One",
            "slug": "page",
            "kind": "PAGE",
            "languageId": english_id,
            "isPublished": true,
            "content": "# Initial Version 1 Content",
        }),
    )
    .await?;
    let page_id = required_string(&page, "id", "page")?;

    let dep1 = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/deployments"),
            Some(&cookie),
            Some(json!({ "message": "v1" })),
        )
        .await?,
        StatusCode::OK,
        "dep1",
    )?;
    let dep1_id = required_string(&dep1["data"], "id", "dep1 id")?;
    let (v1, _) = wait_for_deployment_ready(&ctx.state, dep1_id).await?;
    anyhow::ensure!(v1 == 1);

    expect_status(
        request(
            &ctx.app,
            Method::PATCH,
            &format!("/api/app/projects/{project_id}/pages/{page_id}"),
            Some(&cookie),
            Some(json!({ "content": "# Updated Version 2 Content" })),
        )
        .await?,
        StatusCode::OK,
        "edit page for v2",
    )?;

    let dep2 = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/deployments"),
            Some(&cookie),
            Some(json!({ "message": "v2" })),
        )
        .await?,
        StatusCode::OK,
        "dep2",
    )?;
    let dep2_id = required_string(&dep2["data"], "id", "dep2 id")?;
    let (v2, _) = wait_for_deployment_ready(&ctx.state, dep2_id).await?;
    anyhow::ensure!(v2 == 2);

    let pub_v2 = expect_status(
        request(
            &ctx.app,
            Method::GET,
            &format!("/api/public/sites/{project_id}/page?path=page&lang=en&version=main"),
            None,
            None,
        )
        .await?,
        StatusCode::OK,
        "public read v2",
    )?;
    anyhow::ensure!(pub_v2["data"]["version"] == 2);
    anyhow::ensure!(pub_v2["data"]["page"]["content"]
        .as_str()
        .unwrap()
        .contains("Updated Version 2 Content"));

    let rollback = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/deployments/{dep1_id}/rollback"),
            Some(&cookie),
            Some(json!({})),
        )
        .await?,
        StatusCode::OK,
        "rollback",
    )?;
    let rollback_id = required_string(&rollback["data"], "id", "rollback id")?;
    let (v3, _) = wait_for_deployment_ready(&ctx.state, rollback_id).await?;
    anyhow::ensure!(v3 == 3);

    let pub_v3 = expect_status(
        request(
            &ctx.app,
            Method::GET,
            &format!("/api/public/sites/{project_id}/page?path=page&lang=en&version=main"),
            None,
            None,
        )
        .await?,
        StatusCode::OK,
        "public read rollback v3",
    )?;
    anyhow::ensure!(pub_v3["data"]["version"] == 3);
    anyhow::ensure!(pub_v3["data"]["page"]["content"]
        .as_str()
        .unwrap()
        .contains("Initial Version 1 Content"));

    ctx.teardown().await
}
