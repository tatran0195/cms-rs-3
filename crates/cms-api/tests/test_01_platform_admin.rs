mod common;

use axum::http::{Method, StatusCode};
use chrono::{Duration, Utc};
use common::*;
use serde_json::json;
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_01_platform_admin_overview_and_invitations() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();
    let admin_cookie = ctx.admin_cookie();

    expect_status(
        request(
            &ctx.app,
            Method::GET,
            "/api/admin/sites",
            Some(&cookie),
            None,
        )
        .await?,
        StatusCode::FORBIDDEN,
        "project owners are not platform administrators",
    )?;

    let project = create_project(
        &ctx.app,
        &cookie,
        format!("Admin E2E {}", Uuid::new_v4().simple()),
        true,
    )
    .await?;
    let _project_id = required_string(&project, "id", "created project")?;

    let signup_at = Utc::now() - Duration::hours(2);
    for (event_type, created_at, metadata) in [
        ("signup_completed", signup_at, json!({})),
        ("page_edited", signup_at + Duration::minutes(20), json!({})),
        (
            "publish_clicked",
            signup_at + Duration::minutes(30),
            json!({ "auto": false }),
        ),
        (
            "publish_ready",
            signup_at - Duration::minutes(1),
            json!({ "auto": false }),
        ),
    ] {
        sqlx::query(
            r#"INSERT INTO "PlatformEvent" (id, user_id, event_type, metadata, created_at)
               VALUES ($1, $2, $3, $4, $5)"#,
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&ctx.seed.platform_admin_id)
        .bind(event_type)
        .bind(metadata)
        .bind(created_at)
        .execute(&ctx.state.biz_context.pool)
        .await?;
    }

    let overview = expect_status(
        request(
            &ctx.app,
            Method::GET,
            "/api/admin/overview",
            Some(&admin_cookie),
            None,
        )
        .await?,
        StatusCode::OK,
        "load platform-admin overview from persisted records",
    )?;
    anyhow::ensure!(overview["data"]["admins"].as_i64().is_some_and(|c| c >= 1));
    anyhow::ensure!(overview["data"]["sites"].as_i64().is_some_and(|c| c >= 1));

    let admin_user = expect_status(
        request(
            &ctx.app,
            Method::GET,
            &format!("/api/admin/users/{}", ctx.seed.user_id),
            Some(&admin_cookie),
            None,
        )
        .await?,
        StatusCode::OK,
        "load user detail with actual memberships",
    )?;
    let workspaces = admin_user["data"]["workspaces"]
        .as_array()
        .ok_or_else(|| anyhow::anyhow!("workspaces is not array"))?;
    let ws = workspaces
        .iter()
        .find(|w| w["projectId"] == _project_id)
        .ok_or_else(|| anyhow::anyhow!("project missing from memberships"))?;
    anyhow::ensure!(ws["role"].as_str().is_some());

    expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/admin/users/{}/suspend", ctx.seed.user_id),
            Some(&cookie),
            None,
        )
        .await?,
        StatusCode::FORBIDDEN,
        "standard user cannot invoke platform user operations",
    )?;

    expect_status(
        request(
            &ctx.app,
            Method::POST,
            "/api/platform-events",
            None,
            Some(json!({ "event_type": "custom_test" })),
        )
        .await?,
        StatusCode::UNAUTHORIZED,
        "reject unauthenticated event injection",
    )?;

    expect_status(
        request(
            &ctx.app,
            Method::POST,
            "/api/platform-events",
            Some(&cookie),
            Some(json!({
                "event_type": "custom_test",
                "user_id": ctx.seed.platform_admin_id,
                "metadata": { "source": "e2e" },
            })),
        )
        .await?,
        StatusCode::OK,
        "record event using authenticated identity",
    )?;
    let recorded_user: String = sqlx::query_scalar(
        r#"SELECT user_id FROM "PlatformEvent" WHERE event_type = 'custom_test' ORDER BY created_at DESC LIMIT 1"#,
    )
    .fetch_one(&ctx.state.biz_context.pool)
    .await?;
    anyhow::ensure!(recorded_user == ctx.seed.user_id);

    expect_status(
        request(
            &ctx.app,
            Method::POST,
            "/api/platform-events",
            Some(&cookie),
            Some(json!({
                "event_type": "publish_ready",
                "metadata": { "auto": false },
            })),
        )
        .await?,
        StatusCode::FORBIDDEN,
        "prevent clients from spoofing trusted milestones",
    )?;

    ctx.teardown().await
}
