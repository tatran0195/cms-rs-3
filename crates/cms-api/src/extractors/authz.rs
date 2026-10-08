//! Declarative Authorization Extractors and Matrix Guards
//!
//! Provides compile-time const generic extractors for Axum routes:
//! - `ProjectAuth<const R: u8, const A: u8>`
//! - `WorkspaceAuth<const R: u8, const A: u8>`
//! - `ProjectAuthContext`
//! - `WorkspaceAuthContext`

use std::{ops::Deref, sync::Arc};
use axum::{extract::FromRequestParts, http::request::Parts};
use cms_authz::{ProjectSecurityContext, WorkspaceSecurityContext};
use cms_entity::authz::{Action, ProjectResource, WorkspaceResource};
use cms_error::AppError;
use crate::{auth::AuthExtractor, AppState};

// Constants for readability in route definitions
pub const WORKSPACE_PROJECTS: u8 = 0;
pub const WORKSPACE_MEMBERS: u8 = 1;
pub const WORKSPACE_ROLES: u8 = 2;
pub const WORKSPACE_API_KEYS: u8 = 3;
pub const WORKSPACE_AUDIT_LOGS: u8 = 4;
pub const WORKSPACE_SETTINGS: u8 = 5;
pub const WORKSPACE_DANGER_ZONE: u8 = 6;

pub const PROJECT_PAGES: u8 = 0;
pub const PROJECT_BRANCHES: u8 = 1;
pub const PROJECT_DEPLOYMENTS: u8 = 2;
pub const PROJECT_DOMAINS: u8 = 3;
pub const PROJECT_OPENAPI: u8 = 4;
pub const PROJECT_ASSETS: u8 = 5;
pub const PROJECT_ADDONS: u8 = 6;
pub const PROJECT_MEMBERS: u8 = 7;
pub const PROJECT_ROLES: u8 = 8;
pub const PROJECT_ANALYTICS: u8 = 9;
pub const PROJECT_COMMENTS: u8 = 10;
pub const PROJECT_DANGER_ZONE: u8 = 11;

pub const ACTION_CREATE: u8 = 0;
pub const ACTION_READ: u8 = 1;
pub const ACTION_EDIT: u8 = 2;
pub const ACTION_DELETE: u8 = 3;
pub const ACTION_PUBLISH: u8 = 4;

/// Helper to resolve project ID from headers, path segments, or query string
pub async fn resolve_project_id(parts: &Parts) -> Result<Option<String>, AppError> {
    if let Some(project_id) = parts.headers.get("X-Project-ID") {
        let id_str = project_id
            .to_str()
            .map_err(|_| AppError::Unauthorized)?
            .trim();
        if !id_str.is_empty() {
            return Ok(Some(id_str.to_string()));
        }
    }

    let mut candidate_paths = Vec::new();
    if let Some(orig) = parts.extensions.get::<axum::extract::OriginalUri>() {
        candidate_paths.push(orig.0.path());
    }
    candidate_paths.push(parts.uri.path());

    for path in candidate_paths {
        let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
        for i in 0..segments.len() {
            if segments[i] == "projects" && i + 1 < segments.len() {
                let candidate = segments[i + 1].trim();
                if !candidate.is_empty() {
                    return Ok(Some(candidate.to_string()));
                }
            }
        }
    }

    if let Some(query) = parts.uri.query() {
        for pair in query.split('&') {
            if let Some((k, v)) = pair.split_once('=') {
                if k == "project_id" || k == "projectId" {
                    let trimmed = v.trim();
                    if !trimmed.is_empty() {
                        return Ok(Some(trimmed.to_string()));
                    }
                }
            }
        }
    }

    Ok(None)
}

/// Helper to resolve organization / workspace ID from headers, path segments, query, or project lookup
pub async fn resolve_workspace_id(
    parts: &Parts,
    pool: Option<&cms_db::PgPool>,
) -> Result<Option<String>, AppError> {
    if let Some(org_id) = parts
        .headers
        .get("X-Org-ID")
        .or_else(|| parts.headers.get("X-Organization-ID"))
        .or_else(|| parts.headers.get("X-Workspace-ID"))
    {
        if let Ok(s) = org_id.to_str() {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                return Ok(Some(trimmed.to_string()));
            }
        }
    }

    if let Some(query) = parts.uri.query() {
        for pair in query.split('&') {
            if let Some((k, v)) = pair.split_once('=') {
                if k == "org_id" || k == "orgId" || k == "organizationId" || k == "workspace_id" || k == "workspaceId" {
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

    let mut candidate_paths = Vec::new();
    if let Some(orig) = parts.extensions.get::<axum::extract::OriginalUri>() {
        candidate_paths.push(orig.0.path());
    }
    candidate_paths.push(parts.uri.path());

    for path in candidate_paths {
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
    }

    Ok(None)
}

/// Extractor for resolved ProjectSecurityContext without static permission assertion
#[derive(Debug, Clone)]
pub struct ProjectAuthContext(pub ProjectSecurityContext);

impl Deref for ProjectAuthContext {
    type Target = ProjectSecurityContext;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl<S> FromRequestParts<S> for ProjectAuthContext
where
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let app_state = parts
            .extensions
            .get::<Arc<AppState>>()
            .ok_or_else(|| AppError::Internal(anyhow::anyhow!("AppState not found in extensions")))?
            .clone();

        let auth = AuthExtractor::from_request_parts(parts, state).await?;
        let project_id = resolve_project_id(parts)
            .await?
            .ok_or_else(|| AppError::InvalidInput("Project context is required".to_string()))?;

        let ctx = app_state
            .biz_context
            .authz
            .get_project_context(&auth.user.id, &project_id)
            .await?;

        Ok(Self(ctx))
    }
}

/// Extractor for resolved WorkspaceSecurityContext without static permission assertion
#[derive(Debug, Clone)]
pub struct WorkspaceAuthContext(pub WorkspaceSecurityContext);

impl Deref for WorkspaceAuthContext {
    type Target = WorkspaceSecurityContext;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl<S> FromRequestParts<S> for WorkspaceAuthContext
where
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let app_state = parts
            .extensions
            .get::<Arc<AppState>>()
            .ok_or_else(|| AppError::Internal(anyhow::anyhow!("AppState not found in extensions")))?
            .clone();

        let auth = AuthExtractor::from_request_parts(parts, state).await?;
        let org_id = resolve_workspace_id(parts, Some(&app_state.biz_context.pool))
            .await?
            .ok_or_else(|| AppError::InvalidInput("Workspace context is required".to_string()))?;

        let ctx = app_state
            .biz_context
            .authz
            .get_workspace_context(&auth.user.id, &org_id)
            .await?;

        Ok(Self(ctx))
    }
}

/// Declarative guard asserting Project permission at the HTTP boundary
#[derive(Debug, Clone)]
pub struct ProjectAuth<const R: u8, const A: u8>(pub ProjectSecurityContext);

impl<const R: u8, const A: u8> Deref for ProjectAuth<R, A> {
    type Target = ProjectSecurityContext;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl<S, const R: u8, const A: u8> FromRequestParts<S> for ProjectAuth<R, A>
where
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let resource = ProjectResource::from_u8(R)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Invalid project resource code: {}", e)))?;
        let action = Action::from_u8(A)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Invalid action code: {}", e)))?;

        let context = ProjectAuthContext::from_request_parts(parts, state).await?.0;
        context.require(resource, action)?;

        Ok(Self(context))
    }
}

/// Declarative guard asserting Workspace permission at the HTTP boundary
#[derive(Debug, Clone)]
pub struct WorkspaceAuth<const R: u8, const A: u8>(pub WorkspaceSecurityContext);

impl<const R: u8, const A: u8> Deref for WorkspaceAuth<R, A> {
    type Target = WorkspaceSecurityContext;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl<S, const R: u8, const A: u8> FromRequestParts<S> for WorkspaceAuth<R, A>
where
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let resource = WorkspaceResource::from_u8(R)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Invalid workspace resource code: {}", e)))?;
        let action = Action::from_u8(A)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Invalid action code: {}", e)))?;

        let context = WorkspaceAuthContext::from_request_parts(parts, state).await?.0;
        context.require(resource, action)?;

        Ok(Self(context))
    }
}

#[cfg(test)]
mod tests {
    use axum::http::Request;
    use super::*;

    #[tokio::test]
    async fn test_resolve_project_id_from_header() {
        let req = Request::builder()
            .header("X-Project-ID", "proj-hdr-123")
            .uri("/api/v1/test")
            .body(())
            .unwrap();
        let (parts, _) = req.into_parts();

        let resolved = resolve_project_id(&parts).await.unwrap();
        assert_eq!(resolved, Some("proj-hdr-123".to_string()));
    }

    #[tokio::test]
    async fn test_resolve_project_id_from_path() {
        let req = Request::builder()
            .uri("/api/v1/projects/proj-path-456/pages")
            .body(())
            .unwrap();
        let (parts, _) = req.into_parts();

        let resolved = resolve_project_id(&parts).await.unwrap();
        assert_eq!(resolved, Some("proj-path-456".to_string()));
    }

    #[tokio::test]
    async fn test_resolve_project_id_from_query() {
        let req = Request::builder()
            .uri("/api/v1/pages?project_id=proj-query-789")
            .body(())
            .unwrap();
        let (parts, _) = req.into_parts();

        let resolved = resolve_project_id(&parts).await.unwrap();
        assert_eq!(resolved, Some("proj-query-789".to_string()));
    }

    #[tokio::test]
    async fn test_resolve_workspace_id_from_header() {
        let req = Request::builder()
            .header("X-Workspace-ID", "ws-hdr-101")
            .uri("/api/v1/test")
            .body(())
            .unwrap();
        let (parts, _) = req.into_parts();

        let resolved = resolve_workspace_id(&parts, None).await.unwrap();
        assert_eq!(resolved, Some("ws-hdr-101".to_string()));
    }

    #[tokio::test]
    async fn test_resolve_workspace_id_from_path() {
        let req = Request::builder()
            .uri("/api/v1/workspaces/ws-path-202/roles")
            .body(())
            .unwrap();
        let (parts, _) = req.into_parts();

        let resolved = resolve_workspace_id(&parts, None).await.unwrap();
        assert_eq!(resolved, Some("ws-path-202".to_string()));
    }

    #[tokio::test]
    async fn test_resolve_workspace_id_from_query() {
        let req = Request::builder()
            .uri("/api/v1/roles?workspace_id=ws-query-303")
            .body(())
            .unwrap();
        let (parts, _) = req.into_parts();

        let resolved = resolve_workspace_id(&parts, None).await.unwrap();
        assert_eq!(resolved, Some("ws-query-303".to_string()));
    }

    #[test]
    fn test_const_generic_mapping_validity() {
        assert_eq!(ProjectResource::from_u8(PROJECT_PAGES).unwrap(), ProjectResource::Pages);
        assert_eq!(ProjectResource::from_u8(PROJECT_ROLES).unwrap(), ProjectResource::Roles);
        assert_eq!(WorkspaceResource::from_u8(WORKSPACE_SETTINGS).unwrap(), WorkspaceResource::Settings);
        assert_eq!(Action::from_u8(ACTION_CREATE).unwrap(), Action::Create);
        assert_eq!(Action::from_u8(ACTION_PUBLISH).unwrap(), Action::Publish);
    }
}
