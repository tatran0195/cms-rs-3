use cms_authz::{
    AuthzBackend, AuthzContext, Relation, Subject, TestAuthzBackend, SYSTEM_WORKSPACE_ID,
};
use uuid::Uuid;

#[tokio::test]
async fn test_rebac_implications_and_cross_inheritance() {
    let backend = TestAuthzBackend::new();
    let user_id = Uuid::new_v4();
    let project_id = Uuid::new_v4();
    let ctx = AuthzContext::new(user_id, "user".to_string(), false);

    // 1. Initial state: No tuple exists -> access denied
    let viewer_allowed = backend
        .check(&ctx, Relation::Viewer, "project", project_id)
        .await
        .expect("check should succeed");
    assert!(!viewer_allowed, "unassigned user must be denied");

    // 2. Write Editor tuple -> Implies Viewer access
    backend
        .write_tuple(
            &ctx,
            "project",
            project_id,
            Relation::Editor,
            Subject::User(user_id),
            None,
        )
        .await
        .expect("write_tuple should succeed");

    assert!(
        backend
            .check(&ctx, Relation::Viewer, "project", project_id)
            .await
            .unwrap(),
        "Editor must imply Viewer"
    );
    assert!(
        backend
            .check(&ctx, Relation::Editor, "project", project_id)
            .await
            .unwrap(),
        "Editor grant must hold Editor"
    );
    assert!(
        !backend
            .check(&ctx, Relation::Admin, "project", project_id)
            .await
            .unwrap(),
        "Editor must NOT imply Admin"
    );

    // 3. Test list_accessible
    let accessible = backend
        .list_accessible(&ctx, "project", Relation::Viewer)
        .await
        .unwrap();
    assert_eq!(accessible, vec![project_id]);

    // 4. Test cross-object inheritance: Workspace Admin gains project access automatically
    let admin_id = Uuid::new_v4();
    let admin_ctx = AuthzContext::new(admin_id, "admin".to_string(), false);

    assert!(
        !backend
            .check(&admin_ctx, Relation::Viewer, "project", project_id)
            .await
            .unwrap(),
        "Before workspace grant, admin has no project access"
    );

    // Grant Admin on workspace
    backend
        .write_tuple(
            &admin_ctx,
            "workspace",
            SYSTEM_WORKSPACE_ID,
            Relation::Admin,
            Subject::User(admin_id),
            None,
        )
        .await
        .unwrap();

    assert!(
        backend
            .check(&admin_ctx, Relation::Viewer, "project", project_id)
            .await
            .unwrap(),
        "Workspace Admin must inherit Viewer on all projects"
    );

    // 5. Revocation test
    backend
        .revoke_specific(
            &ctx,
            "project",
            project_id,
            Relation::Editor,
            Subject::User(user_id),
        )
        .await
        .unwrap();

    assert!(
        !backend
            .check(&ctx, Relation::Viewer, "project", project_id)
            .await
            .unwrap(),
        "Revoked tuple must deny access"
    );
}

#[tokio::test]
async fn test_bypass_short_circuits() {
    let backend = TestAuthzBackend::new();
    let bypass_ctx = AuthzContext::new(Uuid::new_v4(), "super_admin".to_string(), true);
    let project_id = Uuid::new_v4();

    assert!(
        backend
            .check(&bypass_ctx, Relation::Owner, "project", project_id)
            .await
            .unwrap(),
        "Bypass context must always return true"
    );
}
