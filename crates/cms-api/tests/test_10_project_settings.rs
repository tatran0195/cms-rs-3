mod common;

use axum::http::{Method, StatusCode};
use common::*;
use serde_json::json;
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_10_project_settings_and_site_features() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();

    let project = create_project(
        &ctx.app,
        &cookie,
        format!("Settings E2E {}", Uuid::new_v4().simple()),
        &ctx.seed.organization_id,
        true,
    )
    .await?;
    let project_id = required_string(&project, "id", "project")?;

    let initial_settings = expect_status(
        request(
            &ctx.app,
            Method::GET,
            &format!("/api/app/projects/{project_id}/settings"),
            Some(&cookie),
            None,
        )
        .await?,
        StatusCode::OK,
        "get settings",
    )?;
    anyhow::ensure!(initial_settings["data"]["id"].is_string());

    let updated_settings = expect_status(
        request(
            &ctx.app,
            Method::PUT,
            &format!("/api/app/projects/{project_id}/settings"),
            Some(&cookie),
            Some(json!({
                "theme": "dark",
                "search_enabled": true,
                "comments_enabled": true,
            })),
        )
        .await?,
        StatusCode::OK,
        "update settings",
    )?;
    anyhow::ensure!(updated_settings["data"]["theme"] == "dark");
    anyhow::ensure!(updated_settings["data"]["search_enabled"] == true);
    anyhow::ensure!(updated_settings["data"]["comments_enabled"] == true);

    let fetched = expect_status(
        request(
            &ctx.app,
            Method::GET,
            &format!("/api/app/projects/{project_id}/settings"),
            Some(&cookie),
            None,
        )
        .await?,
        StatusCode::OK,
        "fetch updated settings",
    )?;
    anyhow::ensure!(fetched["data"]["theme"] == "dark");
    anyhow::ensure!(fetched["data"]["search_enabled"] == true);

    ctx.teardown().await
}
