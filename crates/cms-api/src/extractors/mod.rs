//! Common extractors for API handlers

use std::{ops::Deref, sync::Arc};

use axum::{extract::FromRequestParts, http::request::Parts};
use cms_entity::{
    common::MemberRole,
    id::{OrgId as EntityOrgId, ProjectId as EntityProjectId, UserId as EntityUserId},
};
use cms_error::AppError;

use crate::{auth::AuthExtractor, AppState};

/// User ID extractor from authenticated session
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UserId(pub EntityUserId);

impl Deref for UserId {
    type Target = EntityUserId;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl<S> FromRequestParts<S> for UserId
where
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        if let Ok(auth) = AuthExtractor::from_request_parts(parts, state).await {
            return Ok(UserId(EntityUserId::from(auth.user.id)));
        }

        Err(AppError::Unauthorized)
    }
}

/// Organization ID extractor from header, query, or path
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OrgId(pub EntityOrgId);

impl Deref for OrgId {
    type Target = EntityOrgId;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl<S> FromRequestParts<S> for OrgId
where
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let app_state = parts.extensions.get::<Arc<AppState>>().cloned();
        let pool = app_state.as_ref().map(|s| &s.biz_context.pool);

        if let Some(org_id) = resolve_org_id(parts, pool).await? {
            return Ok(OrgId(EntityOrgId::from(org_id)));
        }

        Err(AppError::Unauthorized)
    }
}

/// Project ID extractor from path or header
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectId(pub EntityProjectId);

impl Deref for ProjectId {
    type Target = EntityProjectId;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl<S> FromRequestParts<S> for ProjectId
where
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        if let Some(project_id) = parts.headers.get("X-Project-ID") {
            let id_str = project_id
                .to_str()
                .map_err(|_| AppError::Unauthorized)?
                .trim();
            if !id_str.is_empty() {
                return Ok(ProjectId(EntityProjectId::from(id_str)));
            }
        }

        // Try extracting from path segment following /projects/
        let path = parts.uri.path();
        let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
        for i in 0..segments.len() {
            if segments[i] == "projects" && i + 1 < segments.len() {
                let candidate = segments[i + 1].trim();
                if !candidate.is_empty() {
                    return Ok(ProjectId(EntityProjectId::from(candidate)));
                }
            }
        }

        Err(AppError::Unauthorized)
    }
}

/// Unified Request Context representing request-scoped identity and telemetry metadata
#[derive(Debug, Clone)]
pub struct RequestContext {
    pub request_id: String,
    pub user_id: Option<EntityUserId>,
    pub org_id: Option<EntityOrgId>,
    pub role: Option<MemberRole>,
}

impl RequestContext {
    pub fn new(
        request_id: impl Into<String>,
        user_id: Option<EntityUserId>,
        org_id: Option<EntityOrgId>,
        role: Option<MemberRole>,
    ) -> Self {
        Self {
            request_id: request_id.into(),
            user_id,
            org_id,
            role,
        }
    }
}

impl<S> FromRequestParts<S> for RequestContext
where
    S: Send + Sync,
{
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let request_id = parts
            .headers
            .get("X-Request-ID")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string())
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

        let app_state = parts.extensions.get::<Arc<AppState>>().cloned();
        let pool = app_state.as_ref().map(|s| &s.biz_context.pool);

        let user_id = if let Ok(auth) = AuthExtractor::from_request_parts(parts, state).await {
            Some(EntityUserId::from(auth.user.id))
        } else {
            None
        };

        let org_id_opt = if let Ok(Some(oid)) = resolve_org_id(parts, pool).await {
            Some(EntityOrgId::from(oid))
        } else {
            None
        };

        let mut role = None;
        if let (Some(ref uid), Some(ref oid), Some(ref s)) = (&user_id, &org_id_opt, &app_state) {
            if let Ok(Some(member)) = cms_db::org::MemberQueries::get_by_user_and_org(
                &s.biz_context.pool,
                uid.as_str(),
                oid.as_str(),
            )
            .await
            {
                role = Some(member.role);
            }
        }

        Ok(RequestContext {
            request_id,
            user_id,
            org_id: org_id_opt,
            role,
        })
    }
}

async fn resolve_org_id(
    parts: &Parts,
    pool: Option<&cms_db::PgPool>,
) -> Result<Option<String>, AppError> {
    // 1. Check X-Org-ID / X-Organization-ID header
    if let Some(org_id) = parts
        .headers
        .get("X-Org-ID")
        .or_else(|| parts.headers.get("X-Organization-ID"))
    {
        if let Ok(s) = org_id.to_str() {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                return Ok(Some(trimmed.to_string()));
            }
        }
    }

    // 2. Check query string parameters
    if let Some(query) = parts.uri.query() {
        for pair in query.split('&') {
            if let Some((k, v)) = pair.split_once('=') {
                if k == "org_id" || k == "orgId" || k == "organizationId" {
                    if let Ok(decoded) = serde_urlencoded::from_str::<String>(&format!("v={}", v)) {
                        let trimmed = decoded.trim();
                        if !trimmed.is_empty() {
                            return Ok(Some(trimmed.to_string()));
                        }
                    } else if !v.trim().is_empty() {
                        return Ok(Some(v.trim().to_string()));
                    }
                }
            }
        }
    }

    // 3. Check path segments
    let path = parts.uri.path();
    let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    for i in 0..segments.len() {
        let seg = segments[i];
        if (seg == "orgs" || seg == "organizations" || seg == "workspaces") && i + 1 < segments.len() {
            let next = segments[i + 1].trim();
            if !next.is_empty() {
                return Ok(Some(next.to_string()));
            }
        } else if seg == "projects" && i + 1 < segments.len() {
            let project_id = segments[i + 1].trim();
            if !project_id.is_empty() {
                if let Some(p) = pool {
                    if let Some(project) =
                        cms_db::project::ProjectQueries::get_by_id(p, project_id).await?
                    {
                        return Ok(Some(project.organization_id));
                    }
                }
            }
        }
    }

    Ok(None)
}

#[cfg(test)]
mod tests {
    use axum::http::Request;

    use super::*;

    #[tokio::test]
    async fn test_resolve_org_id_from_header() {
        let req = Request::builder()
            .header("X-Org-ID", "org-header-123")
            .uri("/api/v1/test")
            .body(())
            .unwrap();
        let (parts, _) = req.into_parts();

        let resolved = resolve_org_id(&parts, None).await.unwrap();
        assert_eq!(resolved, Some("org-header-123".to_string()));
    }

    #[tokio::test]
    async fn test_resolve_org_id_from_path() {
        let req = Request::builder()
            .uri("/api/v1/organizations/org-path-456/members")
            .body(())
            .unwrap();
        let (parts, _) = req.into_parts();

        let resolved = resolve_org_id(&parts, None).await.unwrap();
        assert_eq!(resolved, Some("org-path-456".to_string()));
    }

    #[tokio::test]
    async fn test_resolve_org_id_from_query() {
        let req = Request::builder()
            .uri("/api/v1/reports?orgId=org-query-789")
            .body(())
            .unwrap();
        let (parts, _) = req.into_parts();

        let resolved = resolve_org_id(&parts, None).await.unwrap();
        assert_eq!(resolved, Some("org-query-789".to_string()));
    }
}
