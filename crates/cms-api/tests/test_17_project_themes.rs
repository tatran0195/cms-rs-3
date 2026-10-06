mod common;

use axum::http::{Method, StatusCode};
use common::*;
use serde_json::json;
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_17_project_themes_lifecycle_and_css_variables() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();

    let project = create_project(
        &ctx.app,
        &cookie,
        format!("Theme E2E {}", Uuid::new_v4().simple()),
        &ctx.seed.organization_id,
        true,
    )
    .await?;
    let project_id = required_string(&project, "id", "theme project")?;

    // Create a custom theme
    let created_theme = expect_status(
        request(
            &ctx.app,
            Method::POST,
            "/api/app/themes",
            Some(&cookie),
            Some(json!({
                "project_id": project_id,
                "name": "Midnight Emerald",
                "primary_color": "#10b981",
                "secondary_color": "#064e3b",
                "background_color": "#0f172a",
                "text_color": "#f8fafc",
                "font_family": "Inter, sans-serif",
            })),
        )
        .await?,
        StatusCode::OK,
        "create custom theme",
    )?;
    let theme_id = required_string(&created_theme, "id", "theme")?;
    anyhow::ensure!(created_theme["name"] == "Midnight Emerald");

    // Retrieve theme by id
    let fetched_theme = expect_status(
        request(
            &ctx.app,
            Method::GET,
            &format!("/api/app/themes/{theme_id}"),
            Some(&cookie),
            None,
        )
        .await?,
        StatusCode::OK,
        "get theme by id",
    )?;
    anyhow::ensure!(fetched_theme["primary_color"] == "#10b981");

    // Get theme CSS variables
    let css_vars = expect_status(
        request(
            &ctx.app,
            Method::GET,
            &format!("/api/app/themes/{theme_id}/css"),
            Some(&cookie),
            None,
        )
        .await?,
        StatusCode::OK,
        "get theme CSS variables",
    )?;
    anyhow::ensure!(css_vars["primary_color"] == "#10b981");
    anyhow::ensure!(css_vars["background_color"] == "#0f172a");

    // Set as project active theme
    let set_resp = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/themes/projects/{project_id}"),
            Some(&cookie),
            Some(json!({ "theme_id": theme_id })),
        )
        .await?,
        StatusCode::OK,
        "set project active theme",
    )?;
    anyhow::ensure!(set_resp["id"] == theme_id);

    // Update theme
    let updated_theme = expect_status(
        request(
            &ctx.app,
            Method::PUT,
            &format!("/api/app/themes/{theme_id}"),
            Some(&cookie),
            Some(json!({
                "primary_color": "#059669",
            })),
        )
        .await?,
        StatusCode::OK,
        "update theme primary color",
    )?;
    anyhow::ensure!(updated_theme["primary_color"] == "#059669");

    // Delete theme
    let del_theme = expect_status(
        request(
            &ctx.app,
            Method::DELETE,
            &format!("/api/app/themes/{theme_id}"),
            Some(&cookie),
            None,
        )
        .await?,
        StatusCode::OK,
        "delete theme",
    )?;
    anyhow::ensure!(del_theme["success"] == true);

    ctx.teardown().await
}
