//! Setup entity and request/response types

use serde::{Deserialize, Serialize};
use validator::Validate;
use crate::auth::UserResponse;

/// Public setup status response
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct SetupStatusResponse {
    pub is_initialized: bool,
    pub requires_setup: bool,
    pub configured_oauth_providers: Vec<String>,
}

/// Request payload to complete onboarding setup
#[derive(Debug, Clone, Deserialize, Serialize, Validate, utoipa::ToSchema, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct CompleteSetupRequest {
    #[validate(length(min = 2, message = "Admin name must be at least 2 characters"))]
    pub admin_name: String,
    #[validate(email(message = "Invalid email format"))]
    pub admin_email: String,
    #[validate(length(min = 8, message = "Password must be at least 8 characters"))]
    pub admin_password: String,

    #[validate(length(min = 2, message = "Workspace name must be at least 2 characters"))]
    pub workspace_name: String,
    #[validate(length(min = 2, message = "Workspace slug must be at least 2 characters"))]
    pub workspace_slug: String,
    pub workspace_logo_url: Option<String>,
    pub workspace_description: Option<String>,

    pub allow_public_signup: bool,
    pub require_email_verification: bool,
    pub enabled_oauth_providers: Vec<String>,

    pub default_theme: String,
    pub default_locale: String,
}

/// Setup completion response
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct CompleteSetupResponse {
    pub success: bool,
    pub user: UserResponse,
    pub redirect_url: String,
}
