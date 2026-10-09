//! Platform authorization domain and policies.

use crate::{
    builder::PolicyBuilder,
    checker::PermissionChecker,
    policy::{Policy, PolicyDomain},
};

/// Authenticated user representation for policy decisions.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthUser {
    /// Unique user identifier.
    pub id: String,
    /// User email address.
    pub email: String,
    /// Whether user is a global platform administrator.
    pub is_admin: bool,
}

/// Policy domain for global platform operations.
pub struct PlatformDomain;

/// Platform-level actions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PlatformAction {
    /// Access platform administration panel.
    AccessAdmin,
    /// Manage users across the platform.
    ManageUsers,
    /// Manage global system configuration.
    ManageSystemSettings,
    /// View global audit log entries.
    ViewAuditLogs,
    /// Create a new project.
    CreateProject,
}

impl PolicyDomain for PlatformDomain {
    type Subject = AuthUser;
    type Action = PlatformAction;
    type Resource = ();
    type Context = ();
}

/// Policy allowing only global admins to perform privileged platform actions.
pub fn admin_only_policy() -> Box<dyn Policy<PlatformDomain>> {
    PolicyBuilder::<PlatformDomain>::new("AdminOnlyPolicy")
        .subjects(|user: &AuthUser| user.is_admin)
        .build()
}

/// Policy allowing any authenticated user to create a project.
pub fn user_project_creation_policy() -> Box<dyn Policy<PlatformDomain>> {
    PolicyBuilder::<PlatformDomain>::new("UserProjectCreationPolicy")
        .actions(|action: &PlatformAction| matches!(action, PlatformAction::CreateProject))
        .build()
}

/// Builds the default permission checker for PlatformDomain.
pub fn build_platform_checker() -> PermissionChecker<PlatformDomain> {
    let mut checker = PermissionChecker::named("PlatformChecker");
    checker.add_policy(admin_only_policy());
    checker.add_policy(user_project_creation_policy());
    checker
}
