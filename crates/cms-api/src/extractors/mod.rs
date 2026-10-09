//! Common extractors for API handlers

use std::ops::Deref;

use axum::{extract::FromRequestParts, http::request::Parts};
use cms_entity::id::{ProjectId as EntityProjectId, UserId as EntityUserId};
use cms_error::AppError;

use crate::auth::AuthExtractor;

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
}

impl RequestContext {
    pub fn new(
        request_id: impl Into<String>,
        user_id: Option<EntityUserId>,
    ) -> Self {
        Self {
            request_id: request_id.into(),
            user_id,
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

        let user_id = if let Ok(auth) = AuthExtractor::from_request_parts(parts, state).await {
            Some(EntityUserId::from(auth.user.id))
        } else {
            None
        };

        Ok(RequestContext {
            request_id,
            user_id,
        })
    }
}
