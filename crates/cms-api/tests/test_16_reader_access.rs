mod common;

use axum::http::{Method, StatusCode};
use common::*;
use serde_json::json;
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_16_reader_access_audiences_and_grants() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();

    let project = create_project(
        &ctx.app,
        &cookie,
        format!("ReaderAccess E2E {}", Uuid::new_v4().simple()),
        &ctx.seed.organization_id,
        false,
    )
    .await?;
    let project_id = required_string(&project, "id", "reader access project")?;

    // Create an audience
    let audience_resp = expect_status(
        request(
            &ctx.app,
            Method::POST,
            "/api/app/reader-access/audiences",
            Some(&cookie),
            Some(json!({
                "project_id": project_id,
                "name": "Beta Testers",
                "description": "External private beta readers",
            })),
        )
        .await?,
        StatusCode::OK,
        "create audience",
    )?;
    let audience_id = required_string(&audience_resp, "id", "audience")?;
    anyhow::ensure!(audience_resp["name"] == "Beta Testers");

    // List audiences for project
    let audiences = expect_status(
        request(
            &ctx.app,
            Method::GET,
            &format!("/api/app/reader-access/projects/{project_id}/audiences"),
            Some(&cookie),
            None,
        )
        .await?,
        StatusCode::OK,
        "list project audiences",
    )?;
    let aud_array = audiences
        .as_array()
        .ok_or_else(|| anyhow::anyhow!("audiences not array"))?;
    anyhow::ensure!(aud_array.iter().any(|a| a["id"] == audience_id));

    // Create an audience grant
    let grant_resp = expect_status(
        request(
            &ctx.app,
            Method::POST,
            "/api/app/reader-access/audience-grants",
            Some(&cookie),
            Some(json!({
                "audience_id": audience_id,
                "project_id": project_id,
            })),
        )
        .await?,
        StatusCode::OK,
        "create audience grant",
    )?;
    let grant_id = required_string(&grant_resp, "id", "grant")?;
    anyhow::ensure!(grant_resp["audience_id"] == audience_id);

    // List audience grants
    let grants = expect_status(
        request(
            &ctx.app,
            Method::GET,
            &format!("/api/app/reader-access/audiences/{audience_id}/grants"),
            Some(&cookie),
            None,
        )
        .await?,
        StatusCode::OK,
        "list audience grants",
    )?;
    let grant_array = grants
        .as_array()
        .ok_or_else(|| anyhow::anyhow!("grants not array"))?;
    anyhow::ensure!(grant_array.iter().any(|g| g["id"] == grant_id));

    // Delete audience grant
    let del_grant = expect_status(
        request(
            &ctx.app,
            Method::DELETE,
            &format!("/api/app/reader-access/audience-grants/{grant_id}"),
            Some(&cookie),
            None,
        )
        .await?,
        StatusCode::OK,
        "delete audience grant",
    )?;
    anyhow::ensure!(del_grant["success"] == true);

    // Delete audience
    let del_aud = expect_status(
        request(
            &ctx.app,
            Method::DELETE,
            &format!("/api/app/reader-access/audiences/{audience_id}"),
            Some(&cookie),
            None,
        )
        .await?,
        StatusCode::OK,
        "delete audience",
    )?;
    anyhow::ensure!(del_aud["success"] == true);

    ctx.teardown().await
}
