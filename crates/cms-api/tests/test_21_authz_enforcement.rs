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

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_21_not_permissible_boundaries_and_isolation() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let owner_cookie = ctx.user_cookie();
    let org_a_id = &ctx.seed.organization_id;
    let now = chrono::Utc::now();

    // =========================================================================
    // SECTION 1: Anonymous & Unauthenticated "Not Permissible" (401 Unauthorized)
    // =========================================================================

    // 1.1: Missing authentication on workspace roles endpoints
    let (anon_ws_roles_get, _) = request(
        &ctx.app,
        Method::GET,
        &format!("/api/v1/workspaces/{org_a_id}/roles"),
        None,
        None,
    )
    .await?;
    anyhow::ensure!(
        anon_ws_roles_get == StatusCode::UNAUTHORIZED,
        "Anon GET workspace roles must return 401 Unauthorized, got {anon_ws_roles_get}"
    );

    let (anon_ws_roles_post, _) = request(
        &ctx.app,
        Method::POST,
        &format!("/api/v1/workspaces/{org_a_id}/roles"),
        None,
        Some(json!({ "name": "AnonRole", "permissions": {} })),
    )
    .await?;
    anyhow::ensure!(
        anon_ws_roles_post == StatusCode::UNAUTHORIZED,
        "Anon POST workspace roles must return 401 Unauthorized, got {anon_ws_roles_post}"
    );

    // 1.2: Bogus / Forged session token
    let bogus_cookie = session_cookie("completely_invalid_session_token_xyz");
    let (bogus_ws_get, _) = request(
        &ctx.app,
        Method::GET,
        &format!("/api/v1/workspaces/{org_a_id}/roles"),
        Some(&bogus_cookie),
        None,
    )
    .await?;
    anyhow::ensure!(
        bogus_ws_get == StatusCode::UNAUTHORIZED,
        "Bogus session GET workspace roles must return 401 Unauthorized, got {bogus_ws_get}"
    );

    // =========================================================================
    // SECTION 2: Cross-Tenant Boundary "Not Permissible" Isolation
    // =========================================================================
    let org_b_id = Uuid::new_v4().to_string();
    sqlx::query(
        r#"INSERT INTO "Organization" (id, name, slug, created_at, updated_at)
           VALUES ($1, 'Tenant Org B', $2, $3, $3)"#,
    )
    .bind(&org_b_id)
    .bind(format!("tenant-b-{}", Uuid::new_v4().simple()))
    .bind(now)
    .execute(&ctx.state.biz_context.pool)
    .await?;

    let role_b = cms_db::authz::OrgRoleQueries::create(
        &ctx.state.biz_context.pool,
        &org_b_id,
        "OrgBSecretRole",
        Some("Exclusively for tenant B"),
        false,
        json!({ "projects": { "read": true } }),
    )
    .await?;

    // 2.1: Owner of Org A attempts to list roles of Org B -> 403 Forbidden (not a member of Org B)
    let (cross_tenant_list, _) = request(
        &ctx.app,
        Method::GET,
        &format!("/api/v1/workspaces/{org_b_id}/roles"),
        Some(&owner_cookie),
        None,
    )
    .await?;
    anyhow::ensure!(
        cross_tenant_list == StatusCode::FORBIDDEN,
        "Owner A cannot list Org B's roles, expected 403 Forbidden, got {cross_tenant_list}"
    );

    // 2.2: Cross-tenant ID injection: Owner A queries Org B's role ID under Org A's path -> 404 Not Found
    let (cross_tenant_get, _) = request(
        &ctx.app,
        Method::GET,
        &format!("/api/v1/workspaces/{org_a_id}/roles/{}", role_b.id),
        Some(&owner_cookie),
        None,
    )
    .await?;
    anyhow::ensure!(
        cross_tenant_get == StatusCode::NOT_FOUND,
        "Querying Org B's role through Org A's endpoint must return 404 Not Found, got {cross_tenant_get}"
    );

    // 2.3: Cross-tenant update: Owner A tries to modify Org B's role under Org A's path -> 404 Not Found
    let (cross_tenant_put, _) = request(
        &ctx.app,
        Method::PUT,
        &format!("/api/v1/workspaces/{org_a_id}/roles/{}", role_b.id),
        Some(&owner_cookie),
        Some(json!({ "name": "HackedOrgBRole" })),
    )
    .await?;
    anyhow::ensure!(
        cross_tenant_put == StatusCode::NOT_FOUND,
        "Modifying Org B's role through Org A's endpoint must return 404 Not Found, got {cross_tenant_put}"
    );

    // 2.4: Cross-tenant delete: Owner A tries to delete Org B's role under Org A's path -> 404 Not Found
    let (cross_tenant_del, _) = request(
        &ctx.app,
        Method::DELETE,
        &format!("/api/v1/workspaces/{org_a_id}/roles/{}", role_b.id),
        Some(&owner_cookie),
        None,
    )
    .await?;
    anyhow::ensure!(
        cross_tenant_del == StatusCode::NOT_FOUND,
        "Deleting Org B's role through Org A's endpoint must return 404 Not Found, got {cross_tenant_del}"
    );

    // =========================================================================
    // SECTION 3: Cross-Project Boundary "Not Permissible" Isolation
    // =========================================================================
    let project_1 = create_project(
        &ctx.app,
        &owner_cookie,
        format!("P1 {}", Uuid::new_v4().simple()),
        org_a_id,
        true,
    )
    .await?;
    let project_1_id = required_string(&project_1, "id", "proj1")?;
    let project_2 = create_project(
        &ctx.app,
        &owner_cookie,
        format!("P2 {}", Uuid::new_v4().simple()),
        org_a_id,
        true,
    )
    .await?;
    let project_2_id = required_string(&project_2, "id", "proj2")?;

    let role_p2 = cms_db::authz::ProjectRoleQueries::create(
        &ctx.state.biz_context.pool,
        project_2_id,
        "P2Role",
        Some("Role for Project 2 only"),
        false,
        json!({ "pages": { "read": true } }),
    )
    .await?;

    // 3.1: Cross-project get: Querying P2's role through P1's endpoint -> 404 Not Found
    let (cross_proj_get, _) = request(
        &ctx.app,
        Method::GET,
        &format!("/api/v1/projects/{project_1_id}/roles/{}", role_p2.id),
        Some(&owner_cookie),
        None,
    )
    .await?;
    anyhow::ensure!(
        cross_proj_get == StatusCode::NOT_FOUND,
        "Querying P2's role through P1 endpoint must return 404 Not Found, got {cross_proj_get}"
    );

    // 3.2: Cross-project update: Modifying P2's role through P1's endpoint -> 404 Not Found
    let (cross_proj_put, _) = request(
        &ctx.app,
        Method::PUT,
        &format!("/api/v1/projects/{project_1_id}/roles/{}", role_p2.id),
        Some(&owner_cookie),
        Some(json!({ "name": "HackedP2Role" })),
    )
    .await?;
    anyhow::ensure!(
        cross_proj_put == StatusCode::NOT_FOUND,
        "Modifying P2's role through P1 endpoint must return 404 Not Found, got {cross_proj_put}"
    );

    // 3.3: Cross-project delete: Deleting P2's role through P1's endpoint -> 404 Not Found
    let (cross_proj_del, _) = request(
        &ctx.app,
        Method::DELETE,
        &format!("/api/v1/projects/{project_1_id}/roles/{}", role_p2.id),
        Some(&owner_cookie),
        None,
    )
    .await?;
    anyhow::ensure!(
        cross_proj_del == StatusCode::NOT_FOUND,
        "Deleting P2's role through P1 endpoint must return 404 Not Found, got {cross_proj_del}"
    );

    // =========================================================================
    // SECTION 4: Zero-Permission Project Role "Not Permissible" Enforcements
    // =========================================================================
    let zero_role_res = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/v1/projects/{project_1_id}/roles"),
            Some(&owner_cookie),
            Some(json!({
                "name": "ZeroAccessRole",
                "description": "Explicitly zero permissions granted",
                "is_default": false,
                "permissions": {
                    "pages": { "read": false, "create": false, "edit": false, "delete": false, "publish": false },
                    "branches": { "read": false },
                    "roles": { "read": false, "create": false, "edit": false, "delete": false },
                    "danger_zone": { "read": false, "delete": false }
                }
            })),
        )
        .await?,
        StatusCode::OK,
        "create zero access project role",
    )?;
    let zero_role_id = required_string(&zero_role_res["data"], "id", "zero role id")?;

    let zero_user_id = Uuid::new_v4().to_string();
    let zero_token = format!("zero_{}", Uuid::new_v4().simple());

    sqlx::query(
        r#"INSERT INTO "User" (id, email, name, role, email_verified, created_at, updated_at)
           VALUES ($1, $2, 'Zero Access User', 'user', true, $3, $3)"#,
    )
    .bind(&zero_user_id)
    .bind(format!("zero-{}@example.com", Uuid::new_v4().simple()))
    .bind(now)
    .execute(&ctx.state.biz_context.pool)
    .await?;

    sqlx::query(
        r#"INSERT INTO "Session" (id, user_id, session_token, expires_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $5)"#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&zero_user_id)
    .bind(&zero_token)
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
    .bind(&zero_user_id)
    .bind(org_a_id)
    .bind(now)
    .execute(&ctx.state.biz_context.pool)
    .await?;

    // Add to Project 1 as member with ZeroAccessRole
    cms_db::authz::ProjectMemberQueries::create(
        &ctx.state.biz_context.pool,
        project_1_id,
        &zero_user_id,
        "member",
        Some(zero_role_id),
    )
    .await?;

    let zero_cookie = session_cookie(&zero_token);

    // 4.1: zero_user CANNOT list pages -> 403 Forbidden
    let (zero_pages_get, _) = request(
        &ctx.app,
        Method::GET,
        &format!("/api/app/projects/{project_1_id}/pages"),
        Some(&zero_cookie),
        None,
    )
    .await?;
    anyhow::ensure!(
        zero_pages_get == StatusCode::FORBIDDEN,
        "Zero-perm user listing pages must return 403 Forbidden, got {zero_pages_get}"
    );

    // 4.2: zero_user CANNOT list roles -> 403 Forbidden
    let (zero_roles_get, _) = request(
        &ctx.app,
        Method::GET,
        &format!("/api/v1/projects/{project_1_id}/roles"),
        Some(&zero_cookie),
        None,
    )
    .await?;
    anyhow::ensure!(
        zero_roles_get == StatusCode::FORBIDDEN,
        "Zero-perm user listing roles must return 403 Forbidden, got {zero_roles_get}"
    );

    // 4.3: zero_user CANNOT create roles -> 403 Forbidden
    let (zero_roles_create, _) = request(
        &ctx.app,
        Method::POST,
        &format!("/api/v1/projects/{project_1_id}/roles"),
        Some(&zero_cookie),
        Some(json!({ "name": "ElevateMe", "permissions": {} })),
    )
    .await?;
    anyhow::ensure!(
        zero_roles_create == StatusCode::FORBIDDEN,
        "Zero-perm user creating roles must return 403 Forbidden, got {zero_roles_create}"
    );

    // 4.4: zero_user CANNOT modify own role -> 403 Forbidden
    let (zero_roles_put, _) = request(
        &ctx.app,
        Method::PUT,
        &format!("/api/v1/projects/{project_1_id}/roles/{zero_role_id}"),
        Some(&zero_cookie),
        Some(json!({ "name": "PrivilegeEscalation" })),
    )
    .await?;
    anyhow::ensure!(
        zero_roles_put == StatusCode::FORBIDDEN,
        "Zero-perm user mutating roles must return 403 Forbidden, got {zero_roles_put}"
    );

    // 4.5: zero_user CANNOT delete own role -> 403 Forbidden
    let (zero_roles_del, _) = request(
        &ctx.app,
        Method::DELETE,
        &format!("/api/v1/projects/{project_1_id}/roles/{zero_role_id}"),
        Some(&zero_cookie),
        None,
    )
    .await?;
    anyhow::ensure!(
        zero_roles_del == StatusCode::FORBIDDEN,
        "Zero-perm user deleting roles must return 403 Forbidden, got {zero_roles_del}"
    );

    // 4.6: zero_user CANNOT delete the project (danger_zone:delete is not permissible) -> 403 Forbidden
    let (zero_project_del, _) = request(
        &ctx.app,
        Method::DELETE,
        &format!("/api/app/projects/{project_1_id}"),
        Some(&zero_cookie),
        None,
    )
    .await?;
    anyhow::ensure!(
        zero_project_del == StatusCode::FORBIDDEN,
        "Zero-perm user deleting project must return 403 Forbidden, got {zero_project_del}"
    );

    // Clean up
    let _ = sqlx::query(r#"DELETE FROM "User" WHERE id = $1"#)
        .bind(&zero_user_id)
        .execute(&ctx.state.biz_context.pool)
        .await;
    let _ = sqlx::query(r#"DELETE FROM "Organization" WHERE id = $1"#)
        .bind(&org_b_id)
        .execute(&ctx.state.biz_context.pool)
        .await;

    Ok(())
}

