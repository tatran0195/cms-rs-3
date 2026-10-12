//! Authorization Domain Types for Project Members

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use ts_rs::TS;

/// Member of a Project
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, TS)]
pub struct ProjectMember {
    pub id: String,
    pub project_id: String,
    pub user_id: String,
    pub role: String, // "owner" | "member"
    pub role_id: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

/// DTO to add a user to a project
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, TS)]
pub struct AddProjectMemberRequest {
    pub user_id: String,
    #[serde(default = "default_member_role")]
    pub role: String,
    pub role_id: Option<String>,
}

fn default_member_role() -> String {
    "member".to_string()
}

/// DTO to update a project member's role
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, TS)]
pub struct UpdateProjectMemberRequest {
    pub role: Option<String>,
    pub role_id: Option<String>,
}
