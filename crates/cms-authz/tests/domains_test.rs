use std::sync::Arc;
use cms_authz::{
    build_platform_checker, build_project_checker, AuthUser, EvaluationSession,
    PlatformAction, ProjectAction, ProjectRelation, ProjectRelationship, ProjectTarget,
    FactLoadResult, FactRegistry, FactSource, async_trait,
};

struct MockProjectRelationshipSource;

#[async_trait]
impl FactSource<ProjectRelationship> for MockProjectRelationshipSource {
    async fn load_many(&self, keys: &[ProjectRelationship]) -> Vec<FactLoadResult<bool>> {
        keys.iter()
            .map(|key| {
                let is_member = key.subject_id == "editor-user" && key.resource_id == "proj-1" && key.relation == ProjectRelation::Editor;
                FactLoadResult::Found(is_member)
            })
            .collect()
    }
}

#[tokio::test]
async fn test_platform_admin_policy() {
    let checker = build_platform_checker();
    let session = EvaluationSession::empty();

    let admin = AuthUser {
        id: "admin-1".to_string(),
        email: "admin@company.com".to_string(),
        is_admin: true,
    };
    let normal_user = AuthUser {
        id: "user-1".to_string(),
        email: "user@company.com".to_string(),
        is_admin: false,
    };

    // Admin allowed to manage users
    assert!(checker.bind(&session, &admin, &PlatformAction::ManageUsers, &()).authorize(&()).await.is_ok());

    // Normal user forbidden from managing users
    assert!(checker.bind(&session, &normal_user, &PlatformAction::ManageUsers, &()).authorize(&()).await.is_err());

    // Normal user allowed to create project
    assert!(checker.bind(&session, &normal_user, &PlatformAction::CreateProject, &()).authorize(&()).await.is_ok());
}

#[tokio::test]
async fn test_project_domain_policies() {
    let checker = build_project_checker();
    let registry = FactRegistry::builder()
        .with_arc::<ProjectRelationship>(Arc::new(MockProjectRelationshipSource))
        .build();
    let session = registry.session();

    let admin = AuthUser {
        id: "admin-1".to_string(),
        email: "admin@company.com".to_string(),
        is_admin: true,
    };
    let editor = AuthUser {
        id: "editor-user".to_string(),
        email: "editor@company.com".to_string(),
        is_admin: false,
    };
    let stranger = AuthUser {
        id: "stranger".to_string(),
        email: "stranger@company.com".to_string(),
        is_admin: false,
    };

    let target = ProjectTarget {
        id: "proj-1".to_string(),
        is_public: false,
        owner_id: Some("owner-1".to_string()),
    };

    // Admin override grants view and delete
    assert!(checker.bind(&session, &admin, &ProjectAction::Delete, &()).authorize(&target).await.is_ok());

    // Editor grants Edit but not Delete
    assert!(checker.bind(&session, &editor, &ProjectAction::Edit, &()).authorize(&target).await.is_ok());
    assert!(checker.bind(&session, &editor, &ProjectAction::Delete, &()).authorize(&target).await.is_err());

    // Stranger forbidden on private project
    assert!(checker.bind(&session, &stranger, &ProjectAction::View, &()).authorize(&target).await.is_err());

    // Stranger allowed to view public project
    let public_target = ProjectTarget {
        id: "proj-public".to_string(),
        is_public: true,
        owner_id: Some("owner-1".to_string()),
    };
    assert!(checker.bind(&session, &stranger, &ProjectAction::View, &()).authorize(&public_target).await.is_ok());
}
