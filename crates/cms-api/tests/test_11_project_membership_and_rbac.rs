mod common;

use axum::http::{Method, StatusCode};
use common::*;
use serde_json::json;
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_11_project_membership_and_rbac() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();

    let project = create_project(
        &ctx.app,
        &cookie,
        format!("RBAC Project {}", Uuid::new_v4().simple()),
        true,
    )
    .await?;
    let project_id = required_string(&project, "id", "created project")?;

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
        request(
            &ctx.app,
            Method::GET,
            &format!("/api/app/projects/{project_id}/members"),
            Some(&cookie),
            None,
        )
        .await?,
        StatusCode::OK,
        "list project members initially",
    )?;
    let members_arr = initial_members["data"]["members"]
        .as_array()
        .ok_or_else(|| anyhow::anyhow!("members not array"))?;
    anyhow::ensure!(members_arr.len() == 1, "initial member count is 1 (owner)");

    let _invite = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/members/invite"),
            Some(&cookie),
            Some(json!({ "email": second_email, "role": "member" })),
        )
        .await?,
        StatusCode::OK,
        "invite member to project",
    )?;

    let members_after_add = expect_status(
        request(
            &ctx.app,
            Method::GET,
            &format!("/api/app/projects/{project_id}/members"),
            Some(&cookie),
            None,
        )
        .await?,
        StatusCode::OK,
        "list members after add",
    )?;
    let members_after_arr = members_after_add["data"]["members"].as_array().unwrap();
    anyhow::ensure!(members_after_arr.len() == 2);

    let second_member = members_after_arr
        .iter()
        .find(|m| m["user"]["email"] == second_email)
        .ok_or_else(|| anyhow::anyhow!("second member not found in list"))?;
    let membership_id = required_string(second_member, "id", "membership id")?;

    let updated_role = expect_status(
        request(
            &ctx.app,
            Method::PATCH,
            &format!("/api/app/projects/{project_id}/members/{membership_id}/role"),
            Some(&cookie),
            Some(json!({ "role": "viewer" })),
        )
        .await?,
        StatusCode::OK,
        "update member role to viewer",
    )?;
    anyhow::ensure!(updated_role["data"]["role"] == "viewer");

    let remove_member = expect_status(
        request(
            &ctx.app,
            Method::DELETE,
            &format!("/api/app/projects/{project_id}/members/{membership_id}"),
            Some(&cookie),
            None,
        )
        .await?,
        StatusCode::OK,
        "remove member",
    )?;
    anyhow::ensure!(remove_member["data"]["success"] == true);

    let members_after_remove = expect_status(
        request(
            &ctx.app,
            Method::GET,
            &format!("/api/app/projects/{project_id}/members"),
            Some(&cookie),
            None,
        )
        .await?,
        StatusCode::OK,
        "list members after remove",
    )?;
    anyhow::ensure!(members_after_remove["data"]["members"].as_array().unwrap().len() == 1);

    sqlx::query(r#"DELETE FROM "User" WHERE id = $1"#)
        .bind(second_user_id)
        .execute(&ctx.state.biz_context.pool)
        .await?;

    ctx.teardown().await
}
