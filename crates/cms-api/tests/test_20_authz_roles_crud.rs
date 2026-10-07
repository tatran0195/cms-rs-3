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
    let catalog = expect_status(
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

    anyhow::ensure!(catalog.get("workspace").is_some(), "workspace catalog present");
    anyhow::ensure!(catalog.get("project").is_some(), "project catalog present");

    // 2. Create custom workspace role
    let org_id = &ctx.seed.organization_id;
    let create_org_role = expect_status(
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

    let org_role_id = required_string(&create_org_role, "id", "workspace role id")?;
    anyhow::ensure!(create_org_role["name"] == "Doc Lead", "role name match");

    // 3. List workspace roles
    let org_roles_list = expect_status(
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
    let roles_arr = org_roles_list.as_array().ok_or_else(|| anyhow::anyhow!("roles not array"))?;
    anyhow::ensure!(roles_arr.iter().any(|r| r["id"] == org_role_id), "created role in list");

    // 4. Check workspace role usage
    let usage = expect_status(
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
    anyhow::ensure!(usage["usage_count"] == 0, "initial usage count is 0");

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
    let create_proj_role = expect_status(
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
    let proj_role_id = required_string(&create_proj_role, "id", "project role id")?;
    anyhow::ensure!(create_proj_role["name"] == "Translator", "role name match");

    // 7. List project roles
    let proj_roles_list = expect_status(
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
    let proj_roles_arr = proj_roles_list.as_array().ok_or_else(|| anyhow::anyhow!("project roles not array"))?;
    anyhow::ensure!(proj_roles_arr.iter().any(|r| r["id"] == proj_role_id), "created project role in list");

    // 8. Delete project role
    expect_status(
        request(
            &ctx.app,
            Method::DELETE,
            &format!("/api/v1/projects/{}/roles/{}", project_id, proj_role_id),
            Some(&cookie),
            None,
        )
        .await?,
        StatusCode::OK,
        "delete project role",
    )?;

    Ok(())
}
