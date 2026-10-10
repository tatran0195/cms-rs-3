//! Project authorization domain, policies, and database FactSource.

use std::fmt;
use async_trait::async_trait;
use sqlx::PgPool;

use crate::{
    builder::PolicyBuilder,
    checker::PermissionChecker,
    combinators::PolicyExt,
    facts::{FactLoadError, FactLoadResult, FactSource},
    policies::RebacPolicy,
    policy::{Policy, PolicyDomain},
    RelationshipQuery,
};

use super::platform::AuthUser;

/// Policy domain governing project-level access control.
pub struct ProjectDomain;

/// Actions applicable to projects.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ProjectAction {
    /// View project details, metadata, and contents.
    View,
    /// Edit project contents and documentation.
    Edit,
    /// Publish project releases or deployments.
    Publish,
    /// Delete project permanently.
    Delete,
    /// Manage project team members and collaborators.
    ManageMembers,
    /// Manage project settings, domains, and integrations.
    ManageSettings,
}

/// Project resource snapshot passed for evaluation.
#[derive(Debug, Clone)]
pub struct ProjectTarget {
    /// Project identifier.
    pub id: String,
    /// Whether project is public.
    pub is_public: bool,
    /// Project owner user ID, if set.
    pub owner_id: Option<String>,
}

impl PolicyDomain for ProjectDomain {
    type Subject = AuthUser;
    type Action = ProjectAction;
    type Resource = ProjectTarget;
    type Context = ();
}

/// Relationship roles for ReBAC evaluation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ProjectRelation {
    /// Project owner role.
    Owner,
    /// Project editor / contributor role.
    Editor,
    /// Project viewer / reader role.
    Viewer,
}

impl fmt::Display for ProjectRelation {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Owner => f.write_str("owner"),
            Self::Editor => f.write_str("editor"),
            Self::Viewer => f.write_str("viewer"),
        }
    }
}

/// Query key for project relationships.
pub type ProjectRelationship = RelationshipQuery<String, String, ProjectRelation>;

/// Database-backed fact source loading user project relationships from PostgreSQL.
pub struct DbProjectRelationshipSource {
    pool: PgPool,
}

impl DbProjectRelationshipSource {
    /// Creates a new relationship source backed by the given connection pool.
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl FactSource<ProjectRelationship> for DbProjectRelationshipSource {
    async fn load_many(&self, keys: &[ProjectRelationship]) -> Vec<FactLoadResult<bool>> {
        if keys.is_empty() {
            return Vec::new();
        }

        let mut results = Vec::with_capacity(keys.len());
        for key in keys {
            let role_opt: Result<Option<String>, _> = sqlx::query_scalar(
                r#"
                SELECT pm.role::text
                FROM "ProjectMember" pm
                WHERE pm.project_id = $1 AND pm.user_id = $2
                LIMIT 1
                "#,
            )
            .bind(&key.resource_id)
            .bind(&key.subject_id)
            .fetch_optional(&self.pool)
            .await;

            match role_opt {
                Ok(Some(role)) => {
                    let has_relation = match key.relation {
                        ProjectRelation::Owner => role.eq_ignore_ascii_case("owner"),
                        ProjectRelation::Editor => {
                            role.eq_ignore_ascii_case("owner")
                                || role.eq_ignore_ascii_case("admin")
                                || role.eq_ignore_ascii_case("member")
                        }
                        ProjectRelation::Viewer => true,
                    };
                    results.push(FactLoadResult::Found(has_relation));
                }
                Ok(None) => results.push(FactLoadResult::Found(false)),
                Err(err) => results.push(FactLoadResult::Error(FactLoadError::backend(err))),
            }
        }
        results
    }
}

/// Policy granting all project actions to global platform administrators.
pub fn admin_override_policy() -> Box<dyn Policy<ProjectDomain>> {
    PolicyBuilder::<ProjectDomain>::new("AdminOverridePolicy")
        .subjects(|user: &AuthUser| user.is_admin)
        .build()
}

/// Policy granting full access to the project's owner.
pub fn project_owner_policy() -> Box<dyn Policy<ProjectDomain>> {
    PolicyBuilder::<ProjectDomain>::new("ProjectOwnerPolicy")
        .when(|user, _action, target, _ctx| {
            target.owner_id.as_deref() == Some(user.id.as_str())
        })
        .build()
}

/// Policy allowing view action on public projects.
pub fn public_project_view_policy() -> Box<dyn Policy<ProjectDomain>> {
    PolicyBuilder::<ProjectDomain>::new("PublicProjectViewPolicy")
        .when(|_user, action, target, _ctx| {
            target.is_public && matches!(action, ProjectAction::View)
        })
        .build()
}

/// Policy checking Owner relationship in the evaluation session.
pub fn project_owner_relation_policy() -> Box<dyn Policy<ProjectDomain>> {
    RebacPolicy::<ProjectDomain, String, String, ProjectRelation>::new(
        |user: &AuthUser| user.id.clone(),
        |target: &ProjectTarget| target.id.clone(),
        ProjectRelation::Owner,
    )
    .boxed()
}

/// Policy checking Editor relationship for view, edit, and publish actions.
pub fn project_editor_relation_policy() -> Box<dyn Policy<ProjectDomain>> {
    let is_editor_action = PolicyBuilder::<ProjectDomain>::new("IsEditorAction")
        .actions(|action: &ProjectAction| {
            matches!(
                action,
                ProjectAction::View | ProjectAction::Edit | ProjectAction::Publish
            )
        })
        .build();

    let editor_relation = RebacPolicy::<ProjectDomain, String, String, ProjectRelation>::new(
        |user: &AuthUser| user.id.clone(),
        |target: &ProjectTarget| target.id.clone(),
        ProjectRelation::Editor,
    );

    is_editor_action.and(editor_relation).boxed()
}

/// Policy checking Viewer relationship for view actions.
pub fn project_viewer_relation_policy() -> Box<dyn Policy<ProjectDomain>> {
    let is_view_action = PolicyBuilder::<ProjectDomain>::new("IsViewAction")
        .actions(|action: &ProjectAction| matches!(action, ProjectAction::View))
        .build();

    let viewer_relation = RebacPolicy::<ProjectDomain, String, String, ProjectRelation>::new(
        |user: &AuthUser| user.id.clone(),
        |target: &ProjectTarget| target.id.clone(),
        ProjectRelation::Viewer,
    );

    is_view_action.and(viewer_relation).boxed()
}

/// Builds the default permission checker for ProjectDomain.
pub fn build_project_checker() -> PermissionChecker<ProjectDomain> {
    let mut checker = PermissionChecker::named("ProjectChecker");
    checker.add_policy(admin_override_policy());
    checker.add_policy(project_owner_policy());
    checker.add_policy(public_project_view_policy());
    checker.add_policy(project_owner_relation_policy());
    checker.add_policy(project_editor_relation_policy());
    checker.add_policy(project_viewer_relation_policy());
    checker
}
