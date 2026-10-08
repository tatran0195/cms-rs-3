mod common;

use axum::http::{Method, StatusCode};
use common::*;
use serde_json::json;
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_21_authz_red_and_green_enforcement() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let owner_cookie = ctx.user_cookie();
    let org_id = &ctx.seed.organization_id;

    // =========================================================================
    // PART 1: Schema Invariant & Input Validation Red Cases
    // =========================================================================

    // RED CASE 1: Cannot create workspace role with invalid/empty name
    let (empty_name_status, _) = request(
        &ctx.app,
        Method::POST,
        &format!("/api/v1/workspaces/{org_id}/roles"),
        Some(&owner_cookie),
        Some(json!({
            "name": "   ",
            "permissions": {}
        })),
    )
    .await?;
    anyhow::ensure!(
        empty_name_status == StatusCode::UNPROCESSABLE_ENTITY
            || empty_name_status == StatusCode::BAD_REQUEST,
        "empty role name must fail validation, got HTTP {empty_name_status}"
    );

    // GREEN CASE 1: Owner creates custom workspace role "SupportAgent"
    // Allowed: projects:read, members:read, roles:read. Disallowed: projects:create, roles:create
    let create_ws_role_res = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/v1/workspaces/{org_id}/roles"),
            Some(&owner_cookie),
            Some(json!({
                "name": "SupportAgent",
                "description": "Read-only access to projects and members",
                "is_default": false,
                "permissions": {
                    "projects": { "read": true, "create": false, "edit": false, "delete": false },
                    "members": { "read": true, "edit": false },
                    "roles": { "read": true, "create": false, "edit": false, "delete": false }
                }
            })),
        )
        .await?,
        StatusCode::OK,
        "create SupportAgent workspace role",
    )?;
    let ws_role_id = required_string(&create_ws_role_res["data"], "id", "support role id")?;

    // RED CASE 2: Duplicate workspace role name must return 409 Conflict
    let (dup_ws_status, _) = request(
        &ctx.app,
        Method::POST,
        &format!("/api/v1/workspaces/{org_id}/roles"),
        Some(&owner_cookie),
        Some(json!({
            "name": "SupportAgent",
            "permissions": {}
        })),
    )
    .await?;
    anyhow::ensure!(
        dup_ws_status == StatusCode::CONFLICT,
        "duplicate workspace role name must return 409 Conflict, got HTTP {dup_ws_status}"
    );

    // RED CASE 3: Get non-existent workspace role must return 404 Not Found
    let (not_found_ws_status, _) = request(
        &ctx.app,
        Method::GET,
        &format!("/api/v1/workspaces/{org_id}/roles/00000000-0000-0000-0000-000000000000"),
        Some(&owner_cookie),
        None,
    )
    .await?;
    anyhow::ensure!(
        not_found_ws_status == StatusCode::NOT_FOUND,
        "non-existent role must return 404, got HTTP {not_found_ws_status}"
    );

    // =========================================================================
    // PART 2: Stranger (Unassigned / Non-Member) Red Cases
    // =========================================================================
    let stranger_user_id = Uuid::new_v4().to_string();
    let stranger_token = format!("stranger_{}", Uuid::new_v4().simple());
    let now = chrono::Utc::now();

    sqlx::query(
        r#"INSERT INTO "User" (id, email, name, role, email_verified, created_at, updated_at)
           VALUES ($1, $2, 'Stranger User', 'user', true, $3, $3)"#,
    )
    .bind(&stranger_user_id)
    .bind(format!("stranger-{}@example.com", Uuid::new_v4().simple()))
    .bind(now)
    .execute(&ctx.state.biz_context.pool)
    .await?;

    sqlx::query(
        r#"INSERT INTO "Session" (id, user_id, session_token, expires_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $5)"#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&stranger_user_id)
    .bind(&stranger_token)
    .bind(now + chrono::Duration::hours(2))
    .bind(now)
    .execute(&ctx.state.biz_context.pool)
    .await?;

    let stranger_cookie = session_cookie(&stranger_token);

    // RED CASE 4: Stranger cannot read workspace roles (403 Forbidden)
    let (stranger_ws_read, _) = request(
        &ctx.app,
        Method::GET,
        &format!("/api/v1/workspaces/{org_id}/roles"),
        Some(&stranger_cookie),
        None,
    )
    .await?;
    anyhow::ensure!(
        stranger_ws_read == StatusCode::FORBIDDEN,
        "stranger cannot read workspace roles, expected 403, got {stranger_ws_read}"
    );

    // RED CASE 5: Stranger cannot create workspace roles (403 Forbidden)
    let (stranger_ws_create, _) = request(
        &ctx.app,
        Method::POST,
        &format!("/api/v1/workspaces/{org_id}/roles"),
        Some(&stranger_cookie),
        Some(json!({
            "name": "HackerRole",
            "permissions": {}
        })),
    )
    .await?;
    anyhow::ensure!(
        stranger_ws_create == StatusCode::FORBIDDEN,
        "stranger cannot create workspace roles, expected 403, got {stranger_ws_create}"
    );

    // =========================================================================
    // PART 3: Workspace Restricted Role Enforcement (Green & Red)
    // =========================================================================
    let support_user_id = Uuid::new_v4().to_string();
    let support_token = format!("support_{}", Uuid::new_v4().simple());

    sqlx::query(
        r#"INSERT INTO "User" (id, email, name, role, email_verified, created_at, updated_at)
           VALUES ($1, $2, 'Support User', 'user', true, $3, $3)"#,
    )
    .bind(&support_user_id)
    .bind(format!("support-{}@example.com", Uuid::new_v4().simple()))
    .bind(now)
    .execute(&ctx.state.biz_context.pool)
    .await?;

    sqlx::query(
        r#"INSERT INTO "Session" (id, user_id, session_token, expires_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $5)"#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&support_user_id)
    .bind(&support_token)
    .bind(now + chrono::Duration::hours(2))
    .bind(now)
    .execute(&ctx.state.biz_context.pool)
    .await?;

    // Add Support User to workspace with the SupportAgent role
    sqlx::query(
        r#"INSERT INTO "Member" (id, user_id, organization_id, role, role_id, created_at, updated_at)
           VALUES ($1, $2, $3, 'MEMBER', $4, $5, $5)"#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&support_user_id)
    .bind(org_id)
    .bind(ws_role_id)
    .bind(now)
    .execute(&ctx.state.biz_context.pool)
    .await?;

    let support_cookie = session_cookie(&support_token);

    // GREEN CASE 2: Support User CAN list workspace roles (roles:read is allowed)
    expect_status(
        request(
            &ctx.app,
            Method::GET,
            &format!("/api/v1/workspaces/{org_id}/roles"),
            Some(&support_cookie),
            None,
        )
        .await?,
        StatusCode::OK,
        "SupportAgent user reads workspace roles",
    )?;

    // RED CASE 6: Support User CANNOT create workspace roles (roles:create is false -> 403 Forbidden)
    let (support_create_role_status, _) = request(
        &ctx.app,
        Method::POST,
        &format!("/api/v1/workspaces/{org_id}/roles"),
        Some(&support_cookie),
        Some(json!({
            "name": "UnauthorizedRole",
            "permissions": {}
        })),
    )
    .await?;
    anyhow::ensure!(
        support_create_role_status == StatusCode::FORBIDDEN,
        "SupportAgent cannot create workspace roles, expected 403, got {support_create_role_status}"
    );

    // RED CASE 7: Support User CANNOT delete workspace roles (roles:delete is false -> 403 Forbidden)
    let (support_delete_role_status, _) = request(
        &ctx.app,
        Method::DELETE,
        &format!("/api/v1/workspaces/{org_id}/roles/{ws_role_id}"),
        Some(&support_cookie),
        None,
    )
    .await?;
    anyhow::ensure!(
        support_delete_role_status == StatusCode::FORBIDDEN,
        "SupportAgent cannot delete workspace roles, expected 403, got {support_delete_role_status}"
    );

    // =========================================================================
    // PART 4: Project Restricted Role Enforcement (Green & Red)
    // =========================================================================
    // Owner creates project
    let project = create_project(
        &ctx.app,
        &owner_cookie,
        format!("Enforcement Project {}", Uuid::new_v4().simple()),
        org_id,
        true,
    )
    .await?;
    let project_id = required_string(&project, "id", "enforcement project")?;

    // Owner creates custom project role "JuniorEditor"
    // Allowed: pages:read, pages:create, pages:edit.
    // Disallowed: pages:delete, pages:publish, roles:create, roles:delete.
    let create_proj_role_res = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/v1/projects/{project_id}/roles"),
            Some(&owner_cookie),
            Some(json!({
                "name": "JuniorEditor",
                "description": "Can create and edit pages, but cannot delete or publish",
                "is_default": false,
                "permissions": {
                    "pages": { "read": true, "create": true, "edit": true, "delete": false, "publish": false },
                    "branches": { "read": true },
                    "roles": { "read": true, "create": false, "edit": false, "delete": false }
                }
            })),
        )
        .await?,
        StatusCode::OK,
        "create JuniorEditor project role",
    )?;
    let proj_role_id =
        required_string(&create_proj_role_res["data"], "id", "junior editor role id")?;

    // Create user "Junior Editor"
    let editor_user_id = Uuid::new_v4().to_string();
    let editor_token = format!("editor_{}", Uuid::new_v4().simple());

    sqlx::query(
        r#"INSERT INTO "User" (id, email, name, role, email_verified, created_at, updated_at)
           VALUES ($1, $2, 'Junior Editor', 'user', true, $3, $3)"#,
    )
    .bind(&editor_user_id)
    .bind(format!("editor-{}@example.com", Uuid::new_v4().simple()))
    .bind(now)
    .execute(&ctx.state.biz_context.pool)
    .await?;

    sqlx::query(
        r#"INSERT INTO "Session" (id, user_id, session_token, expires_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $5)"#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&editor_user_id)
    .bind(&editor_token)
    .bind(now + chrono::Duration::hours(2))
    .bind(now)
    .execute(&ctx.state.biz_context.pool)
    .await?;

    // Add to Organization as Member
    sqlx::query(
        r#"INSERT INTO "Member" (id, user_id, organization_id, role, created_at, updated_at)
           VALUES ($1, $2, $3, 'MEMBER', $4, $4)"#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&editor_user_id)
    .bind(org_id)
    .bind(now)
    .execute(&ctx.state.biz_context.pool)
    .await?;

    // Add to Project as Member with role_id = JuniorEditor
    cms_db::authz::ProjectMemberQueries::create(
        &ctx.state.biz_context.pool,
        project_id,
        &editor_user_id,
        "member",
        Some(proj_role_id),
    )
    .await?;

    let editor_cookie = session_cookie(&editor_token);

    // GREEN CASE 3: JuniorEditor CAN create a draft page (pages:create is true)
    let languages = expect_status(
        request(
            &ctx.app,
            Method::GET,
            &format!("/api/app/projects/{project_id}/languages"),
            Some(&owner_cookie),
            None,
        )
        .await?,
        StatusCode::OK,
        "get project languages",
    )?;
    let english_id = languages["data"][0]["id"].as_str().unwrap();

    let create_page_res = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/pages"),
            Some(&editor_cookie),
            Some(json!({
                "title": "Getting Started",
                "slug": "getting-started",
                "kind": "PAGE",
                "languageId": english_id,
                "is_published": false
            })),
        )
        .await?,
        StatusCode::OK,
        "JuniorEditor creates draft page",
    )?;
    let page_id = required_string(&create_page_res["data"], "id", "created page id")?;

    // GREEN CASE 4: JuniorEditor CAN read the page
    expect_status(
        request(
            &ctx.app,
            Method::GET,
            &format!("/api/app/projects/{project_id}/pages/{page_id}"),
            Some(&editor_cookie),
            None,
        )
        .await?,
        StatusCode::OK,
        "JuniorEditor reads page",
    )?;

    // RED CASE 8: JuniorEditor CANNOT publish a page (pages:publish is false -> 403 Forbidden)
    let (publish_forbidden_status, _) = request(
        &ctx.app,
        Method::POST,
        &format!("/api/app/projects/{project_id}/pages"),
        Some(&editor_cookie),
        Some(json!({
            "title": "Secret Announcement",
            "slug": "secret-announcement",
            "kind": "PAGE",
            "languageId": english_id,
            "is_published": true
        })),
    )
    .await?;
    anyhow::ensure!(
        publish_forbidden_status == StatusCode::FORBIDDEN,
        "JuniorEditor cannot publish pages directly, expected 403 Forbidden, got {publish_forbidden_status}"
    );

    // RED CASE 9: JuniorEditor CANNOT delete the page (pages:delete is false -> 403 Forbidden)
    let (delete_page_status, _) = request(
        &ctx.app,
        Method::DELETE,
        &format!("/api/app/projects/{project_id}/pages/{page_id}"),
        Some(&editor_cookie),
        None,
    )
    .await?;
    anyhow::ensure!(
        delete_page_status == StatusCode::FORBIDDEN,
        "JuniorEditor cannot delete page, expected 403 Forbidden, got {delete_page_status}"
    );

    // RED CASE 10: JuniorEditor CANNOT create project roles (roles:create is false -> 403 Forbidden)
    let (editor_role_create_status, _) = request(
        &ctx.app,
        Method::POST,
        &format!("/api/v1/projects/{project_id}/roles"),
        Some(&editor_cookie),
        Some(json!({
            "name": "SuperAdmin",
            "permissions": {}
        })),
    )
    .await?;
    anyhow::ensure!(
        editor_role_create_status == StatusCode::FORBIDDEN,
        "JuniorEditor cannot create project roles, expected 403 Forbidden, got {editor_role_create_status}"
    );

    // RED CASE 11: JuniorEditor CANNOT delete project roles (roles:delete is false -> 403 Forbidden)
    let (editor_role_del_status, _) = request(
        &ctx.app,
        Method::DELETE,
        &format!("/api/v1/projects/{project_id}/roles/{proj_role_id}"),
        Some(&editor_cookie),
        None,
    )
    .await?;
    anyhow::ensure!(
        editor_role_del_status == StatusCode::FORBIDDEN,
        "JuniorEditor cannot delete project roles, expected 403 Forbidden, got {editor_role_del_status}"
    );

    // GREEN CASE 5: Owner CAN delete page (Owner has full bypass)
    expect_status(
        request(
            &ctx.app,
            Method::DELETE,
            &format!("/api/app/projects/{project_id}/pages/{page_id}"),
            Some(&owner_cookie),
            None,
        )
        .await?,
        StatusCode::OK,
        "Owner deletes page",
    )?;

    // =========================================================================
    // PART 5: Clean Up
    // =========================================================================
    sqlx::query(r#"DELETE FROM "User" WHERE id IN ($1, $2, $3)"#)
        .bind(&stranger_user_id)
        .bind(&support_user_id)
        .bind(&editor_user_id)
        .execute(&ctx.state.biz_context.pool)
        .await?;

    Ok(())
}
