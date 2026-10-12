//! Authentication middleware
//!
//! This module provides middleware for extracting and validating authentication
//! from requests (sessions, JWT tokens, API keys).

use std::sync::Arc;

use axum::{
    extract::FromRequestParts,
    http::{header, request::Parts, StatusCode},
    response::{IntoResponse, Response},
};
use axum_extra::extract::cookie::Cookie;
use cms_biz::auth::AuthService;
use cms_entity::auth::UserResponse;
use cms_error::AppError;
use cms_middleware::app_state::AppState;

/// Authentication extractor
/// Authentication extractor
///
/// This extractor tries the user in the following order:
/// 1. Access token cookie (`access_token`) or Session cookie (`session_token`)
/// 2. Bearer token (JWT or API key)
/// 3. API key (X-API-Key header)
#[derive(Debug, Clone)]
pub struct AuthExtractor {
    pub user: UserResponse,
    pub auth_method: AuthMethod,
    pub claims: cms_auth::Claims,
}

impl AuthExtractor {
    /// Return the Zanzibar authorization context for this caller.
    pub fn authz_context(&self) -> cms_authz::AuthzContext {
        let is_bypass = self.claims.role == "super_admin"
            || self.claims.role == "owner"
            || self.claims.role == "admin";
        cms_authz::AuthzContext::new(self.claims.sub, self.claims.role.clone(), is_bypass)
    }

    pub fn user_uuid(&self) -> uuid::Uuid {
        self.claims.sub
    }
}

/// Authentication method used
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthMethod {
    Session,
    Jwt,
    ApiKey,
    None,
}

impl<S> FromRequestParts<S> for AuthExtractor
where
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        // Get AppState from extensions
        let state = parts
            .extensions
            .get::<Arc<AppState>>()
            .ok_or_else(|| AppError::Internal(anyhow::anyhow!("AppState not found in extensions")))?
            .clone();

        // Try session cookie first
        if let Ok((user, claims)) = extract_from_session(parts, &state).await {
            return Ok(AuthExtractor {
                user,
                auth_method: AuthMethod::Session,
                claims,
            });
        }

        // Try Bearer token (JWT or API key)
        if let Ok((user, claims)) = extract_from_jwt(parts, &state).await {
            return Ok(AuthExtractor {
                user,
                auth_method: AuthMethod::Jwt,
                claims,
            });
        }

        // Try API key header
        if let Ok((user, claims)) = extract_from_api_key(parts, &state).await {
            return Ok(AuthExtractor {
                user,
                auth_method: AuthMethod::ApiKey,
                claims,
            });
        }

        Err(AppError::Unauthorized)
    }
}

/// Extract user and claims from session or access_token cookie
async fn extract_from_session(
    parts: &mut Parts,
    state: &Arc<AppState>,
) -> Result<(UserResponse, cms_auth::Claims), AppError> {
    let cookie_header = parts
        .headers
        .get(header::COOKIE)
        .ok_or(AppError::Unauthorized)?;

    let cookie_str = cookie_header.to_str().map_err(|_| AppError::Unauthorized)?;

    // Try access_token first (15-minute JWT cookie)
    if let Some(access_tok) = cms_auth::parse_cookie_value(cookie_str, "access_token") {
        if let Ok(claims) =
            cms_auth::decode_jwt(access_tok, state.config.auth.session_secret.as_bytes())
        {
            if let Ok(Some(u)) =
                cms_db::auth::UserQueries::get_by_id(&state.biz_context.pool, &claims.user_id_string()).await
            {
                return Ok((u.into(), claims));
            }
        }
    }

    // Try legacy session cookie
    let session_token = Cookie::split_parse(cookie_str)
        .find_map(|c| {
            c.ok()
                .filter(|c| c.name() == cms_config::auth::SESSION_COOKIE_NAME)
                .map(|c| c.value().to_string())
        })
        .ok_or(AppError::Unauthorized)?;

    let user = AuthService::get_user_by_session(&state.biz_context, &session_token).await?;
    let user_uuid = uuid::Uuid::parse_str(&user.id).unwrap_or_else(|_| uuid::Uuid::nil());
    let claims = cms_auth::Claims::new_access(user_uuid, "member");
    Ok((user, claims))
}

/// Extract user and claims from JWT or Bearer API key
async fn extract_from_jwt(
    parts: &mut Parts,
    state: &Arc<AppState>,
) -> Result<(UserResponse, cms_auth::Claims), AppError> {
    let auth_header = parts
        .headers
        .get(header::AUTHORIZATION)
        .ok_or(AppError::Unauthorized)?;

    let auth_value = auth_header.to_str().map_err(|_| AppError::Unauthorized)?;

    if !auth_value.starts_with("Bearer ") {
        return Err(AppError::Unauthorized);
    }

    let token = &auth_value[7..];

    // Check if Bearer is machine API key
    if cms_api_keys::looks_like_key(token) {
        let user = AuthService::get_user_by_api_key(&state.biz_context, token).await?;
        let user_uuid = uuid::Uuid::parse_str(&user.id).unwrap_or_else(|_| uuid::Uuid::nil());
        let claims = cms_auth::Claims::new_access(user_uuid, "member");
        return Ok((user, claims));
    }

    // Otherwise validate as JWT claims
    if let Ok(claims) =
        cms_auth::decode_jwt(token, state.config.auth.session_secret.as_bytes())
    {
        if let Ok(Some(u)) =
            cms_db::auth::UserQueries::get_by_id(&state.biz_context.pool, &claims.user_id_string()).await
        {
            return Ok((u.into(), claims));
        }
    }

    // Fall back to legacy JWT lookup
    let user = AuthService::get_user_by_jwt(&state.biz_context, token).await?;
    let user_uuid = uuid::Uuid::parse_str(&user.id).unwrap_or_else(|_| uuid::Uuid::nil());
    let claims = cms_auth::Claims::new_access(user_uuid, "member");
    Ok((user, claims))
}

/// Extract user and claims from API key header
async fn extract_from_api_key(
    parts: &mut Parts,
    state: &Arc<AppState>,
) -> Result<(UserResponse, cms_auth::Claims), AppError> {
    let api_key_header = parts
        .headers
        .get("X-API-Key")
        .ok_or(AppError::Unauthorized)?;

    let api_key = api_key_header
        .to_str()
        .map_err(|_| AppError::Unauthorized)?;

    let user = AuthService::get_user_by_api_key(&state.biz_context, api_key).await?;
    let user_uuid = uuid::Uuid::parse_str(&user.id).unwrap_or_else(|_| uuid::Uuid::nil());
    let claims = cms_auth::Claims::new_access(user_uuid, "member");
    Ok((user, claims))
}

/// Optional authentication extractor
///
/// This extractor attempts authentication but doesn't fail if not present.
/// Useful for public routes that can optionally use authentication.
#[derive(Debug, Clone)]
pub struct OptionalAuthExtractor {
    pub user: Option<UserResponse>,
    pub auth_method: Option<AuthMethod>,
    pub claims: Option<cms_auth::Claims>,
}

impl<S> FromRequestParts<S> for OptionalAuthExtractor
where
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let state = parts
            .extensions
            .get::<Arc<AppState>>()
            .ok_or_else(|| AppError::Internal(anyhow::anyhow!("AppState not found in extensions")))?
            .clone();

        if let Ok((user, claims)) = extract_from_session(parts, &state).await {
            return Ok(OptionalAuthExtractor {
                user: Some(user),
                auth_method: Some(AuthMethod::Session),
                claims: Some(claims),
            });
        }

        if let Ok((user, claims)) = extract_from_jwt(parts, &state).await {
            return Ok(OptionalAuthExtractor {
                user: Some(user),
                auth_method: Some(AuthMethod::Jwt),
                claims: Some(claims),
            });
        }

        if let Ok((user, claims)) = extract_from_api_key(parts, &state).await {
            return Ok(OptionalAuthExtractor {
                user: Some(user),
                auth_method: Some(AuthMethod::ApiKey),
                claims: Some(claims),
            });
        }

        Ok(OptionalAuthExtractor {
            user: None,
            auth_method: None,
            claims: None,
        })
    }
}

/// Authentication middleware for requiring authentication
pub struct RequireAuthMiddleware;

impl Default for RequireAuthMiddleware {
    fn default() -> Self {
        Self::new()
    }
}

impl RequireAuthMiddleware {
    pub fn new() -> Self {
        Self
    }
}

/// Authentication rejection
#[derive(Debug, Clone)]
pub struct AuthRejection;

impl IntoResponse for AuthRejection {
    fn into_response(self) -> Response {
        (StatusCode::UNAUTHORIZED, "Authentication required").into_response()
    }
}

/// Require specific role middleware
pub struct RequireRoleMiddleware {
    pub role: cms_entity::common::MemberRole,
}

impl RequireRoleMiddleware {
    pub fn new(role: cms_entity::common::MemberRole) -> Self {
        Self { role }
    }
}

/// Role requirement rejection
#[derive(Debug, Clone)]
pub struct RoleRejection;

impl IntoResponse for RoleRejection {
    fn into_response(self) -> Response {
        (StatusCode::FORBIDDEN, "Insufficient permissions").into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_auth_method_equality() {
        assert_eq!(AuthMethod::Session, AuthMethod::Session);
        assert_ne!(AuthMethod::Session, AuthMethod::Jwt);
        assert_ne!(AuthMethod::ApiKey, AuthMethod::None);
    }
}
