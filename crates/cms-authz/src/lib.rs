//! CMS Authz (Authorization)
//!
//! This crate provides trait-based authorization,
//! supporting dual-domain independent custom roles and 2D permission matrices
//! for Workspaces and Projects.

use std::sync::Arc;

use async_trait::async_trait;
use cms_db::PgPool;
use cms_entity::{
    authz::{
        Action, ProjectPermissions, ProjectResource, WorkspacePermissions, WorkspaceResource,
    },
    common::MemberRole,
    id::{OrgId, UserId},
};
use cms_error::AppError;
use serde::{Deserialize, Serialize};

/// Tenant context containing resolved user, organization, and member role
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TenantContext {
    pub user_id: UserId,
    pub org_id: OrgId,
    pub role: MemberRole,
}

impl TenantContext {
    /// Create a new TenantContext
    pub fn new(user_id: impl Into<UserId>, org_id: impl Into<OrgId>, role: MemberRole) -> Self {
        Self {
            user_id: user_id.into(),
            org_id: org_id.into(),
            role,
        }
    }

    /// Check if the member role satisfies the minimum required role
    pub fn has_min_role(&self, min_role: MemberRole) -> bool {
        self.role >= min_role
    }

    /// Require at least the specified role, returning AppError::InsufficientRole on failure
    pub fn require_min_role(&self, min_role: MemberRole) -> Result<(), AppError> {
        if self.has_min_role(min_role) {
            Ok(())
        } else {
            Err(AppError::InsufficientRole(format!(
                "User requires at least {:?} role for organization {}",
                min_role, self.org_id
            )))
        }
    }
}

/// Resolved security context for Workspace / Organization actions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceSecurityContext {
    pub user_id: UserId,
    pub org_id: OrgId,
    pub is_owner: bool,
    pub role_id: Option<String>,
    pub permissions: WorkspacePermissions,
}

impl WorkspaceSecurityContext {
    pub fn can(&self, resource: WorkspaceResource, action: Action) -> bool {
        self.is_owner || self.permissions.has_permission(resource, action)
    }

    pub fn require(&self, resource: WorkspaceResource, action: Action) -> Result<(), AppError> {
        if self.can(resource, action) {
            Ok(())
        } else {
            Err(AppError::Forbidden)
        }
    }
}

/// Resolved security context for Project actions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectSecurityContext {
    pub user_id: UserId,
    pub project_id: String,
    pub org_id: OrgId,
    pub is_owner: bool,
    pub role_id: Option<String>,
    pub permissions: ProjectPermissions,
}

impl ProjectSecurityContext {
    pub fn can(&self, resource: ProjectResource, action: Action) -> bool {
        self.is_owner || self.permissions.has_permission(resource, action)
    }

    pub fn require(&self, resource: ProjectResource, action: Action) -> Result<(), AppError> {
        if self.can(resource, action) {
            Ok(())
        } else {
            Err(AppError::Forbidden)
        }
    }
}

/// Authorization trait
///
/// This trait defines the interface for authorization checks.
/// Implementations can be swapped via Arc<dyn Authz> in AppState.
#[async_trait]
pub trait Authz: Send + Sync {
    /// Require that the user is a member of the organization
    async fn require_org_member(&self, user_id: &str, org_id: &str) -> Result<(), AppError>;

    /// Require that the user has at least the specified role in the project
    async fn require_project_role(
        &self,
        user_id: &str,
        project_id: &str,
        min_role: MemberRole,
    ) -> Result<(), AppError>;

    /// Require that the reader has a grant for the audience
    async fn require_audience_grant(
        &self,
        reader_id: &str,
        project_id: &str,
    ) -> Result<(), AppError>;

    /// Require that the reader has a grant for a specific branch
    async fn require_branch_grant(
        &self,
        reader_id: &str,
        project_id: &str,
        branch_id: &str,
    ) -> Result<(), AppError>;

    /// Require that the user is the owner of the organization
    async fn require_org_owner(&self, user_id: &str, org_id: &str) -> Result<(), AppError>;

    /// Require that the user is an admin of the organization
    async fn require_org_admin(&self, user_id: &str, org_id: &str) -> Result<(), AppError>;

    /// Require that the user has any access to the project (Guest level or above)
    async fn require_project_access(
        &self,
        user_id: &str,
        project_id: &str,
    ) -> Result<(), AppError> {
        self.require_project_role(user_id, project_id, MemberRole::Guest)
            .await
    }

    /// Require that the user is a member of the project (Member level or above)
    async fn require_project_member(
        &self,
        user_id: &str,
        project_id: &str,
    ) -> Result<(), AppError> {
        self.require_project_role(user_id, project_id, MemberRole::Member)
            .await
    }

    /// Require that the user has system administrative privileges
    async fn require_system_admin(&self, user_id: &str) -> Result<(), AppError>;

    /// Resolve the tenant context in a single query check
    async fn get_tenant_context(
        &self,
        user_id: &str,
        org_id: &str,
    ) -> Result<TenantContext, AppError>;

    /// Resolve workspace security context
    async fn get_workspace_context(
        &self,
        user_id: &str,
        org_id: &str,
    ) -> Result<WorkspaceSecurityContext, AppError>;

    /// Resolve project security context
    async fn get_project_context(
        &self,
        user_id: &str,
        project_id: &str,
    ) -> Result<ProjectSecurityContext, AppError>;

    /// Assert a workspace permission
    async fn require_workspace_permission(
        &self,
        user_id: &str,
        org_id: &str,
        resource: WorkspaceResource,
        action: Action,
    ) -> Result<(), AppError>;

    /// Assert a project permission
    async fn require_project_permission(
        &self,
        user_id: &str,
        project_id: &str,
        resource: ProjectResource,
        action: Action,
    ) -> Result<(), AppError>;
}

/// Production implementation of Authz
pub struct ProductionAuthz {
    pool: PgPool,
    system_admin_emails: Vec<String>,
}

impl ProductionAuthz {
    /// Create a new ProductionAuthz
    pub fn new(pool: PgPool) -> Self {
        Self::new_with_admin_emails(pool, Vec::new())
    }

    /// Construct production authorization with the operator email allow-list.
    pub fn new_with_admin_emails(pool: PgPool, system_admin_emails: Vec<String>) -> Self {
        Self {
            pool,
            system_admin_emails: system_admin_emails
                .into_iter()
                .map(|email| email.trim().to_ascii_lowercase())
                .filter(|email| !email.is_empty())
                .collect(),
        }
    }

    /// Get a user's role in an organization
    async fn get_org_role(
        &self,
        user_id: &str,
        org_id: &str,
    ) -> Result<Option<MemberRole>, AppError> {
        use cms_db::org::MemberQueries;

        let member = MemberQueries::get_by_user_and_org(&self.pool, user_id, org_id).await?;

        Ok(member.map(|m| m.role))
    }

    /// Get a user's role in a project
    async fn get_project_role(
        &self,
        user_id: &str,
        project_id: &str,
    ) -> Result<Option<MemberRole>, AppError> {
        use cms_db::project::ProjectQueries;

        let project = ProjectQueries::get_by_id(&self.pool, project_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Project not found".to_string()))?;

        let org_id = project.organization_id;
        self.get_org_role(user_id, &org_id).await
    }

    /// Check if a reader has a grant for an audience
    async fn has_audience_grant(
        &self,
        reader_id: &str,
        project_id: &str,
    ) -> Result<bool, AppError> {
        use cms_db::reader_access::ReaderAudienceQueries;

        let has_grant =
            ReaderAudienceQueries::has_grant_for_project(&self.pool, reader_id, project_id).await?;

        Ok(has_grant)
    }
}

#[async_trait]
impl Authz for ProductionAuthz {
    async fn require_org_member(&self, user_id: &str, org_id: &str) -> Result<(), AppError> {
        let role = self.get_org_role(user_id, org_id).await?;

        if role.is_none() {
            return Err(AppError::AccessDenied(
                "User is not a member of this organization".to_string(),
            ));
        }

        Ok(())
    }

    async fn require_project_role(
        &self,
        user_id: &str,
        project_id: &str,
        min_role: MemberRole,
    ) -> Result<(), AppError> {
        let role = self.get_project_role(user_id, project_id).await?;

        if let Some(user_role) = role {
            if user_role >= min_role {
                return Ok(());
            }
        }

        Err(AppError::InsufficientRole(format!(
            "User requires at least {:?} role for this project",
            min_role
        )))
    }

    async fn require_audience_grant(
        &self,
        reader_id: &str,
        project_id: &str,
    ) -> Result<(), AppError> {
        let has_grant = self.has_audience_grant(reader_id, project_id).await?;

        if !has_grant {
            return Err(AppError::AccessDenied(
                "Reader does not have access to this project".to_string(),
            ));
        }

        Ok(())
    }

    async fn require_branch_grant(
        &self,
        reader_id: &str,
        project_id: &str,
        branch_id: &str,
    ) -> Result<(), AppError> {
        use cms_db::reader_access::AudienceGrantQueries;

        let has_grant = AudienceGrantQueries::has_grant_for_branch(
            &self.pool, reader_id, project_id, branch_id,
        )
        .await?;

        if !has_grant {
            return Err(AppError::AccessDenied(
                "Reader does not have access to this branch".to_string(),
            ));
        }

        Ok(())
    }

    async fn require_org_owner(&self, user_id: &str, org_id: &str) -> Result<(), AppError> {
        let role = self.get_org_role(user_id, org_id).await?;

        if role != Some(MemberRole::Owner) {
            return Err(AppError::InsufficientRole(
                "User must be the organization owner".to_string(),
            ));
        }

        Ok(())
    }

    async fn require_org_admin(&self, user_id: &str, org_id: &str) -> Result<(), AppError> {
        let role = self.get_org_role(user_id, org_id).await?;

        match role {
            Some(MemberRole::Owner) | Some(MemberRole::Admin) => Ok(()),
            _ => Err(AppError::InsufficientRole(
                "User must be an organization admin".to_string(),
            )),
        }
    }

    async fn require_system_admin(&self, user_id: &str) -> Result<(), AppError> {
        let user = cms_db::auth::UserQueries::get_by_id(&self.pool, user_id)
            .await?
            .ok_or(AppError::Forbidden)?;
        let database_admin =
            cms_db::auth::UserQueries::is_system_admin(&self.pool, user_id).await?;
        let configured_admin = self
            .system_admin_emails
            .iter()
            .any(|email| email == &user.email.trim().to_ascii_lowercase());
        if !database_admin && !configured_admin {
            return Err(AppError::Forbidden);
        }
        Ok(())
    }

    async fn get_tenant_context(
        &self,
        user_id: &str,
        org_id: &str,
    ) -> Result<TenantContext, AppError> {
        use cms_db::org::MemberQueries;

        let member = MemberQueries::get_by_user_and_org(&self.pool, user_id, org_id).await?;
        match member {
            Some(m) => Ok(TenantContext::new(user_id, org_id, m.role)),
            None => Err(AppError::AccessDenied(
                "User is not a member of this organization".to_string(),
            )),
        }
    }

    async fn get_workspace_context(
        &self,
        user_id: &str,
        org_id: &str,
    ) -> Result<WorkspaceSecurityContext, AppError> {
        use cms_db::org::MemberQueries;
        use cms_db::authz::OrgRoleQueries;

        let member = MemberQueries::get_by_user_and_org(&self.pool, user_id, org_id)
            .await?
            .ok_or_else(|| AppError::AccessDenied("User is not a member of this organization".to_string()))?;

        let is_system_admin = self.require_system_admin(user_id).await.is_ok();
        let is_owner = is_system_admin || member.role == MemberRole::Owner;

        if is_owner {
            return Ok(WorkspaceSecurityContext {
                user_id: UserId::from(user_id),
                org_id: OrgId::from(org_id),
                is_owner: true,
                role_id: None,
                permissions: WorkspacePermissions::full(),
            });
        }

        let (role_id, permissions) = if let Some(ref r_id) = member.role_id {
            if let Some(role) = OrgRoleQueries::get_by_id(&self.pool, r_id).await? {
                (Some(role.id), role.permissions)
            } else if let Some(default_role) = OrgRoleQueries::get_default(&self.pool, org_id).await? {
                (Some(default_role.id), default_role.permissions)
            } else {
                (None, WorkspacePermissions::empty())
            }
        } else if let Some(default_role) = OrgRoleQueries::get_default(&self.pool, org_id).await? {
            (Some(default_role.id), default_role.permissions)
        } else {
            let perms = if member.role == MemberRole::Admin {
                WorkspacePermissions::full()
            } else {
                let mut p = WorkspacePermissions::empty();
                let mut acts = std::collections::HashMap::new();
                acts.insert(Action::Read, true);
                p.0.insert(WorkspaceResource::Projects, acts.clone());
                p.0.insert(WorkspaceResource::Members, acts);
                p
            };
            (None, perms)
        };

        Ok(WorkspaceSecurityContext {
            user_id: UserId::from(user_id),
            org_id: OrgId::from(org_id),
            is_owner: false,
            role_id,
            permissions,
        })
    }

    async fn get_project_context(
        &self,
        user_id: &str,
        project_id: &str,
    ) -> Result<ProjectSecurityContext, AppError> {
        use cms_db::project::ProjectQueries;
        use cms_db::authz::{ProjectMemberQueries, ProjectRoleQueries};

        let project = ProjectQueries::get_by_id(&self.pool, project_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Project not found".to_string()))?;

        let org_id = project.organization_id;
        let is_system_admin = self.require_system_admin(user_id).await.is_ok();
        let org_role = self.get_org_role(user_id, &org_id).await?;
        let is_org_owner = org_role == Some(MemberRole::Owner);

        if is_system_admin || is_org_owner {
            return Ok(ProjectSecurityContext {
                user_id: UserId::from(user_id),
                project_id: project_id.to_string(),
                org_id: OrgId::from(org_id),
                is_owner: true,
                role_id: None,
                permissions: ProjectPermissions::full(),
            });
        }

        let project_member = ProjectMemberQueries::get_by_user_and_project(&self.pool, user_id, project_id).await?;

        let pm = match project_member {
            Some(pm) => pm,
            None => {
                if org_role == Some(MemberRole::Admin) {
                    return Ok(ProjectSecurityContext {
                        user_id: UserId::from(user_id),
                        project_id: project_id.to_string(),
                        org_id: OrgId::from(org_id),
                        is_owner: true,
                        role_id: None,
                        permissions: ProjectPermissions::full(),
                    });
                }
                return Err(AppError::AccessDenied("User is not a member of this project".to_string()));
            }
        };

        if pm.role == "owner" {
            return Ok(ProjectSecurityContext {
                user_id: UserId::from(user_id),
                project_id: project_id.to_string(),
                org_id: OrgId::from(org_id),
                is_owner: true,
                role_id: pm.role_id,
                permissions: ProjectPermissions::full(),
            });
        }

        let (role_id, permissions) = if let Some(ref r_id) = pm.role_id {
            if let Some(role) = ProjectRoleQueries::get_by_id(&self.pool, r_id).await? {
                (Some(role.id), role.permissions)
            } else if let Some(default_role) = ProjectRoleQueries::get_default(&self.pool, project_id).await? {
                (Some(default_role.id), default_role.permissions)
            } else {
                (None, ProjectPermissions::empty())
            }
        } else if let Some(default_role) = ProjectRoleQueries::get_default(&self.pool, project_id).await? {
            (Some(default_role.id), default_role.permissions)
        } else {
            let mut p = ProjectPermissions::empty();
            let mut read_act = std::collections::HashMap::new();
            read_act.insert(Action::Read, true);
            p.0.insert(ProjectResource::Pages, read_act.clone());
            p.0.insert(ProjectResource::Branches, read_act.clone());
            p.0.insert(ProjectResource::Deployments, read_act);
            (None, p)
        };

        Ok(ProjectSecurityContext {
            user_id: UserId::from(user_id),
            project_id: project_id.to_string(),
            org_id: OrgId::from(org_id),
            is_owner: false,
            role_id,
            permissions,
        })
    }

    async fn require_workspace_permission(
        &self,
        user_id: &str,
        org_id: &str,
        resource: WorkspaceResource,
        action: Action,
    ) -> Result<(), AppError> {
        let ctx = self.get_workspace_context(user_id, org_id).await?;
        ctx.require(resource, action)
    }

    async fn require_project_permission(
        &self,
        user_id: &str,
        project_id: &str,
        resource: ProjectResource,
        action: Action,
    ) -> Result<(), AppError> {
        let ctx = self.get_project_context(user_id, project_id).await?;
        ctx.require(resource, action)
    }
}

/// No-op authorization for testing
pub struct NoopAuthz;

#[async_trait]
impl Authz for NoopAuthz {
    async fn require_org_member(&self, _user_id: &str, _org_id: &str) -> Result<(), AppError> {
        Ok(())
    }

    async fn require_project_role(
        &self,
        _user_id: &str,
        _project_id: &str,
        _min_role: MemberRole,
    ) -> Result<(), AppError> {
        Ok(())
    }

    async fn require_audience_grant(
        &self,
        _reader_id: &str,
        _project_id: &str,
    ) -> Result<(), AppError> {
        Ok(())
    }

    async fn require_branch_grant(
        &self,
        _reader_id: &str,
        _project_id: &str,
        _branch_id: &str,
    ) -> Result<(), AppError> {
        Ok(())
    }

    async fn require_org_owner(&self, _user_id: &str, _org_id: &str) -> Result<(), AppError> {
        Ok(())
    }

    async fn require_org_admin(&self, _user_id: &str, _org_id: &str) -> Result<(), AppError> {
        Ok(())
    }

    async fn require_system_admin(&self, _user_id: &str) -> Result<(), AppError> {
        Ok(())
    }

    async fn get_tenant_context(
        &self,
        user_id: &str,
        org_id: &str,
    ) -> Result<TenantContext, AppError> {
        Ok(TenantContext::new(user_id, org_id, MemberRole::Owner))
    }

    async fn get_workspace_context(
        &self,
        user_id: &str,
        org_id: &str,
    ) -> Result<WorkspaceSecurityContext, AppError> {
        Ok(WorkspaceSecurityContext {
            user_id: UserId::from(user_id),
            org_id: OrgId::from(org_id),
            is_owner: true,
            role_id: None,
            permissions: WorkspacePermissions::full(),
        })
    }

    async fn get_project_context(
        &self,
        user_id: &str,
        project_id: &str,
    ) -> Result<ProjectSecurityContext, AppError> {
        Ok(ProjectSecurityContext {
            user_id: UserId::from(user_id),
            project_id: project_id.to_string(),
            org_id: OrgId::from("org_default"),
            is_owner: true,
            role_id: None,
            permissions: ProjectPermissions::full(),
        })
    }

    async fn require_workspace_permission(
        &self,
        _user_id: &str,
        _org_id: &str,
        _resource: WorkspaceResource,
        _action: Action,
    ) -> Result<(), AppError> {
        Ok(())
    }

    async fn require_project_permission(
        &self,
        _user_id: &str,
        _project_id: &str,
        _resource: ProjectResource,
        _action: Action,
    ) -> Result<(), AppError> {
        Ok(())
    }
}

/// Create an authorization implementation based on configuration
pub fn create_authz(pool: PgPool) -> Result<Arc<dyn Authz>, AppError> {
    Ok(Arc::new(ProductionAuthz::new(pool)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_member_role_ordering() {
        assert!(MemberRole::Owner > MemberRole::Admin);
        assert!(MemberRole::Admin > MemberRole::Member);
        assert!(MemberRole::Member > MemberRole::Guest);
        assert!(MemberRole::Owner >= MemberRole::Owner);
        assert!(MemberRole::Admin >= MemberRole::Member);
    }

    #[test]
    fn test_noop_authz() {
        let authz = NoopAuthz;

        tokio::runtime::Runtime::new().unwrap().block_on(async {
            authz.require_org_member("user-1", "org-1").await.unwrap();
            authz
                .require_project_role("user-1", "proj-1", MemberRole::Admin)
                .await
                .unwrap();
            authz
                .require_audience_grant("reader-1", "proj-1")
                .await
                .unwrap();
            authz.require_org_owner("user-1", "org-1").await.unwrap();
        });
    }

    #[test]
    fn test_tenant_context_role_enforcement() {
        let ctx = TenantContext::new("user_123", "org_456", MemberRole::Editor);
        assert!(ctx.has_min_role(MemberRole::Viewer));
        assert!(ctx.has_min_role(MemberRole::Editor));
        assert!(!ctx.has_min_role(MemberRole::Admin));
        assert!(!ctx.has_min_role(MemberRole::Owner));

        assert!(ctx.require_min_role(MemberRole::Viewer).is_ok());
        assert!(ctx.require_min_role(MemberRole::Editor).is_ok());
        assert!(ctx.require_min_role(MemberRole::Admin).is_err());
    }
}
