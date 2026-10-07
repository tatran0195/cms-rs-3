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
