mod common;

use axum::http::{Method, StatusCode};
use common::*;
use serde_json::json;
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_08_custom_domain_lifecycle_and_tls_verification() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();

    let project = create_project(
        &ctx.app,
        &cookie,
        format!("Domain E2E {}", Uuid::new_v4().simple()),
        &ctx.seed.organization_id,
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

    let _page = create_page(
        &ctx.app,
        &cookie,
        project_id,
        json!({
            "title": "Home",
            "slug": "home",
            "kind": "PAGE",
            "languageId": english_id,
            "isPublished": true,
            "content": "# Welcome Custom Domain",
        }),
    )
    .await?;

    let dep = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/deployments"),
            Some(&cookie),
            Some(json!({ "message": "initial" })),
        )
        .await?,
        StatusCode::OK,
        "dep",
    )?;
    let dep_id = required_string(&dep["data"], "id", "dep id")?;
    wait_for_deployment_ready(&ctx.state, dep_id).await?;

    let custom_hostname = format!("docs-{}.example.invalid", Uuid::new_v4().simple());
    let custom_domain = cms_db::domain::DomainQueries::create(
        &ctx.state.biz_context.pool,
        dep_id,
        &custom_hostname,
        true,
    )
    .await?;

    expect_status(
        request(
            &ctx.app,
            Method::GET,
            &format!("/api/public/domains/tls-authorize?domain={custom_hostname}"),
            None,
            None,
        )
        .await?,
        StatusCode::NOT_FOUND,
        "unverified domain cannot authorize TLS",
    )?;

    cms_db::domain::DomainQueries::verify(
        &ctx.state.biz_context.pool,
        &custom_domain.id,
        &custom_domain.verification_token,
    )
    .await?;
    ctx.state.invalidate_host_resolution_cache();

    expect_status(
        request(
            &ctx.app,
            Method::GET,
            &format!("/api/public/domains/tls-authorize?domain={custom_hostname}"),
            None,
            None,
        )
        .await?,
        StatusCode::NO_CONTENT,
        "verified domain authorizes TLS",
    )?;

    let (custom_status, custom_html) = site_request(&ctx.app, &custom_hostname, "/home").await?;
    anyhow::ensure!(custom_status == StatusCode::OK);
    anyhow::ensure!(custom_html.contains("Welcome Custom Domain"));
    anyhow::ensure!(custom_html.contains(&format!(
        "<link rel=\"canonical\" href=\"https://{custom_hostname}/home\">"
    )));

    let resolved = expect_status(
        request(
            &ctx.app,
            Method::GET,
            &format!("/api/public/domains/resolve?host={custom_hostname}"),
            None,
            None,
        )
        .await?,
        StatusCode::OK,
        "resolve domain",
    )?;
    anyhow::ensure!(resolved["data"]["projectId"] == project_id);
    anyhow::ensure!(resolved["data"]["verified"] == true);

    let (untrusted_tls_status, _) =
        site_request_through_tls_proxy(&ctx.app, &custom_hostname, "/", None).await?;
    anyhow::ensure!(untrusted_tls_status == StatusCode::OK);
    let pending_tls: String =
        sqlx::query_scalar(r#"SELECT ssl_status FROM "Domain" WHERE id = $1"#)
            .bind(&custom_domain.id)
            .fetch_one(&ctx.state.biz_context.pool)
            .await?;
    anyhow::ensure!(pending_tls == "PENDING");

    let (trusted_tls_status, _) = site_request_through_tls_proxy(
        &ctx.app,
        &custom_hostname,
        "/",
        Some("e2e-trusted-proxy-secret"),
    )
    .await?;
    anyhow::ensure!(trusted_tls_status == StatusCode::OK);
    let active_tls: String = sqlx::query_scalar(r#"SELECT ssl_status FROM "Domain" WHERE id = $1"#)
        .bind(&custom_domain.id)
        .fetch_one(&ctx.state.biz_context.pool)
        .await?;
    anyhow::ensure!(active_tls == "ACTIVE");

    ctx.teardown().await
}
