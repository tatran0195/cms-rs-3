//! Long-lived application authorization state.

use sqlx::PgPool;
use std::sync::Arc;

use crate::{
    checker::PermissionChecker,
    session::{EvaluationSession, FactRegistry},
};

use super::{
    platform::{build_platform_checker, AuthUser, PlatformDomain},
    project::{
        build_project_checker, DbProjectRelationshipSource, ProjectDomain, ProjectRelationship,
    },
};

/// Long-lived authorization state holding checkers and fact registries.
pub struct AuthzState {
    /// Permission checker for PlatformDomain.
    pub platform_checker: PermissionChecker<PlatformDomain>,
    /// Permission checker for ProjectDomain.
    pub project_checker: PermissionChecker<ProjectDomain>,
    /// Request fact registry for relationship resolution.
    pub fact_registry: FactRegistry,
    /// List of system administrator emails configured for the instance.
    pub system_admin_emails: Vec<String>,
}

impl AuthzState {
    /// Creates a new AuthzState backed by the given database pool and admin email list.
    pub fn new(pool: PgPool, system_admin_emails: Vec<String>) -> Self {
        let relationship_source = Arc::new(DbProjectRelationshipSource::new(pool));
        let fact_registry = FactRegistry::builder()
            .with_arc::<ProjectRelationship>(relationship_source)
            .build();

        Self {
            platform_checker: build_platform_checker(),
            project_checker: build_project_checker(),
            fact_registry,
            system_admin_emails,
        }
    }

    /// Creates a fresh request-scoped evaluation session with registered fact sources.
    pub fn session(&self) -> EvaluationSession {
        self.fact_registry.session()
    }

    /// Derives an AuthUser subject from caller ID and email address.
    pub fn to_auth_user(&self, id: impl Into<String>, email: impl Into<String>) -> AuthUser {
        let id = id.into();
        let email = email.into();
        let is_admin = self
            .system_admin_emails
            .iter()
            .any(|admin_email| admin_email.eq_ignore_ascii_case(&email));

        AuthUser {
            id,
            email,
            is_admin,
        }
    }
}
