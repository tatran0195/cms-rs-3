use std::collections::HashMap;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use cms_db::authz::RelationTupleQueries;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    error::AuthzError, registry, relations::Relation, AuthzBackend, AuthzContext, Subject,
    SYSTEM_WORKSPACE_ID,
};

#[derive(Debug, Clone)]
pub struct PgAuthzBackend {
    pool: PgPool,
}

impl PgAuthzBackend {
    #[must_use]
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl AuthzBackend for PgAuthzBackend {
    fn backend_name(&self) -> &'static str {
        "postgres"
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

        // Validate registry specification
        let spec = registry::lookup(object_type)
            .ok_or_else(|| AuthzError::UnknownObjectType(object_type.to_string()))?;
        if !spec.allowed_relations.contains(&relation) {
            return Err(AuthzError::InvalidRelation {
                relation: relation.as_code().to_string(),
                object_type: object_type.to_string(),
            });
        }

        // 1. Check direct object grant via implied relations
        let candidate_relations: Vec<&'static str> =
            relation.implied_by().iter().map(|r| r.as_code()).collect();

        // 1a. Direct user tuple
        let direct_user_allowed = RelationTupleQueries::check(
            &self.pool,
            ctx.tenant_id,
            object_type,
            object_id,
            &candidate_relations,
            "user",
            &ctx.user_id.to_string(),
        )
        .await
        .map_err(|e| AuthzError::Internal(e.to_string()))?;

        if direct_user_allowed {
            return Ok(true);
        }

        // 1b. Role tuple
        if !ctx.role.is_empty() {
            let role_allowed = RelationTupleQueries::check(
                &self.pool,
                ctx.tenant_id,
                object_type,
                object_id,
                &candidate_relations,
                "role",
                &ctx.role,
            )
            .await
            .map_err(|e| AuthzError::Internal(e.to_string()))?;

            if role_allowed {
                return Ok(true);
            }
        }

        // 2. Cross-Object Zanzibar Inheritance:
        // If checking a "project", check if user holds Admin or Owner on the parent "workspace"
        if object_type.eq_ignore_ascii_case("project") {
            let workspace_candidates = [Relation::Admin.as_code(), Relation::Owner.as_code()];
            let workspace_admin = RelationTupleQueries::check(
                &self.pool,
                ctx.tenant_id,
                "workspace",
                SYSTEM_WORKSPACE_ID,
                &workspace_candidates,
                "user",
                &ctx.user_id.to_string(),
            )
            .await
            .map_err(|e| AuthzError::Internal(e.to_string()))?;

            if workspace_admin {
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
        let spec = registry::lookup(object_type)
            .ok_or_else(|| AuthzError::UnknownObjectType(object_type.to_string()))?;
        if !spec.allowed_relations.contains(&relation) {
            return Err(AuthzError::InvalidRelation {
                relation: relation.as_code().to_string(),
                object_type: object_type.to_string(),
            });
        }

        let candidate_relations: Vec<&'static str> =
            relation.implied_by().iter().map(|r| r.as_code()).collect();

        // 1. If subject is workspace Admin or Owner, and querying "project", return all active projects
        if object_type.eq_ignore_ascii_case("project") {
            let workspace_candidates = [Relation::Admin.as_code(), Relation::Owner.as_code()];
            let is_workspace_admin = RelationTupleQueries::check(
                &self.pool,
                ctx.tenant_id,
                "workspace",
                SYSTEM_WORKSPACE_ID,
                &workspace_candidates,
                "user",
                &ctx.user_id.to_string(),
            )
            .await
            .map_err(|e| AuthzError::Internal(e.to_string()))?;

            if is_workspace_admin {
                let all_ids = sqlx::query_scalar::<_, Uuid>(r#"SELECT id::uuid FROM "Project""#)
                    .fetch_all(&self.pool)
                    .await
                    .map_err(AuthzError::Database)?;
                return Ok(all_ids);
            }
        }

        let ids = RelationTupleQueries::list_accessible(
            &self.pool,
            ctx.tenant_id,
            object_type,
            &candidate_relations,
            "user",
            &ctx.user_id.to_string(),
        )
        .await
        .map_err(|e| AuthzError::Internal(e.to_string()))?;

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
        let (subject_type, subject_id) = match subject {
            Subject::User(id) => ("user", id.to_string()),
            Subject::Role(r) => ("role", r),
        };

        RelationTupleQueries::write(
            &self.pool,
            ctx.tenant_id,
            object_type,
            object_id,
            relation.as_code(),
            subject_type,
            &subject_id,
            Some(ctx.user_id),
            expires_at,
        )
        .await
        .map_err(|e| AuthzError::Internal(e.to_string()))
    }

    async fn revoke_tuple(&self, ctx: &AuthzContext, tuple_id: Uuid) -> Result<(), AuthzError> {
        RelationTupleQueries::revoke(&self.pool, ctx.tenant_id, tuple_id)
            .await
            .map_err(|e| AuthzError::Internal(e.to_string()))?;
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
        let (subject_type, subject_id) = match subject {
            Subject::User(id) => ("user", id.to_string()),
            Subject::Role(r) => ("role", r),
        };

        RelationTupleQueries::revoke_specific(
            &self.pool,
            ctx.tenant_id,
            object_type,
            object_id,
            relation.as_code(),
            subject_type,
            &subject_id,
        )
        .await
        .map_err(|e| AuthzError::Internal(e.to_string()))?;

        Ok(())
    }
}
