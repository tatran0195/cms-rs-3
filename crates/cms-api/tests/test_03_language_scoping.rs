mod common;

use axum::http::{Method, StatusCode};
use common::*;
use serde_json::json;
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_03_language_scoping_and_bcp47_validation() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();

    let project = create_project(
        &ctx.app,
        &cookie,
        format!("Language E2E {}", Uuid::new_v4().simple()),
        &ctx.seed.organization_id,
        true,
    )
    .await?;
    let project_id = required_string(&project, "id", "project")?;

    let language_list = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/app/projects/{project_id}/languages"), Some(&cookie), None).await?,
        StatusCode::OK,
        "list project languages",
    )?;
    let languages = language_list["data"].as_array().ok_or_else(|| anyhow::anyhow!("not array"))?;
    let english = languages.iter().find(|l| l["isDefault"] == true).ok_or_else(|| anyhow::anyhow!("missing default language"))?;
    let english_id = required_string(english, "id", "english id")?;
    anyhow::ensure!(english["code"] == "en");

    let rtl_resp = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/languages"),
            Some(&cookie),
            Some(json!({
                "code": "he-il",
                "name": "Hebrew (Israel)",
                "direction": "RTL",
                "config": { "reader": { "greeting": "שלום" } },
            })),
        )
        .await?,
        StatusCode::OK,
        "create RTL language",
    )?;
    let rtl_lang = rtl_resp["data"].clone();
    let rtl_id = required_string(&rtl_lang, "id", "rtl id")?;
    anyhow::ensure!(rtl_lang["code"] == "he-IL");
    anyhow::ensure!(rtl_lang["direction"] == "RTL");

    expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/languages"),
            Some(&cookie),
            Some(json!({ "code": "bad..tag", "name": "Broken" })),
        )
        .await?,
        StatusCode::BAD_REQUEST,
        "reject malformed language code",
    )?;

    expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/languages"),
            Some(&cookie),
            Some(json!({ "code": "HE-il", "name": "Duplicate" })),
        )
        .await?,
        StatusCode::CONFLICT,
        "reject duplicate language code",
    )?;

    expect_status(
        request(
            &ctx.app,
            Method::DELETE,
            &format!("/api/app/projects/{project_id}/languages/{english_id}"),
            Some(&cookie),
            None,
        )
        .await?,
        StatusCode::CONFLICT,
        "protect default language from deletion",
    )?;

    let _en_page = create_page(
        &ctx.app,
        &cookie,
        project_id,
        json!({
            "title": "Welcome",
            "slug": "welcome",
            "kind": "PAGE",
            "languageId": english_id,
            "translationKey": "welcome-doc",
            "isPublished": true,
            "content": "# Welcome",
        }),
    )
    .await?;

    let _rtl_page = create_page(
        &ctx.app,
        &cookie,
        project_id,
        json!({
            "title": "ברוכים הבאים",
            "slug": "welcome",
            "kind": "PAGE",
            "languageId": rtl_id,
            "translationKey": "welcome-doc",
            "isPublished": true,
            "content": "# ברוכים הבאים",
        }),
    )
    .await?;

    let refreshed_languages = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/app/projects/{project_id}/languages"), Some(&cookie), None).await?,
        StatusCode::OK,
        "read translation coverage",
    )?;
    let rtl_cov = refreshed_languages["data"]
        .as_array()
        .and_then(|langs| langs.iter().find(|l| l["id"] == rtl_id))
        .and_then(|l| l.get("coverage"))
        .ok_or_else(|| anyhow::anyhow!("coverage missing"))?;
    anyhow::ensure!(rtl_cov["sourcePageCount"] == 1);
    anyhow::ensure!(rtl_cov["pageCount"] == 1);
    anyhow::ensure!(rtl_cov["matchedPages"] == 1);

    ctx.teardown().await
}
