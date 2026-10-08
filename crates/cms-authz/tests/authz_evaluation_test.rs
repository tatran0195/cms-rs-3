use cms_authz::{Authz, NoopAuthz, ProjectSecurityContext};
use cms_entity::authz::{Action, ProjectPermissions, ProjectResource, WorkspaceResource};
use cms_entity::id::{OrgId, UserId};

#[tokio::test]
async fn test_noop_authz_passes_all_checks() {
    let authz = NoopAuthz;
    assert!(authz.require_project_permission("user1", "proj1", ProjectResource::Pages, Action::Publish).await.is_ok());
    assert!(authz.require_workspace_permission("user1", "org1", WorkspaceResource::Settings, Action::Edit).await.is_ok());

    let ws_ctx = authz.get_workspace_context("user1", "org1").await.unwrap();
    assert!(ws_ctx.is_owner);
    assert!(ws_ctx.can(WorkspaceResource::Projects, Action::Create));

    let proj_ctx = authz.get_project_context("user1", "proj1").await.unwrap();
    assert!(proj_ctx.is_owner);
    assert!(proj_ctx.can(ProjectResource::Pages, Action::Publish));
}

#[test]
fn test_security_context_owner_bypass() {
    let ctx = ProjectSecurityContext {
        user_id: UserId::from("u1"),
        project_id: "p1".to_string(),
        org_id: OrgId::from("o1"),
        is_owner: true,
        role_id: None,
        permissions: ProjectPermissions::empty(), // even with empty matrix, owner passes
    };

    assert!(ctx.can(ProjectResource::Pages, Action::Publish));
    assert!(ctx.can(ProjectResource::Branches, Action::Delete));
    assert!(ctx.require(ProjectResource::Pages, Action::Publish).is_ok());
}

#[test]
fn test_security_context_matrix_evaluation() {
    let perms = ProjectPermissions::normalize(serde_json::json!({
        "pages": { "read": true, "edit": true },
        "branches": { "read": true }
    }));

    let ctx = ProjectSecurityContext {
        user_id: UserId::from("u1"),
        project_id: "p1".to_string(),
        org_id: OrgId::from("o1"),
        is_owner: false,
        role_id: Some("role-123".to_string()),
        permissions: perms,
    };

    assert!(ctx.can(ProjectResource::Pages, Action::Read));
    assert!(ctx.can(ProjectResource::Pages, Action::Edit));
    assert!(!ctx.can(ProjectResource::Pages, Action::Publish));
    assert!(ctx.require(ProjectResource::Pages, Action::Publish).is_err());
}

#[tokio::test]
async fn test_production_authz_live_db_evaluation() {
    let database_url = match std::env::var("CMS_E2E_DATABASE_URL") {
        Ok(url) if !url.is_empty() => url,
        _ => return, // Skip if no live DB is configured
    };

    let pool = cms_db::create_pool(&database_url)
        .await
        .expect("connect to test db");

    let authz = cms_authz::ProductionAuthz::new(pool.clone());
    let now = chrono::Utc::now();
    let org_id = format!("org-{}", uuid::Uuid::new_v4().simple());
    let user_id = format!("usr-{}", uuid::Uuid::new_v4().simple());
    let project_id = format!("prj-{}", uuid::Uuid::new_v4().simple());

    // 1. Create Organization
    cms_db::sqlx::query(
        r#"INSERT INTO "Organization" (id, name, slug, created_at, updated_at)
           VALUES ($1, 'Authz Test Org', $2, $3, $3)"#,
    )
    .bind(&org_id)
    .bind(format!("slug-{}", uuid::Uuid::new_v4().simple()))
    .bind(now)
    .execute(&pool)
    .await
    .unwrap();

    // 2. Create User
    cms_db::sqlx::query(
        r#"INSERT INTO "User" (id, email, name, role, email_verified, created_at, updated_at)
           VALUES ($1, $2, 'Authz Member', 'user', true, $3, $3)"#,
    )
    .bind(&user_id)
    .bind(format!("{}@example.com", uuid::Uuid::new_v4().simple()))
    .bind(now)
    .execute(&pool)
    .await
    .unwrap();

    // 3. Create Custom Workspace Role (allowed: projects create/read, forbidden: settings edit)
    let ws_role = cms_db::authz::OrgRoleQueries::create(
        &pool,
        &org_id,
        "Dev Lead",
        Some("Lead developer role"),
        false,
        serde_json::json!({
            "projects": { "create": true, "read": true },
            "members": { "read": true }
        }),
    )
    .await
    .unwrap();

    // 4. Insert Member with custom role
    cms_db::sqlx::query(
        r#"INSERT INTO "Member" (id, user_id, organization_id, role, role_id, created_at, updated_at)
           VALUES ($1, $2, $3, 'MEMBER', $4, $5, $5)"#,
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(&user_id)
    .bind(&org_id)
    .bind(&ws_role.id)
    .bind(now)
    .execute(&pool)
    .await
    .unwrap();

    // 5. Test Workspace Security Context & Permission Evaluation
    let ws_ctx = authz.get_workspace_context(&user_id, &org_id).await.unwrap();
    assert!(!ws_ctx.is_owner, "Member should not be evaluated as owner");
    assert_eq!(ws_ctx.role_id, Some(ws_role.id.clone()));
    assert!(ws_ctx.can(WorkspaceResource::Projects, Action::Create));
    assert!(ws_ctx.can(WorkspaceResource::Projects, Action::Read));
    assert!(!ws_ctx.can(WorkspaceResource::Settings, Action::Edit));

    assert!(authz.require_workspace_permission(&user_id, &org_id, WorkspaceResource::Projects, Action::Create).await.is_ok());
    assert!(authz.require_workspace_permission(&user_id, &org_id, WorkspaceResource::Settings, Action::Edit).await.is_err());

    // 6. Create Project
    cms_db::sqlx::query(
        r#"INSERT INTO "Project" (id, name, slug, organization_id, is_public, created_at, updated_at)
           VALUES ($1, 'Authz Project', $2, $3, true, $4, $4)"#,
    )
    .bind(&project_id)
    .bind(format!("pslug-{}", uuid::Uuid::new_v4().simple()))
    .bind(&org_id)
    .bind(now)
    .execute(&pool)
    .await
    .unwrap();

    // 7. Create Custom Project Role (allowed: pages create/read/edit, forbidden: pages publish)
    let proj_role = cms_db::authz::ProjectRoleQueries::create(
        &pool,
        &project_id,
        "Content Editor",
        Some("Editor who cannot publish"),
        false,
        serde_json::json!({
            "pages": { "create": true, "read": true, "edit": true },
            "branches": { "read": true }
        }),
    )
    .await
    .unwrap();

    // 8. Assign ProjectMember
    cms_db::authz::ProjectMemberQueries::create(
        &pool,
        &project_id,
        &user_id,
        "member",
        Some(&proj_role.id),
    )
    .await
    .unwrap();

    // 9. Test Project Security Context & Permission Evaluation
    let proj_ctx = authz.get_project_context(&user_id, &project_id).await.unwrap();
    assert!(!proj_ctx.is_owner, "Project member is not owner");
    assert_eq!(proj_ctx.role_id, Some(proj_role.id.clone()));
    assert!(proj_ctx.can(ProjectResource::Pages, Action::Create));
    assert!(proj_ctx.can(ProjectResource::Pages, Action::Read));
    assert!(proj_ctx.can(ProjectResource::Pages, Action::Edit));
    assert!(!proj_ctx.can(ProjectResource::Pages, Action::Publish));
    assert!(!proj_ctx.can(ProjectResource::DangerZone, Action::Delete));

    assert!(authz.require_project_permission(&user_id, &project_id, ProjectResource::Pages, Action::Edit).await.is_ok());
    let publish_res = authz.require_project_permission(&user_id, &project_id, ProjectResource::Pages, Action::Publish).await;
    assert!(publish_res.is_err());

    // 10. Clean up
    let _ = cms_db::sqlx::query(r#"DELETE FROM "ProjectMember" WHERE project_id = $1"#).bind(&project_id).execute(&pool).await;
    let _ = cms_db::sqlx::query(r#"DELETE FROM "ProjectRole" WHERE project_id = $1"#).bind(&project_id).execute(&pool).await;
    let _ = cms_db::sqlx::query(r#"DELETE FROM "Project" WHERE id = $1"#).bind(&project_id).execute(&pool).await;
    let _ = cms_db::sqlx::query(r#"DELETE FROM "Member" WHERE organization_id = $1"#).bind(&org_id).execute(&pool).await;
    let _ = cms_db::sqlx::query(r#"DELETE FROM "OrganizationRole" WHERE organization_id = $1"#).bind(&org_id).execute(&pool).await;
    let _ = cms_db::sqlx::query(r#"DELETE FROM "Organization" WHERE id = $1"#).bind(&org_id).execute(&pool).await;
    let _ = cms_db::sqlx::query(r#"DELETE FROM "User" WHERE id = $1"#).bind(&user_id).execute(&pool).await;
}
