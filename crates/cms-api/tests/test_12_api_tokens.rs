mod common;

use axum::http::{Method, StatusCode};
use common::*;
use serde_json::json;
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_12_api_tokens_lifecycle_and_authentication() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();

    let project = create_project(
        &ctx.app,
        &cookie,
        format!("ApiToken E2E {}", Uuid::new_v4().simple()),
        &ctx.seed.organization_id,
        true,
    )
    .await?;
    let project_id = required_string(&project, "id", "project")?;

    let created_key = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/api-keys"),
            Some(&cookie),
            Some(json!({ "name": "CI Automated Publisher" })),
        )
        .await?,
        StatusCode::OK,
        "create api key",
    )?;
    let key_id = required_string(&created_key["data"], "id", "key id")?;
    let raw_key = required_string(&created_key["data"], "key", "raw key")?;

    let key_headers = [("x-api-key", raw_key)];
    let (auth_status, pages_val) = request_with_headers(
        &ctx.app,
        Method::GET,
        &format!("/api/app/projects/{project_id}/pages"),
        &key_headers,
        None,
    )
    .await?;
    anyhow::ensure!(auth_status == StatusCode::OK, "api token authenticates request");
    anyhow::ensure!(pages_val["data"].is_array());

    let del_key = expect_status(
        request(&ctx.app, Method::DELETE, &format!("/api/app/projects/{project_id}/api-keys/{key_id}"), Some(&cookie), None).await?,
        StatusCode::OK,
        "delete api key",
    )?;
    anyhow::ensure!(del_key["data"]["id"] == key_id);

    let (revoked_status, _) = request_with_headers(
        &ctx.app,
        Method::GET,
        &format!("/api/app/projects/{project_id}/pages"),
        &key_headers,
        None,
    )
    .await?;
    anyhow::ensure!(revoked_status == StatusCode::UNAUTHORIZED, "revoked api token is rejected");

    ctx.teardown().await
}
