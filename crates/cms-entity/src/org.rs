//! Organization entity types

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use validator::Validate;

use crate::common::{Id, MemberRole, PaginatedResponse};

/// Organization entity
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct Organization {
    pub id: Id,
    pub name: String,
    pub slug: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub logo: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Organization create request
#[derive(Debug, Clone, Deserialize, Serialize, Validate, utoipa::ToSchema)]
pub struct CreateOrganizationRequest {
    #[validate(length(
        min = 1,
        max = 100,
        message = "Organization name must be between 1 and 100 characters"
    ))]
    pub name: String,
    #[serde(default)]
    #[validate(length(max = 500, message = "Description must be at most 500 characters"))]
    pub description: Option<String>,
}

/// Organization update request
#[derive(Debug, Clone, Deserialize, Serialize, Validate, utoipa::ToSchema)]
pub struct UpdateOrganizationRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    #[validate(length(
        min = 1,
        max = 100,
        message = "Organization name must be between 1 and 100 characters"
    ))]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[validate(length(max = 500, message = "Description must be at most 500 characters"))]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[validate(url(message = "Invalid logo URL"))]
    pub logo: Option<String>,
}

/// Organization response
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct OrganizationResponse {
    pub id: Id,
    pub name: String,
    pub slug: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub logo: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<Organization> for OrganizationResponse {
    fn from(org: Organization) -> Self {
        Self {
            id: org.id,
            name: org.name,
            slug: org.slug,
            description: org.description,
            logo: org.logo,
            created_at: org.created_at,
            updated_at: org.updated_at,
        }
    }
}

/// Member entity (user's membership in an organization)
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct Member {
    pub id: Id,
    pub user_id: Id,
    pub organization_id: Id,
    pub role: MemberRole,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Member response
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct MemberResponse {
    pub id: Id,
    pub user_id: Id,
    pub organization_id: Id,
    pub role: MemberRole,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<Member> for MemberResponse {
    fn from(member: Member) -> Self {
        Self {
            id: member.id,
            user_id: member.user_id,
            organization_id: member.organization_id,
            role: member.role,
            created_at: member.created_at,
            updated_at: member.updated_at,
        }
    }
}

/// Member with user information
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct MemberWithUserResponse {
    #[serde(flatten)]
    pub member: MemberResponse,
    pub user: crate::auth::UserResponse,
}

/// Invitation entity
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct Invitation {
    pub id: Id,
    pub organization_id: Id,
    pub email: String,
    pub role: MemberRole,
    pub token: String,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Invitation create request
#[derive(Debug, Clone, Deserialize, Serialize, Validate, utoipa::ToSchema)]
pub struct CreateInvitationRequest {
    #[validate(email(message = "Invalid email format"))]
    pub email: String,
    #[serde(default = "default_invitation_role")]
    pub role: MemberRole,
}

fn default_invitation_role() -> MemberRole {
    MemberRole::Member
}

/// Invitation response
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct InvitationResponse {
    pub id: Id,
    pub organization_id: Id,
    pub email: String,
    pub role: MemberRole,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

impl From<Invitation> for InvitationResponse {
    fn from(invitation: Invitation) -> Self {
        Self {
            id: invitation.id,
            organization_id: invitation.organization_id,
            email: invitation.email,
            role: invitation.role,
            expires_at: invitation.expires_at,
            created_at: invitation.created_at,
        }
    }
}

/// Accept invitation request
#[derive(Debug, Clone, Deserialize, Serialize, Validate, utoipa::ToSchema)]
pub struct AcceptInvitationRequest {
    #[validate(length(min = 1, message = "Token is required"))]
    pub token: String,
    #[validate(length(min = 8, message = "Password must be at least 8 characters"))]
    pub password: Option<String>,
}

/// List members query parameters
#[derive(Debug, Clone, Deserialize, Serialize, utoipa::ToSchema)]
pub struct ListMembersQuery {
    #[serde(default)]
    pub role: Option<MemberRole>,
    #[serde(default)]
    pub search: Option<String>,
}

/// List members response
pub type ListMembersResponse = PaginatedResponse<MemberWithUserResponse>;

/// List invitations response
pub type ListInvitationsResponse = PaginatedResponse<InvitationResponse>;

/// Workspace settings response for /api/app/workspace
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
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
#[derive(Debug, Clone, Deserialize, Serialize, Validate, utoipa::ToSchema)]
pub struct UpdateWorkspaceSettingsRequest {
    pub name: Option<String>,
    pub logo: Option<String>,
    #[serde(alias = "logoUrl")]
    pub logo_url: Option<String>,
    pub description: Option<String>,
}

/// Workspace member user info in /api/app/members
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceMemberUser {
    pub id: String,
    pub name: Option<String>,
    pub email: String,
    pub image: Option<String>,
}

/// Workspace member item in /api/app/members
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceMemberItem {
    pub id: String,
    pub organization_id: String,
    pub user_id: String,
    pub role: String,
    pub created_at: DateTime<Utc>,
    pub user: WorkspaceMemberUser,
}

/// Workspace members response for /api/app/members
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceMembersResponse {
    pub members: Vec<WorkspaceMemberItem>,
    pub invitations: Vec<InvitationResponse>,
}

/// Workspace analytics response for /api/app/workspace/analytics
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
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
#[derive(Debug, Clone, Deserialize, Serialize, Validate, utoipa::ToSchema)]
pub struct InviteWorkspaceMemberRequest {
    #[validate(email(message = "Invalid email format"))]
    pub email: String,
    pub role: Option<String>,
}

/// Workspace invitation created response
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInvitationResponse {
    pub id: String,
    pub organization_id: String,
    pub email: String,
    pub role: String,
    pub expires_at: String,
    pub created_at: String,
}

/// Workspace mutation success response (remove member, cancel invitation)
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct WorkspaceMutationResponse {
    pub success: bool,
    pub id: String,
}

/// Request to update a workspace member's role
#[derive(Debug, Clone, Default, Deserialize, Serialize, utoipa::ToSchema)]
pub struct UpdateWorkspaceMemberRoleRequest {
    pub role: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_member_role_default() {
        let request = CreateInvitationRequest {
            email: "test@example.com".to_string(),
            role: MemberRole::Admin,
        };
        assert_eq!(request.role, MemberRole::Admin);
    }
}
