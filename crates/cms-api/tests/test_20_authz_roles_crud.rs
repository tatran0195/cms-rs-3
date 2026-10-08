mod common;

use axum::http::{Method, StatusCode};
use common::*;
use serde_json::json;
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_20_permission_catalog_and_roles_crud() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();

    // 1. Fetch dynamic permission catalog
    let catalog_res = expect_status(
        request(
            &ctx.app,
            Method::GET,
            "/api/v1/permissions/catalog",
            Some(&cookie),
            None,
        )
        .await?,
        StatusCode::OK,
        "get permission catalog",
    )?;
    let catalog = &catalog_res["data"];

    anyhow::ensure!(catalog.get("workspace").is_some(), "workspace catalog present");
    anyhow::ensure!(catalog.get("project").is_some(), "project catalog present");

    // 2. Create custom workspace role
    let org_id = &ctx.seed.organization_id;
    let create_org_role_res = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/v1/workspaces/{}/roles", org_id),
            Some(&cookie),
            Some(json!({
                "name": "Doc Lead",
                "description": "Lead documentation reviewer",
                "is_default": false,
                "permissions": {
                    "projects": { "create": true, "read": true, "edit": true },
                    "members": { "read": true }
                }
            })),
        )
        .await?,
        StatusCode::OK,
        "create custom workspace role",
    )?;
    let create_org_role = &create_org_role_res["data"];
    let org_role_id = required_string(create_org_role, "id", "workspace role id")?;
    anyhow::ensure!(create_org_role["name"] == "Doc Lead", "role name match");

    // 3. List workspace roles
    let org_roles_list_res = expect_status(
        request(
            &ctx.app,
            Method::GET,
            &format!("/api/v1/workspaces/{}/roles", org_id),
            Some(&cookie),
            None,
        )
        .await?,
        StatusCode::OK,
        "list workspace roles",
    )?;
    let roles_arr = org_roles_list_res["data"].as_array().ok_or_else(|| anyhow::anyhow!("roles not array"))?;
    anyhow::ensure!(roles_arr.iter().any(|r| r["id"] == org_role_id), "created role in list");

    // 4. Check workspace role usage
    let usage_res = expect_status(
        request(
            &ctx.app,
            Method::GET,
            &format!("/api/v1/workspaces/{}/roles/{}/usage", org_id, org_role_id),
            Some(&cookie),
            None,
        )
        .await?,
        StatusCode::OK,
        "get workspace role usage",
    )?;
    anyhow::ensure!(usage_res["data"]["usage_count"] == 0, "initial usage count is 0");

    // 5. Create a project
    let project = create_project(
        &ctx.app,
        &cookie,
        format!("Roles Test {}", Uuid::new_v4().simple()),
        org_id,
        true,
    )
    .await?;
    let project_id = required_string(&project, "id", "test project")?;

    // 6. Create custom project role
    let create_proj_role_res = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/v1/projects/{}/roles", project_id),
            Some(&cookie),
            Some(json!({
                "name": "Translator",
                "description": "Translator with page edit permissions",
                "is_default": false,
                "permissions": {
                    "pages": { "read": true, "edit": true },
                    "branches": { "read": true }
                }
            })),
        )
        .await?,
        StatusCode::OK,
        "create custom project role",
    )?;
    let create_proj_role = &create_proj_role_res["data"];
    let proj_role_id = required_string(create_proj_role, "id", "project role id")?;
    anyhow::ensure!(create_proj_role["name"] == "Translator", "role name match");

    // 7. List project roles
    let proj_roles_list_res = expect_status(
        request(
            &ctx.app,
            Method::GET,
            &format!("/api/v1/projects/{}/roles", project_id),
            Some(&cookie),
            None,
        )
        .await?,
        StatusCode::OK,
        "list project roles",
    )?;
    let proj_roles_arr = proj_roles_list_res["data"].as_array().ok_or_else(|| anyhow::anyhow!("project roles not array"))?;
    anyhow::ensure!(proj_roles_arr.iter().any(|r| r["id"] == proj_role_id), "created project role in list");

    // 8. Create a second project role to test reassignment
    let create_second_proj_role_res = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/v1/projects/{}/roles", project_id),
            Some(&cookie),
            Some(json!({
                "name": "Reviewer",
                "description": "Reviewer role",
                "is_default": false,
                "permissions": {
                    "pages": { "read": true },
                    "branches": { "read": true }
                }
            })),
        )
        .await?,
        StatusCode::OK,
        "create second project role",
    )?;
    let second_proj_role_id = required_string(&create_second_proj_role_res["data"], "id", "second project role id")?;

    // 9. Assign member to first project role and verify usage count tracking
    let second_user_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now();
    sqlx::query(
        r#"INSERT INTO "User" (id, email, name, role, email_verified, created_at, updated_at)
           VALUES ($1, $2, 'Staff Writer', 'user', true, $3, $3)"#,
    )
    .bind(&second_user_id)
    .bind(format!("writer-{}@example.com", Uuid::new_v4().simple()))
    .bind(now)
    .execute(&ctx.state.biz_context.pool)
    .await?;

    cms_db::authz::ProjectMemberQueries::create(
        &ctx.state.biz_context.pool,
        &project_id,
        &second_user_id,
        "member",
        Some(&proj_role_id),
    )
    .await?;

    let usage_after_assign = expect_status(
        request(
            &ctx.app,
            Method::GET,
            &format!("/api/v1/projects/{}/roles/{}/usage", project_id, proj_role_id),
            Some(&cookie),
            None,
        )
        .await?,
        StatusCode::OK,
        "get project role usage after assignment",
    )?;
    anyhow::ensure!(usage_after_assign["data"]["usage_count"] == 1, "usage count is 1 after assignment");

    // 10. Attempting to delete role without target_role_id must return 409 Conflict
    let (conflict_status, conflict_body) = request(
        &ctx.app,
        Method::DELETE,
        &format!("/api/v1/projects/{}/roles/{}", project_id, proj_role_id),
        Some(&cookie),
        None,
    )
    .await?;
    anyhow::ensure!(
        conflict_status == StatusCode::CONFLICT,
        "expected 409 Conflict when deleting role with active members, got {} with body {}",
        conflict_status,
        conflict_body
    );

    // 11. Deleting role with target_role_id must reassign member and succeed
    expect_status(
        request(
            &ctx.app,
            Method::DELETE,
            &format!("/api/v1/projects/{}/roles/{}?target_role_id={}", project_id, proj_role_id, second_proj_role_id),
            Some(&cookie),
            None,
        )
        .await?,
        StatusCode::OK,
        "delete project role with reassign",
    )?;

    // 12. Verify second role usage count increased to 1
    let second_role_usage = expect_status(
        request(
            &ctx.app,
            Method::GET,
            &format!("/api/v1/projects/{}/roles/{}/usage", project_id, second_proj_role_id),
            Some(&cookie),
            None,
        )
        .await?,
        StatusCode::OK,
        "get second role usage after reassignment",
    )?;
    anyhow::ensure!(second_role_usage["data"]["usage_count"] == 1, "second role received reassigned member");

    // 13. Update workspace role
    let update_org_role_res = expect_status(
        request(
            &ctx.app,
            Method::PATCH,
            &format!("/api/v1/workspaces/{}/roles/{}", org_id, org_role_id),
            Some(&cookie),
            Some(json!({
                "name": "Senior Doc Lead",
                "description": "Updated lead documentation reviewer",
                "permissions": {
                    "projects": { "create": true, "read": true, "edit": true, "delete": true },
                    "members": { "read": true, "edit": true }
                }
            })),
        )
        .await?,
        StatusCode::OK,
        "update workspace role",
    )?;
    anyhow::ensure!(update_org_role_res["data"]["name"] == "Senior Doc Lead", "updated role name matches");

    // 14. Delete workspace role
    expect_status(
        request(
            &ctx.app,
            Method::DELETE,
            &format!("/api/v1/workspaces/{}/roles/{}", org_id, org_role_id),
            Some(&cookie),
            None,
        )
        .await?,
        StatusCode::OK,
        "delete workspace role",
    )?;

    // 15. Clean up second user
    sqlx::query(r#"DELETE FROM "User" WHERE id = $1"#)
        .bind(&second_user_id)
        .execute(&ctx.state.biz_context.pool)
        .await?;

    Ok(())
}
