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

#[test]
fn test_exhaustive_project_not_permissible_matrix() {
    let empty_ctx = ProjectSecurityContext {
        user_id: UserId::from("u1"),
        project_id: "p1".to_string(),
        org_id: OrgId::from("o1"),
        is_owner: false,
        role_id: Some("role-empty".to_string()),
        permissions: ProjectPermissions::empty(),
    };

    let all_resources = [
        ProjectResource::Pages,
        ProjectResource::Branches,
        ProjectResource::Deployments,
        ProjectResource::Domains,
        ProjectResource::Openapi,
        ProjectResource::Assets,
        ProjectResource::Addons,
        ProjectResource::Members,
        ProjectResource::Roles,
        ProjectResource::Analytics,
        ProjectResource::Comments,
        ProjectResource::DangerZone,
    ];

    // With empty permissions, every single resource and action is strictly NOT permissible
    for res in all_resources {
        for act in res.supported_actions() {
            assert!(!empty_ctx.can(res, *act), "Resource {:?} action {:?} must NOT be permissible", res, act);
            assert!(empty_ctx.require(res, *act).is_err(), "Require {:?} action {:?} must error with Forbidden", res, act);
        }
    }

    // With only a single permission (Pages:Read), everything else must remain strictly NOT permissible
    let single_perm_ctx = ProjectSecurityContext {
        user_id: UserId::from("u1"),
        project_id: "p1".to_string(),
        org_id: OrgId::from("o1"),
        is_owner: false,
        role_id: Some("role-pages-read-only".to_string()),
        permissions: ProjectPermissions::normalize(serde_json::json!({
            "pages": { "read": true }
        })),
    };

    assert!(single_perm_ctx.can(ProjectResource::Pages, Action::Read));
    assert!(single_perm_ctx.require(ProjectResource::Pages, Action::Read).is_ok());

    // Pages write/delete/publish must NOT be permissible
    for forbidden_act in [Action::Create, Action::Edit, Action::Delete, Action::Publish] {
        assert!(!single_perm_ctx.can(ProjectResource::Pages, forbidden_act));
        assert!(single_perm_ctx.require(ProjectResource::Pages, forbidden_act).is_err());
    }

    // All other resources must NOT be permissible
    for res in all_resources {
        if res == ProjectResource::Pages {
            continue;
        }
        for act in res.supported_actions() {
            assert!(!single_perm_ctx.can(res, *act));
            assert!(single_perm_ctx.require(res, *act).is_err());
        }
    }
}

#[test]
fn test_exhaustive_workspace_not_permissible_matrix() {
    let empty_ws_ctx = cms_authz::WorkspaceSecurityContext {
        user_id: UserId::from("u1"),
        org_id: OrgId::from("o1"),
        is_owner: false,
        role_id: Some("role-empty".to_string()),
        permissions: cms_entity::authz::WorkspacePermissions::empty(),
    };

    let all_ws_resources = [
        WorkspaceResource::Projects,
        WorkspaceResource::Members,
        WorkspaceResource::Roles,
        WorkspaceResource::ApiKeys,
        WorkspaceResource::AuditLogs,
        WorkspaceResource::Settings,
        WorkspaceResource::DangerZone,
    ];

    // With empty permissions, every workspace resource and action is strictly NOT permissible
    for res in all_ws_resources {
        for act in res.supported_actions() {
            assert!(!empty_ws_ctx.can(res, *act), "Workspace resource {:?} action {:?} must NOT be permissible", res, act);
            assert!(empty_ws_ctx.require(res, *act).is_err(), "Require {:?} action {:?} must return Forbidden", res, act);
        }
    }

    // With only Members:Read, all other actions and resources are NOT permissible
    let read_only_members = cms_authz::WorkspaceSecurityContext {
        user_id: UserId::from("u1"),
        org_id: OrgId::from("o1"),
        is_owner: false,
        role_id: Some("role-members-read".to_string()),
        permissions: cms_entity::authz::WorkspacePermissions::normalize(serde_json::json!({
            "members": { "read": true }
        })),
    };

    assert!(read_only_members.can(WorkspaceResource::Members, Action::Read));
    assert!(read_only_members.require(WorkspaceResource::Members, Action::Read).is_ok());

    assert!(!read_only_members.can(WorkspaceResource::Members, Action::Create));
    assert!(!read_only_members.can(WorkspaceResource::Members, Action::Edit));
    assert!(!read_only_members.can(WorkspaceResource::Members, Action::Delete));

    for res in all_ws_resources {
        if res == WorkspaceResource::Members {
            continue;
        }
        for act in res.supported_actions() {
            assert!(!read_only_members.can(res, *act));
            assert!(read_only_members.require(res, *act).is_err());
        }
    }
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
