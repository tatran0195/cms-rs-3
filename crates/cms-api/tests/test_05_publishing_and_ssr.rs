mod common;

use axum::http::{Method, StatusCode};
use common::*;
use serde_json::json;
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_05_publishing_immutability_and_ssr() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();

    let project = create_project(
        &ctx.app,
        &cookie,
        format!("Publish E2E {}", Uuid::new_v4().simple()),
        &ctx.seed.organization_id,
        true,
    )
    .await?;
    let project_id = required_string(&project, "id", "project")?;
    let project_slug = required_string(&project, "slug", "project")?;
    let public_host = format!("{project_slug}.cms.app");

    let languages = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/app/projects/{project_id}/languages"), Some(&cookie), None).await?,
        StatusCode::OK,
        "languages",
    )?;
    let english_id = languages["data"][0]["id"].as_str().unwrap();

    let en_page = create_page(
        &ctx.app,
        &cookie,
        project_id,
        json!({
            "title": "Getting started",
            "slug": "start",
            "kind": "PAGE",
            "languageId": english_id,
            "translationKey": "getting-started",
            "isPublished": true,
            "content": "# Getting started\n\nEnglish release content.",
        }),
    )
    .await?;
    let en_page_id = required_string(&en_page, "id", "en page")?;

    let deployment = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/deployments"),
            Some(&cookie),
            Some(json!({ "message": "E2E publish test" })),
        )
        .await?,
        StatusCode::OK,
        "publish project",
    )?;
    anyhow::ensure!(deployment["data"]["status"] == "PENDING");
    let deployment_id = required_string(&deployment["data"], "id", "deployment")?;

    let (version, page_count) = wait_for_deployment_ready(&ctx.state, deployment_id).await?;
    anyhow::ensure!(version == 1);
    anyhow::ensure!(page_count == 1);

    let en_artifact = ctx.state.storage.get(&format!("sites/{project_id}/{deployment_id}/en/start.html")).await?;
    let en_html = String::from_utf8(en_artifact.to_vec())?;
    anyhow::ensure!(en_html.contains("English release content"));

    let (ssr_status, ssr_html) = site_request(&ctx.app, &public_host, "/start").await?;
    anyhow::ensure!(ssr_status == StatusCode::OK);
    anyhow::ensure!(ssr_html.contains("<html lang=\"en\" dir=\"ltr\">"));
    anyhow::ensure!(ssr_html.contains("English release content"));
    anyhow::ensure!(ssr_html.contains(&format!("<link rel=\"canonical\" href=\"https://{public_host}/start\">")));

    let (root_status, root_html) = site_request(&ctx.app, &public_host, "/").await?;
    anyhow::ensure!(root_status == StatusCode::OK);
    anyhow::ensure!(root_html.contains("Getting started"));

    let (sitemap_status, sitemap_body) = site_request(&ctx.app, &public_host, "/sitemap.xml").await?;
    anyhow::ensure!(sitemap_status == StatusCode::OK);
    anyhow::ensure!(sitemap_body.contains("/start"));

    let (robots_status, _) = site_request(&ctx.app, &public_host, "/robots.txt").await?;
    anyhow::ensure!(robots_status == StatusCode::OK);

    let (manifest_status, _) = site_request(&ctx.app, &public_host, "/site.webmanifest").await?;
    anyhow::ensure!(manifest_status == StatusCode::OK);

    // Immutability: edit page after publish
    expect_status(
        request(
            &ctx.app,
            Method::PATCH,
            &format!("/api/app/projects/{project_id}/pages/{en_page_id}"),
            Some(&cookie),
            Some(json!({ "content": "# Getting started\n\nEditor change after v1." })),
        )
        .await?,
        StatusCode::OK,
        "edit page",
    )?;

    // SSR still serves v1 content
    let (ssr2_status, ssr2_html) = site_request(&ctx.app, &public_host, "/start").await?;
    anyhow::ensure!(ssr2_status == StatusCode::OK);
    anyhow::ensure!(ssr2_html.contains("English release content"));
    anyhow::ensure!(!ssr2_html.contains("Editor change after v1"));

    ctx.teardown().await
}
