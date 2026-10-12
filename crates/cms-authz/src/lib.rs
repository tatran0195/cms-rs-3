#![forbid(unsafe_code)]

//! `cms-authz` — Zanzibar-style ReBAC authorization engine ported from MedBrains.
//!
//! Provides relational authorization checks over `relation_tuples` with
//! single-query PostgreSQL evaluation (`PgAuthzBackend`) and fast in-memory
//! test evaluation (`TestAuthzBackend`).

pub mod backend_pg;
pub mod backend_test;
pub mod error;
pub mod registry;
pub mod relations;

use std::collections::HashMap;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub use backend_pg::PgAuthzBackend;
pub use backend_test::TestAuthzBackend;
pub use error::AuthzError;
pub use relations::Relation;

/// Default singleton ID for the internal company workspace.
pub const SYSTEM_WORKSPACE_ID: Uuid = Uuid::nil();

/// One Zanzibar sharing tuple.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelationTuple {
    pub tuple_id: Uuid,
    pub tenant_id: Uuid,
    pub object_type: String,
    pub object_id: Uuid,
    pub relation: String,
    pub subject: Subject,
    pub status: TupleStatus,
    pub expires_at: Option<DateTime<Utc>>,
    pub granted_by: Option<Uuid>,
    pub granted_at: DateTime<Utc>,
}

/// The principal holding a relation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", content = "id", rename_all = "snake_case")]
pub enum Subject {
    User(Uuid),
    Role(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TupleStatus {
    Active,
    Revoked,
    Superseded,
}

/// Request evaluation context derived from authenticated claims.
#[derive(Debug, Clone)]
pub struct AuthzContext {
    pub tenant_id: Uuid,
    pub user_id: Uuid,
    pub role: String,
    pub is_bypass: bool,
}

impl AuthzContext {
    #[must_use]
    pub fn new(user_id: Uuid, role: String, is_bypass: bool) -> Self {
        Self {
            tenant_id: SYSTEM_WORKSPACE_ID,
            user_id,
            role,
            is_bypass,
        }
    }
}

/// Asynchronous backend trait for ReBAC checks.
#[async_trait]
pub trait AuthzBackend: Send + Sync {
    /// Diagnostic name of backend.
    fn backend_name(&self) -> &'static str;

    /// "Does subject hold relation on object?" (Hot path)
    async fn check(
        &self,
        ctx: &AuthzContext,
        relation: Relation,
        object_type: &str,
        object_id: Uuid,
    ) -> Result<bool, AuthzError>;

    /// Bulk check N (object_type, relation, object_id) triples in a single batch.
    async fn bulk_check(
        &self,
        ctx: &AuthzContext,
        items: &[(String, Relation, Uuid)],
    ) -> Result<HashMap<(String, Relation, Uuid), bool>, AuthzError>;

    /// List all object IDs of a given type accessible under relation.
    async fn list_accessible(
        &self,
        ctx: &AuthzContext,
        object_type: &str,
        relation: Relation,
    ) -> Result<Vec<Uuid>, AuthzError>;

    /// Write or update an explicit relation tuple.
    async fn write_tuple(
        &self,
        ctx: &AuthzContext,
        object_type: &str,
        object_id: Uuid,
        relation: Relation,
        subject: Subject,
        expires_at: Option<DateTime<Utc>>,
    ) -> Result<Uuid, AuthzError>;

    /// Revoke a tuple by tuple ID.
    async fn revoke_tuple(&self, ctx: &AuthzContext, tuple_id: Uuid) -> Result<(), AuthzError>;

    /// Revoke a tuple by coordinate triple.
    async fn revoke_specific(
        &self,
        ctx: &AuthzContext,
        object_type: &str,
        object_id: Uuid,
        relation: Relation,
        subject: Subject,
    ) -> Result<(), AuthzError>;
}

/// Backwards-compatible / ergonomic wrapper around `Arc<dyn AuthzBackend>`.
#[derive(Clone)]
pub struct AuthzState {
    pub backend: std::sync::Arc<dyn AuthzBackend>,
}

impl AuthzState {
    #[must_use]
    pub fn new(pool: sqlx::PgPool, _system_admin_emails: Vec<String>) -> Self {
        Self {
            backend: std::sync::Arc::new(PgAuthzBackend::new(pool)),
        }
    }

    #[must_use]
    pub fn from_backend(backend: std::sync::Arc<dyn AuthzBackend>) -> Self {
        Self { backend }
    }
}

impl std::ops::Deref for AuthzState {
    type Target = dyn AuthzBackend;

    fn deref(&self) -> &Self::Target {
        &*self.backend
    }
}

#[async_trait]
impl AuthzBackend for AuthzState {
    fn backend_name(&self) -> &'static str {
        self.backend.backend_name()
    }

    async fn check(
        &self,
        ctx: &AuthzContext,
        relation: Relation,
        object_type: &str,
        object_id: Uuid,
    ) -> Result<bool, AuthzError> {
        self.backend.check(ctx, relation, object_type, object_id).await
    }

    async fn bulk_check(
        &self,
        ctx: &AuthzContext,
        items: &[(String, Relation, Uuid)],
    ) -> Result<HashMap<(String, Relation, Uuid), bool>, AuthzError> {
        self.backend.bulk_check(ctx, items).await
    }

    async fn list_accessible(
        &self,
        ctx: &AuthzContext,
        object_type: &str,
        relation: Relation,
    ) -> Result<Vec<Uuid>, AuthzError> {
        self.backend.list_accessible(ctx, object_type, relation).await
    }

    async fn write_tuple(
        &self,
        ctx: &AuthzContext,
        object_type: &str,
        object_id: Uuid,
        relation: Relation,
        subject: Subject,
        expires_at: Option<DateTime<Utc>>,
    ) -> Result<Uuid, AuthzError> {
        self.backend
            .write_tuple(ctx, object_type, object_id, relation, subject, expires_at)
            .await
    }

    async fn revoke_tuple(&self, ctx: &AuthzContext, tuple_id: Uuid) -> Result<(), AuthzError> {
        self.backend.revoke_tuple(ctx, tuple_id).await
    }

    async fn revoke_specific(
        &self,
        ctx: &AuthzContext,
        object_type: &str,
        object_id: Uuid,
        relation: Relation,
        subject: Subject,
    ) -> Result<(), AuthzError> {
        self.backend
            .revoke_specific(ctx, object_type, object_id, relation, subject)
            .await
    }
}
