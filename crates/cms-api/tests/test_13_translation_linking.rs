mod common;

use axum::http::{Method, StatusCode};
use common::*;
use serde_json::json;
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_13_translation_linking_and_alternate_language_navigation() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();

    let project = create_project(
        &ctx.app,
        &cookie,
        format!("TransLinking E2E {}", Uuid::new_v4().simple()),
        &ctx.seed.organization_id,
        true,
    )
    .await?;
    let project_id = required_string(&project, "id", "project")?;

    let languages = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/app/projects/{project_id}/languages"), Some(&cookie), None).await?,
        StatusCode::OK,
        "languages",
    )?;
    let english_id = languages["data"][0]["id"].as_str().unwrap();

    let rtl_lang = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/languages"),
            Some(&cookie),
            Some(json!({ "code": "he-il", "name": "Hebrew", "direction": "RTL" })),
        )
        .await?,
        StatusCode::OK,
        "create rtl",
    )?;
    let rtl_id = rtl_lang["data"]["id"].as_str().unwrap();

    let _en_page = create_page(
        &ctx.app,
        &cookie,
        project_id,
        json!({
            "title": "Architecture Overview",
            "slug": "architecture",
            "kind": "PAGE",
            "languageId": english_id,
            "translationKey": "arch-overview-doc",
            "isPublished": true,
            "content": "# Architecture Overview",
        }),
    )
    .await?;

    let _rtl_page = create_page(
        &ctx.app,
        &cookie,
        project_id,
        json!({
            "title": "סקירת ארכיטקטורה",
            "slug": "mivne",
            "kind": "PAGE",
            "languageId": rtl_id,
            "translationKey": "arch-overview-doc",
            "isPublished": true,
            "content": "# סקירת ארכיטקטורה",
        }),
    )
    .await?;

    let dep = expect_status(
        request(&ctx.app, Method::POST, &format!("/api/app/projects/{project_id}/deployments"), Some(&cookie), Some(json!({ "message": "publish" }))).await?,
        StatusCode::OK,
        "publish",
    )?;
    let dep_id = required_string(&dep["data"], "id", "dep id")?;
    wait_for_deployment_ready(&ctx.state, dep_id).await?;

    let en_public = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/public/sites/{project_id}/page?path=architecture&lang=en&version=main"), None, None).await?,
        StatusCode::OK,
        "read en page",
    )?;
    anyhow::ensure!(en_public["data"]["page"]["title"] == "Architecture Overview");
    let en_alt_langs = en_public["data"]["languages"].as_array().ok_or_else(|| anyhow::anyhow!("languages missing"))?;
    anyhow::ensure!(en_alt_langs.iter().any(|item| item["code"] == "he-IL" && item["path"] == "mivne"));

    let rtl_public = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/public/sites/{project_id}/page?path=mivne&lang=he-IL&version=main"), None, None).await?,
        StatusCode::OK,
        "read rtl page",
    )?;
    anyhow::ensure!(rtl_public["data"]["page"]["title"] == "סקירת ארכיטקטורה");
    let rtl_alt_langs = rtl_public["data"]["languages"].as_array().ok_or_else(|| anyhow::anyhow!("languages missing"))?;
    anyhow::ensure!(rtl_alt_langs.iter().any(|item| item["code"] == "en" && item["path"] == "architecture"));

    ctx.teardown().await
}
