use std::{
    collections::HashMap,
    sync::{Arc, RwLock},
};

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::{
    error::AuthzError, registry, relations::Relation, AuthzBackend, AuthzContext, RelationTuple,
    Subject, TupleStatus, SYSTEM_WORKSPACE_ID,
};

#[derive(Debug, Clone, Default)]
pub struct TestAuthzBackend {
    tuples: Arc<RwLock<Vec<RelationTuple>>>,
}

impl TestAuthzBackend {
    #[must_use]
    pub fn new() -> Self {
        Self {
            tuples: Arc::new(RwLock::new(Vec::new())),
        }
    }
}

#[async_trait]
impl AuthzBackend for TestAuthzBackend {
    fn backend_name(&self) -> &'static str {
        "test_in_memory"
    }

    async fn check(
        &self,
        ctx: &AuthzContext,
        relation: Relation,
        object_type: &str,
        object_id: Uuid,
    ) -> Result<bool, AuthzError> {
        if ctx.is_bypass {
            return Ok(true);
        }

        let spec = registry::lookup(object_type)
            .ok_or_else(|| AuthzError::UnknownObjectType(object_type.to_string()))?;
        if !spec.allowed_relations.contains(&relation) {
            return Err(AuthzError::InvalidRelation {
                relation: relation.as_code().to_string(),
                object_type: object_type.to_string(),
            });
        }

        let implied = relation.implied_by();
        let guard = self
            .tuples
            .read()
            .map_err(|e| AuthzError::Internal(e.to_string()))?;

        // 1. Direct tuple match
        let now = Utc::now();
        let direct_match = guard.iter().any(|t| {
            t.tenant_id == ctx.tenant_id
                && t.object_type.eq_ignore_ascii_case(object_type)
                && t.object_id == object_id
                && t.status == TupleStatus::Active
                && t.expires_at.is_none_or(|exp| exp > now)
                && implied.iter().any(|r| r.as_code() == t.relation)
                && match &t.subject {
                    Subject::User(uid) => *uid == ctx.user_id,
                    Subject::Role(r) => r == &ctx.role,
                }
        });

        if direct_match {
            return Ok(true);
        }

        // 2. Cross-object inheritance for projects: check if user holds Admin or Owner on workspace
        if object_type.eq_ignore_ascii_case("project") {
            let workspace_match = guard.iter().any(|t| {
                t.tenant_id == ctx.tenant_id
                    && t.object_type.eq_ignore_ascii_case("workspace")
                    && t.object_id == SYSTEM_WORKSPACE_ID
                    && t.status == TupleStatus::Active
                    && t.expires_at.is_none_or(|exp| exp > now)
                    && (t.relation == Relation::Admin.as_code()
                        || t.relation == Relation::Owner.as_code())
                    && match &t.subject {
                        Subject::User(uid) => *uid == ctx.user_id,
                        Subject::Role(r) => r == &ctx.role,
                    }
            });

            if workspace_match {
                return Ok(true);
            }
        }

        Ok(false)
    }

    async fn bulk_check(
        &self,
        ctx: &AuthzContext,
        items: &[(String, Relation, Uuid)],
    ) -> Result<HashMap<(String, Relation, Uuid), bool>, AuthzError> {
        let mut out = HashMap::with_capacity(items.len());
        for (object_type, relation, id) in items {
            let allowed = self.check(ctx, *relation, object_type, *id).await?;
            out.insert((object_type.clone(), *relation, *id), allowed);
        }
        Ok(out)
    }

    async fn list_accessible(
        &self,
        ctx: &AuthzContext,
        object_type: &str,
        relation: Relation,
    ) -> Result<Vec<Uuid>, AuthzError> {
        let implied = relation.implied_by();
        let guard = self
            .tuples
            .read()
            .map_err(|e| AuthzError::Internal(e.to_string()))?;
        let now = Utc::now();

        let ids = guard
            .iter()
            .filter(|t| {
                t.tenant_id == ctx.tenant_id
                    && t.object_type.eq_ignore_ascii_case(object_type)
                    && t.status == TupleStatus::Active
                    && t.expires_at.is_none_or(|exp| exp > now)
                    && implied.iter().any(|r| r.as_code() == t.relation)
                    && match &t.subject {
                        Subject::User(uid) => *uid == ctx.user_id,
                        Subject::Role(r) => r == &ctx.role,
                    }
            })
            .map(|t| t.object_id)
            .collect();

        Ok(ids)
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
        let mut guard = self
            .tuples
            .write()
            .map_err(|e| AuthzError::Internal(e.to_string()))?;

        // Deactivate existing matching tuple if active
        for t in guard.iter_mut() {
            if t.tenant_id == ctx.tenant_id
                && t.object_type.eq_ignore_ascii_case(object_type)
                && t.object_id == object_id
                && t.relation == relation.as_code()
                && t.subject == subject
                && t.status == TupleStatus::Active
            {
                t.status = TupleStatus::Superseded;
            }
        }

        let tuple_id = Uuid::new_v4();
        guard.push(RelationTuple {
            tuple_id,
            tenant_id: ctx.tenant_id,
            object_type: object_type.to_string(),
            object_id,
            relation: relation.as_code().to_string(),
            subject,
            status: TupleStatus::Active,
            expires_at,
            granted_by: Some(ctx.user_id),
            granted_at: Utc::now(),
        });

        Ok(tuple_id)
    }

    async fn revoke_tuple(&self, ctx: &AuthzContext, tuple_id: Uuid) -> Result<(), AuthzError> {
        let mut guard = self
            .tuples
            .write()
            .map_err(|e| AuthzError::Internal(e.to_string()))?;

        for t in guard.iter_mut() {
            if t.tenant_id == ctx.tenant_id && t.tuple_id == tuple_id {
                t.status = TupleStatus::Revoked;
            }
        }

        Ok(())
    }

    async fn revoke_specific(
        &self,
        ctx: &AuthzContext,
        object_type: &str,
        object_id: Uuid,
        relation: Relation,
        subject: Subject,
    ) -> Result<(), AuthzError> {
        let mut guard = self
            .tuples
            .write()
            .map_err(|e| AuthzError::Internal(e.to_string()))?;

        for t in guard.iter_mut() {
            if t.tenant_id == ctx.tenant_id
                && t.object_type.eq_ignore_ascii_case(object_type)
                && t.object_id == object_id
                && t.relation == relation.as_code()
                && t.subject == subject
            {
                t.status = TupleStatus::Revoked;
            }
        }

        Ok(())
    }
}
