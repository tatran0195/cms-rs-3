#![forbid(unsafe_code)]

//! `cms-authz-gate` — route-level authorization guards and parent reachability resolution.
//!
//! Provides:
//! - `require_project_access`: Evaluates ReBAC grant and returns `404 Not Found` on denial
//!   (preventing existence oracle leakage).
//! - `require_workspace_access`: Evaluates company workspace-level permissions.
//! - `require_parent_access`: Single-hop traversal resolving child resources (pages, branches,
//!   deployments) to their parent project and evaluating project access.

use cms_authz::{AuthzBackend, AuthzContext, Relation, SYSTEM_WORKSPACE_ID};
use cms_error::AppError;
use sqlx::PgPool;
use uuid::Uuid;

/// Which parent resource a child entity hangs from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ParentLink {
    Page(Uuid),
    Branch(Uuid),
    Deployment(Uuid),
    ApiKey(Uuid),
    Language(Uuid),
    Domain(Uuid),
    Asset(Uuid),
    GitConnection(Uuid),
    OpenApiDocument(Uuid),
    Theme(Uuid),
    Audience(Uuid),
    ExportJob(Uuid),
    ExportSchedule(Uuid),
}

/// Resolve a child resource to its parent project ID in a single indexed query.
pub async fn resolve_parent_project(pool: &PgPool, link: ParentLink) -> Result<Option<Uuid>, AppError> {
    let project_id = match link {
        ParentLink::Page(id) => {
            sqlx::query_scalar::<_, Uuid>(
                r#"SELECT project_id::uuid FROM "Page" WHERE id = $1"#,
            )
            .bind(id.to_string())
            .fetch_optional(pool)
            .await
            .map_err(AppError::Database)?
        }
        ParentLink::Branch(id) => {
            sqlx::query_scalar::<_, Uuid>(
                r#"SELECT project_id::uuid FROM "Branch" WHERE id = $1"#,
            )
            .bind(id.to_string())
            .fetch_optional(pool)
            .await
            .map_err(AppError::Database)?
        }
        ParentLink::Deployment(id) => {
            sqlx::query_scalar::<_, Uuid>(
                r#"SELECT project_id::uuid FROM "Deployment" WHERE id = $1"#,
            )
            .bind(id.to_string())
            .fetch_optional(pool)
            .await
            .map_err(AppError::Database)?
        }
        ParentLink::ApiKey(id) => {
            sqlx::query_scalar::<_, Option<Uuid>>(
                r#"SELECT project_id::uuid FROM "ApiKey" WHERE id = $1"#,
            )
            .bind(id.to_string())
            .fetch_optional(pool)
            .await
            .map_err(AppError::Database)?
            .flatten()
        }
        ParentLink::Language(id) => {
            sqlx::query_scalar::<_, Uuid>(
                r#"SELECT project_id::uuid FROM "Language" WHERE id = $1"#,
            )
            .bind(id.to_string())
            .fetch_optional(pool)
            .await
            .map_err(AppError::Database)?
        }
        ParentLink::Domain(id) => {
            sqlx::query_scalar::<_, Uuid>(
                r#"SELECT d.project_id::uuid FROM "Domain" dm JOIN "Deployment" d ON dm.deployment_id = d.id WHERE dm.id = $1"#,
            )
            .bind(id.to_string())
            .fetch_optional(pool)
            .await
            .map_err(AppError::Database)?
        }
        ParentLink::Asset(id) => {
            sqlx::query_scalar::<_, Uuid>(
                r#"SELECT project_id::uuid FROM "Asset" WHERE id = $1"#,
            )
            .bind(id.to_string())
            .fetch_optional(pool)
            .await
            .map_err(AppError::Database)?
        }
        ParentLink::GitConnection(id) => {
            sqlx::query_scalar::<_, Uuid>(
                r#"SELECT project_id::uuid FROM "GitConnection" WHERE id = $1"#,
            )
            .bind(id.to_string())
            .fetch_optional(pool)
            .await
            .map_err(AppError::Database)?
        }
        ParentLink::OpenApiDocument(id) => {
            sqlx::query_scalar::<_, Uuid>(
                r#"SELECT project_id::uuid FROM "OpenApiDocument" WHERE id = $1"#,
            )
            .bind(id.to_string())
            .fetch_optional(pool)
            .await
            .map_err(AppError::Database)?
        }
        ParentLink::Theme(id) => {
            sqlx::query_scalar::<_, Uuid>(
                r#"SELECT project_id::uuid FROM "Theme" WHERE id = $1"#,
            )
            .bind(id.to_string())
            .fetch_optional(pool)
            .await
            .map_err(AppError::Database)?
        }
        ParentLink::Audience(id) => {
            sqlx::query_scalar::<_, Uuid>(
                r#"SELECT project_id::uuid FROM "Audience" WHERE id = $1"#,
            )
            .bind(id.to_string())
            .fetch_optional(pool)
            .await
            .map_err(AppError::Database)?
        }
        ParentLink::ExportJob(id) => {
            sqlx::query_scalar::<_, Uuid>(
                r#"SELECT s.project_id::uuid FROM "ExportJob" j JOIN "ExportSnapshot" s ON j.snapshot_id = s.id WHERE j.id = $1"#,
            )
            .bind(id.to_string())
            .fetch_optional(pool)
            .await
            .map_err(AppError::Database)?
        }
        ParentLink::ExportSchedule(id) => {
            sqlx::query_scalar::<_, Uuid>(
                r#"SELECT project_id::uuid FROM "ExportSchedule" WHERE id = $1"#,
            )
            .bind(id.to_string())
            .fetch_optional(pool)
            .await
            .map_err(AppError::Database)?
        }
    };

    Ok(project_id)
}

/// Gate route on access to a specific project.
/// Returns `AppError::NotFound` on deny so attackers cannot probe resource existence.
pub async fn require_project_access(
    authz: &dyn AuthzBackend,
    ctx: &AuthzContext,
    project_id: Uuid,
    relation: Relation,
) -> Result<(), AppError> {
    let allowed = authz
        .check(ctx, relation, "project", project_id)
        .await
        .map_err(AppError::internal)?;

    if !allowed {
        return Err(AppError::NotFound("Project not found".to_string()));
    }

    Ok(())
}

/// Gate route on access to workspace-level authority (e.g. Workspace Owner / Admin).
pub async fn require_workspace_access(
    authz: &dyn AuthzBackend,
    ctx: &AuthzContext,
    relation: Relation,
) -> Result<(), AppError> {
    let allowed = authz
        .check(ctx, relation, "workspace", SYSTEM_WORKSPACE_ID)
        .await
        .map_err(AppError::internal)?;

    if !allowed {
        return Err(AppError::Forbidden);
    }

    Ok(())
}

/// Gate route on access to a child resource by resolving its parent project and checking access.
/// Returns the resolved `project_id` on success, or `NotFound` if parent doesn't exist or access is denied.
pub async fn require_parent_access(
    authz: &dyn AuthzBackend,
    ctx: &AuthzContext,
    pool: &PgPool,
    link: ParentLink,
    relation: Relation,
) -> Result<Uuid, AppError> {
    let project_id = resolve_parent_project(pool, link)
        .await?
        .ok_or_else(|| AppError::NotFound("Resource not found".to_string()))?;

    require_project_access(authz, ctx, project_id, relation).await?;

    Ok(project_id)
}

/// Verify that the principal is a system-level administrator (via explicit User role = 'admin' or workspace Admin).
pub async fn require_system_admin(
    authz: &dyn AuthzBackend,
    ctx: &AuthzContext,
    pool: &PgPool,
) -> Result<(), AppError> {
    if cms_db::auth::UserQueries::is_system_admin(pool, &ctx.user_id.to_string())
        .await
        .unwrap_or(false)
    {
        return Ok(());
    }

    require_workspace_access(authz, ctx, Relation::Admin).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use cms_authz::TestAuthzBackend;

    #[tokio::test]
    async fn test_require_project_access_allowed() {
        let authz = TestAuthzBackend::new();
        let user_id = Uuid::new_v4();
        let project_id = Uuid::new_v4();
        let ctx = AuthzContext::new(user_id, "member".into(), false);

        authz
            .write_tuple(
                &ctx,
                "project",
                project_id,
                Relation::Editor,
                cms_authz::Subject::User(user_id),
                None,
            )
            .await
            .unwrap();

        let res = require_project_access(&authz, &ctx, project_id, Relation::Viewer).await;
        assert!(res.is_ok());
    }

    #[tokio::test]
    async fn test_require_project_access_denied_returns_not_found() {
        let authz = TestAuthzBackend::new();
        let user_id = Uuid::new_v4();
        let project_id = Uuid::new_v4();
        let ctx = AuthzContext::new(user_id, "member".into(), false);

        let res = require_project_access(&authz, &ctx, project_id, Relation::Viewer).await;
        assert!(matches!(res, Err(AppError::NotFound(_))));
    }

    #[tokio::test]
    async fn test_require_workspace_access_allowed_and_forbidden() {
        let authz = TestAuthzBackend::new();
        let user_id = Uuid::new_v4();
        let ctx = AuthzContext::new(user_id, "member".into(), false);

        // Denied when no tuple
        let res = require_workspace_access(&authz, &ctx, Relation::Admin).await;
        assert!(matches!(res, Err(AppError::Forbidden)));

        // Allowed when tuple granted
        authz
            .write_tuple(
                &ctx,
                "workspace",
                SYSTEM_WORKSPACE_ID,
                Relation::Admin,
                cms_authz::Subject::User(user_id),
                None,
            )
            .await
            .unwrap();
        let res = require_workspace_access(&authz, &ctx, Relation::Admin).await;
        assert!(res.is_ok());
    }
}
