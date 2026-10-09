//! Workspace entity and request/response types

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use validator::Validate;

/// Workspace settings response for /api/app/workspace
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSettingsResponse {
    pub name: String,
    pub slug: String,
    #[serde(default)]
    pub notifications: std::collections::HashMap<String, bool>,
    #[serde(default)]
    pub integrations: std::collections::HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub git: std::collections::HashMap<String, serde_json::Value>,
    pub project_count: i64,
    pub member_count: i64,
}

/// Workspace settings update request for PATCH /api/app/workspace
#[derive(Debug, Clone, Deserialize, Serialize, Validate, utoipa::ToSchema, ts_rs::TS)]
pub struct UpdateWorkspaceSettingsRequest {
    pub name: Option<String>,
    pub logo: Option<String>,
    #[serde(alias = "logoUrl")]
    pub logo_url: Option<String>,
    pub description: Option<String>,
}

/// Workspace member user info in /api/app/members
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceMemberUser {
    pub id: String,
    pub name: Option<String>,
    pub email: String,
    pub image: Option<String>,
}

/// Workspace member item in /api/app/members
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceMemberItem {
    pub id: String,
    pub user_id: String,
    pub role: String,
    pub created_at: DateTime<Utc>,
    pub user: WorkspaceMemberUser,
}

/// Workspace invitation response
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInvitationItem {
    pub id: String,
    pub email: String,
    pub role: String,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

/// Workspace members response for /api/app/members
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceMembersResponse {
    pub members: Vec<WorkspaceMemberItem>,
    pub invitations: Vec<WorkspaceInvitationItem>,
}

/// Workspace analytics response for /api/app/workspace/analytics
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceAnalyticsResponse {
    pub availability: String,
    pub total_views: i64,
    pub unique_visitors: i64,
    pub views_previous_period: i64,
    pub visitors_previous_period: i64,
    pub views_change_pct: f64,
    pub visitors_change_pct: f64,
    pub avg_duration_seconds: i64,
    pub timeseries: Vec<serde_json::Value>,
    pub top_pages: Vec<serde_json::Value>,
    pub top_referrers: Vec<serde_json::Value>,
    pub top_countries: Vec<serde_json::Value>,
    pub top_searches: Vec<serde_json::Value>,
    pub referrers: Vec<serde_json::Value>,
    pub languages: Vec<serde_json::Value>,
    pub devices: Vec<serde_json::Value>,
    pub engagement: serde_json::Value,
    pub searches: serde_json::Value,
    pub ai: serde_json::Value,
    pub no_answer_reasons: Vec<serde_json::Value>,
}

/// Workspace invite member request for POST /api/app/members/invite
#[derive(Debug, Clone, Deserialize, Serialize, Validate, utoipa::ToSchema, ts_rs::TS)]
pub struct InviteWorkspaceMemberRequest {
    #[validate(email(message = "Invalid email format"))]
    pub email: String,
    pub role: Option<String>,
}

/// Workspace invitation created response
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInvitationResponse {
    pub id: String,
    pub email: String,
    pub role: String,
    pub expires_at: String,
    pub created_at: String,
}

/// Workspace mutation success response (remove member, cancel invitation)
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct WorkspaceMutationResponse {
    pub success: bool,
    pub id: String,
}

/// Request to update a workspace member's role
#[derive(Debug, Clone, Default, Deserialize, Serialize, utoipa::ToSchema, ts_rs::TS)]
pub struct UpdateWorkspaceMemberRoleRequest {
    pub role: Option<String>,
}
