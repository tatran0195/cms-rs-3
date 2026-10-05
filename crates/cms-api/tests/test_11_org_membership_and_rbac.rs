mod common;

use axum::http::{Method, StatusCode};
use common::*;
use serde_json::json;
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_11_organization_membership_and_rbac() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();

    let second_email = format!("collab-{}@example.invalid", Uuid::new_v4());
    let second_user = expect_status(
        request(
            &ctx.app,
            Method::POST,
            "/api/auth/register",
            None,
            Some(json!({
                "email": second_email,
                "password": "Password123!",
                "name": "Collaborator User",
            })),
        )
        .await?,
        StatusCode::OK,
        "register second user",
    )?;
    let second_user_id = required_string(&second_user, "id", "second user")?;

    let initial_members = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/orgs/{}/members", ctx.seed.organization_id), Some(&cookie), None).await?,
        StatusCode::OK,
        "list org members",
    )?;
    let members_arr = initial_members.as_array().ok_or_else(|| anyhow::anyhow!("members not array"))?;
    anyhow::ensure!(members_arr.len() == 1, "initial member count is 1 (owner)");

    let add_member = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/orgs/{}/members", ctx.seed.organization_id),
            Some(&cookie),
            Some(json!({ "user_id": second_user_id, "role": "MEMBER" })),
        )
        .await?,
        StatusCode::OK,
        "add member",
    )?;
    let membership_id = required_string(&add_member, "id", "membership id")?;

    let members_after_add = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/orgs/{}/members", ctx.seed.organization_id), Some(&cookie), None).await?,
        StatusCode::OK,
        "list members after add",
    )?;
    anyhow::ensure!(members_after_add.as_array().unwrap().len() == 2);

    let updated_role = expect_status(
        request(
            &ctx.app,
            Method::PUT,
            &format!("/api/orgs/{}/members/{membership_id}", ctx.seed.organization_id),
            Some(&cookie),
            Some(json!({ "role": "ADMIN" })),
        )
        .await?,
        StatusCode::OK,
        "update member role",
    )?;
    anyhow::ensure!(updated_role["role"] == "ADMIN");

    let remove_member = expect_status(
        request(
            &ctx.app,
            Method::DELETE,
            &format!("/api/orgs/{}/members/{membership_id}", ctx.seed.organization_id),
            Some(&cookie),
            None,
        )
        .await?,
        StatusCode::OK,
        "remove member",
    )?;
    anyhow::ensure!(remove_member["success"] == true);

    let members_after_remove = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/orgs/{}/members", ctx.seed.organization_id), Some(&cookie), None).await?,
        StatusCode::OK,
        "list members after remove",
    )?;
    anyhow::ensure!(members_after_remove.as_array().unwrap().len() == 1);

    sqlx::query(r#"DELETE FROM "User" WHERE id = $1"#)
        .bind(second_user_id)
        .execute(&ctx.state.biz_context.pool)
        .await?;

    ctx.teardown().await
}
