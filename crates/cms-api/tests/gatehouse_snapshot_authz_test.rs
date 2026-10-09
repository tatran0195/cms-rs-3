mod common;

use axum::http::{Method, StatusCode};
use common::*;
use serde_json::json;
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_unauthorized_when_not_logged_in() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;

    let (status, _) = request(
        &ctx.app,
        Method::GET,
        "/api/projects",
        None,
        None,
    )
    .await?;

    anyhow::ensure!(
        status == StatusCode::UNAUTHORIZED,
        "calling protected project list without auth returns 401, got {status}"
    );

    Ok(())
}

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_gatehouse_snapshot_project_and_platform_authorization() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let owner_cookie = ctx.user_cookie();

    // 1. Create a private project
    let private_name = format!("Private Gatehouse {}", Uuid::new_v4().simple());
    let private_proj = create_project(
        &ctx.app,
        &owner_cookie,
        private_name,
        &ctx.seed.organization_id,
        false,
    )
    .await?;
    let private_id = required_string(&private_proj, "id", "private project")?;

    // 2. Create a public project
    let public_name = format!("Public Gatehouse {}", Uuid::new_v4().simple());
    let public_proj = create_project(
        &ctx.app,
        &owner_cookie,
        public_name,
        &ctx.seed.organization_id,
        true,
    )
    .await?;
    let public_id = required_string(&public_proj, "id", "public project")?;

    // 3. Register a separate second user who is not a member of the organization
    let other_email = format!("other-{}@company.internal", Uuid::new_v4().simple());
    let (_, other_reg) = request(
        &ctx.app,
        Method::POST,
        "/api/auth/sign-up",
        None,
        Some(json!({
            "email": other_email,
            "password": "E2E-Password-2026",
            "name": "Other User",
        })),
    )
    .await?;
    let other_user_id = required_string(&other_reg, "id", "other user")?;

    // Log in / create session for other user
    let other_session_token = Uuid::new_v4().to_string();
    let now = chrono::Utc::now();
    sqlx::query(
        r#"INSERT INTO "Session" (id, user_id, session_token, expires_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $5)"#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&other_user_id)
    .bind(&other_session_token)
    .bind(now + chrono::Duration::hours(2))
    .bind(now)
    .execute(&ctx.state.biz_context.pool)
    .await?;
    let other_cookie = session_cookie(&other_session_token);

    // 4. Other user accessing private project -> 403 Forbidden
    let (forbidden_status, _) = request(
        &ctx.app,
        Method::GET,
        &format!("/api/projects/{private_id}"),
        Some(&other_cookie),
        None,
    )
    .await?;
    anyhow::ensure!(
        forbidden_status == StatusCode::FORBIDDEN,
        "non-member accessing private project returns 403 Forbidden, got {forbidden_status}"
    );

    // 5. Other user accessing public project -> 200 OK
    let (public_status, _) = request(
        &ctx.app,
        Method::GET,
        &format!("/api/projects/{public_id}"),
        Some(&other_cookie),
        None,
    )
    .await?;
    anyhow::ensure!(
        public_status == StatusCode::OK,
        "logged-in user accessing public project returns 200 OK, got {public_status}"
    );

    // 6. Owner accessing their private project -> 200 OK
    let (owner_status, _) = request(
        &ctx.app,
        Method::GET,
        &format!("/api/projects/{private_id}"),
        Some(&owner_cookie),
        None,
    )
    .await?;
    anyhow::ensure!(
        owner_status == StatusCode::OK,
        "owner accessing private project returns 200 OK, got {owner_status}"
    );

    // 7. Regular user accessing platform admin route -> 403 Forbidden
    let (admin_forbidden, _) = request(
        &ctx.app,
        Method::GET,
        "/api/admin/system/stats",
        Some(&owner_cookie),
        None,
    )
    .await?;
    anyhow::ensure!(
        admin_forbidden == StatusCode::FORBIDDEN,
        "non-platform admin accessing admin route returns 403 Forbidden, got {admin_forbidden}"
    );

    // 8. Platform admin accessing platform admin route -> 200 OK
    let admin_cookie = ctx.admin_cookie();
    let (admin_ok, _) = request(
        &ctx.app,
        Method::GET,
        "/api/admin/system/stats",
        Some(&admin_cookie),
        None,
    )
    .await?;
    anyhow::ensure!(
        admin_ok == StatusCode::OK,
        "platform admin accessing admin route returns 200 OK, got {admin_ok}"
    );

    Ok(())
}
