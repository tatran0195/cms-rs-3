//! Authentication and Authorization entity types

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use validator::Validate;

use crate::common::Id;

/// User entity (simplified from Prisma User model)
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct User {
    pub id: Id,
    pub email: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<String>,
    pub email_verified: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// User create request
#[derive(Debug, Clone, Deserialize, Serialize, Validate, utoipa::ToSchema, ts_rs::TS)]
pub struct CreateUserRequest {
    #[validate(email(message = "Invalid email format"))]
    pub email: String,
    #[validate(length(min = 8, message = "Password must be at least 8 characters"))]
    pub password: Option<String>,
    #[serde(default)]
    #[validate(length(max = 100, message = "Name must be at most 100 characters"))]
    pub name: Option<String>,
    #[serde(default)]
    #[validate(url(message = "Invalid image URL"))]
    pub image: Option<String>,
}

/// Register request (alias for CreateUserRequest)
pub type RegisterRequest = CreateUserRequest;

/// User update request
#[derive(Debug, Clone, Deserialize, Serialize, Validate, utoipa::ToSchema, ts_rs::TS)]
pub struct UpdateUserRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    #[validate(length(max = 100, message = "Name must be at most 100 characters"))]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[validate(url(message = "Invalid image URL"))]
    pub image: Option<String>,
}

/// User response (with sensitive fields removed)
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct UserResponse {
    pub id: Id,
    pub email: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<String>,
    pub email_verified: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<User> for UserResponse {
    fn from(user: User) -> Self {
        Self {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
            email_verified: user.email_verified,
            created_at: user.created_at,
            updated_at: user.updated_at,
        }
    }
}

/// Session entity
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct Session {
    pub id: Id,
    pub user_id: Id,
    pub session_token: String,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Session response
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct SessionResponse {
    pub id: Id,
    pub user_id: Id,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

/// Account entity (for OAuth providers)
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct Account {
    pub id: Id,
    pub user_id: Id,
    pub provider: String,
    pub provider_account_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub access_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Verification token entity
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct VerificationToken {
    pub id: Id,
    pub identifier: String,
    pub token: String,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

/// API Key entity
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct ApiKey {
    pub id: Id,
    pub user_id: Id,
    pub name: String,
    pub key: String, // This is the hashed key, not the plaintext
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_used_at: Option<DateTime<Utc>>,
}

/// API Key create request
#[derive(Debug, Clone, Deserialize, Serialize, Validate, utoipa::ToSchema, ts_rs::TS)]
pub struct CreateApiKeyRequest {
    #[validate(length(
        min = 1,
        max = 100,
        message = "Name must be between 1 and 100 characters"
    ))]
    pub name: String,
}

/// API Key response (without the actual key)
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct ApiKeyResponse {
    pub id: Id,
    pub user_id: Id,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_used_at: Option<DateTime<Utc>>,
}

impl From<ApiKey> for ApiKeyResponse {
    fn from(key: ApiKey) -> Self {
        Self {
            id: key.id,
            user_id: key.user_id,
            name: key.name,
            created_at: key.created_at,
            updated_at: key.updated_at,
            last_used_at: key.last_used_at,
        }
    }
}

/// API Key with secret (only returned on creation)
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct ApiKeyWithSecretResponse {
    #[serde(flatten)]
    pub key: ApiKeyResponse,
    pub secret: String, // The plaintext key, only shown once
}

/// Login request
#[derive(Debug, Clone, Deserialize, Serialize, Validate, utoipa::ToSchema, ts_rs::TS)]
pub struct LoginRequest {
    #[validate(email(message = "Invalid email format"))]
    pub email: String,
    #[validate(length(min = 1, message = "Password is required"))]
    pub password: String,
}

/// Login response
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct LoginResponse {
    pub user: UserResponse,
    pub session: SessionResponse,
}

/// OAuth login request
#[derive(Debug, Clone, Deserialize, Serialize, utoipa::ToSchema, ts_rs::TS)]
pub struct OAuthLoginRequest {
    pub provider: String,
    pub code: String,
    pub redirect_uri: String,
}

/// Token refresh request
#[derive(Debug, Clone, Deserialize, Serialize, utoipa::ToSchema, ts_rs::TS)]
pub struct RefreshTokenRequest {
    pub refresh_token: String,
}

/// Token refresh response
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct RefreshTokenResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: DateTime<Utc>,
}

/// Authenticated user information (from session or API key)
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct AuthenticatedUser {
    pub user_id: Id,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub org_id: Option<Id>,
    pub is_api_key: bool,
}

/// Reader JWT claims
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct ReaderJwtClaims {
    pub reader_id: Id,
    pub project_id: Id,
    pub audience_id: Id,
    pub exp: i64,
    pub nbf: i64,
    pub jti: String, // JWT ID for replay protection
}

/// JWT access provider entity
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct JwtAccessProvider {
    pub id: Id,
    pub name: String,
    pub issuer: String,
    pub audience: String,
    pub secret: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// JWT replay tracking entity
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct JwtReplay {
    pub id: Id,
    pub jwt_id: String,
    pub provider_id: Id,
    pub used_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

/// Project API key response matching SPA ApiKey shape
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectApiKeyResponse {
    pub id: Id,
    pub name: String,
    pub last_four: String,
    pub scopes: Vec<String>,
    pub created_at: String,
    pub last_used_at: Option<String>,
    pub expires_at: Option<String>,
    pub revoked_at: Option<String>,
    pub rotated_from_id: Option<String>,
    pub legacy: bool,
    pub state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub secret: Option<String>,
}

/// Authenticated user representation matching Better-Auth / SPA client format
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct AuthUser {
    pub id: Id,
    pub email: String,
    #[ts(optional = nullable)]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[ts(optional = nullable)]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image: Option<String>,
    #[ts(optional)]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub email_verified: Option<bool>,
    #[ts(optional)]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<DateTime<Utc>>,
    #[ts(optional)]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<DateTime<Utc>>,
}

impl From<&User> for AuthUser {
    fn from(user: &User) -> Self {
        Self {
            id: user.id.clone(),
            email: user.email.clone(),
            name: user.name.clone(),
            image: user.image.clone(),
            email_verified: Some(user.email_verified),
            created_at: Some(user.created_at),
            updated_at: Some(user.updated_at),
        }
    }
}

impl From<User> for AuthUser {
    fn from(user: User) -> Self {
        Self::from(&user)
    }
}

/// Authenticated session representation matching Better-Auth / SPA client format
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct AuthSession {
    pub id: Id,
    pub user_id: Id,
    #[ts(optional)]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
    #[ts(optional)]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<DateTime<Utc>>,
}

/// Active auth session payload containing both user and session
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct AuthSessionData {
    pub user: AuthUser,
    pub session: AuthSession,
}

/// Send email verification OTP request payload
#[derive(Debug, Clone, Serialize, Deserialize, Validate, utoipa::ToSchema, ts_rs::TS)]
pub struct SendVerificationOtpPayload {
    #[validate(email(message = "Invalid email format"))]
    pub email: String,
    #[serde(rename = "type", default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub otp_type: Option<String>,
}

/// Verify email OTP request payload
#[derive(Debug, Clone, Serialize, Deserialize, Validate, utoipa::ToSchema, ts_rs::TS)]
pub struct VerifyEmailOtpPayload {
    #[validate(email(message = "Invalid email format"))]
    pub email: String,
    pub otp: String,
}

/// Sign in via email OTP request payload
#[derive(Debug, Clone, Serialize, Deserialize, Validate, utoipa::ToSchema, ts_rs::TS)]
pub struct SignInEmailOtpPayload {
    #[validate(email(message = "Invalid email format"))]
    pub email: String,
    pub otp: String,
    #[ts(optional)]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

/// Request email change OTP payload
#[derive(Debug, Clone, Serialize, Deserialize, Validate, utoipa::ToSchema, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct RequestEmailChangePayload {
    #[validate(email(message = "Invalid email format"))]
    pub new_email: String,
    pub otp: String,
}

/// Confirm email change with OTP payload
#[derive(Debug, Clone, Serialize, Deserialize, Validate, utoipa::ToSchema, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct ChangeEmailPayload {
    #[validate(email(message = "Invalid email format"))]
    pub new_email: String,
    pub otp: String,
}

/// Social sign-in request payload
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct SignInSocialPayload {
    pub provider: String,
    #[serde(rename = "callbackURL", alias = "callbackUrl", default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub callback_url: Option<String>,
}

/// Social sign-in response
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct SignInSocialResponse {
    pub url: String,
    pub redirect: bool,
    pub state: String,
    #[ts(optional)]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub code_challenge: Option<String>,
}

/// Update user profile attributes payload
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct UpdateUserPayload {
    #[ts(optional)]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[ts(optional)]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image: Option<String>,
}

/// Accept organization invitation payload
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct AcceptInvitationPayload {
    pub invitation_id: String,
}


#[cfg(test)]
mod tests {

    use super::*;

    #[test]
    fn test_user_response_conversion() {
        let user = User {
            id: "user-1".to_string(),
            email: "test@example.com".to_string(),
            name: Some("Test User".to_string()),
            image: Some("https://example.com/avatar.png".to_string()),
            email_verified: true,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        let response: UserResponse = user.into();
        assert_eq!(response.id, "user-1");
        assert_eq!(response.email, "test@example.com");
        assert_eq!(response.name, Some("Test User".to_string()));
    }
}
