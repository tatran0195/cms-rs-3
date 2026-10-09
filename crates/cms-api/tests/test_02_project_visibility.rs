mod common;

use axum::http::{Method, StatusCode};
use common::*;
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_02_project_visibility_and_access_control() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();

    let public_project = create_project(
        &ctx.app,
        &cookie,
        format!("Public E2E {}", Uuid::new_v4().simple()),
        true,
    )
    .await?;
    let public_id = required_string(&public_project, "id", "public project")?;
    let public_slug = required_string(&public_project, "slug", "public project")?;

    let private_project = create_project(
        &ctx.app,
        &cookie,
        format!("Private E2E {}", Uuid::new_v4().simple()),
        false,
    )
    .await?;
    let private_id = required_string(&private_project, "id", "private project")?;
    let private_slug = required_string(&private_project, "slug", "private project")?;

    let public_host = format!("{public_slug}.cms.app");
    let (unreleased_status, _) = site_request(&ctx.app, &public_host, "/").await?;
    anyhow::ensure!(
        unreleased_status == StatusCode::NOT_FOUND,
        "unreleased public site hidden"
    );

    let private_host = format!("{private_slug}.cms.app");
    let (private_status, _) = site_request(&ctx.app, &private_host, "/").await?;
    anyhow::ensure!(
        private_status == StatusCode::NOT_FOUND,
        "private project hidden from SSR"
    );

    expect_status(
        request(
            &ctx.app,
            Method::GET,
            &format!("/api/public/sites/{public_id}"),
            None,
            None,
        )
        .await?,
        StatusCode::NOT_FOUND,
        "hide unreleased public project",
    )?;

    expect_status(
        request(
            &ctx.app,
            Method::GET,
            &format!("/api/public/sites/{private_id}"),
            None,
            None,
        )
        .await?,
        StatusCode::NOT_FOUND,
        "hide private project from public sites endpoint",
    )?;

    expect_status(
        request(
            &ctx.app,
            Method::GET,
            &format!("/api/public/projects/{private_slug}"),
            None,
            None,
        )
        .await?,
        StatusCode::NOT_FOUND,
        "hide private project from public route",
    )?;

    expect_status(
        request(
            &ctx.app,
            Method::GET,
            &format!("/api/app/projects/{private_id}"),
            None,
            None,
        )
        .await?,
        StatusCode::UNAUTHORIZED,
        "unauthenticated caller cannot access private project",
    )?;

    ctx.teardown().await
}
