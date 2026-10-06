//! Comment entity types

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use validator::Validate;

use crate::common::Id;

/// Comment entity
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct Comment {
    pub id: Id,
    pub page_id: Id,
    pub user_id: Option<Id>,
    pub reader_id: Option<Id>,
    pub parent_id: Option<Id>,
    pub content: String,
    pub resolved: bool,
    pub resolved_at: Option<DateTime<Utc>>,
    pub resolved_by: Option<Id>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Comment response
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct CommentResponse {
    pub id: Id,
    pub page_id: Id,
    pub user_id: Option<Id>,
    pub reader_id: Option<Id>,
    pub parent_id: Option<Id>,
    pub content: String,
    pub resolved: bool,
    pub resolved_at: Option<DateTime<Utc>>,
    pub resolved_by: Option<Id>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<Comment> for CommentResponse {
    fn from(comment: Comment) -> Self {
        Self {
            id: comment.id,
            page_id: comment.page_id,
            user_id: comment.user_id,
            reader_id: comment.reader_id,
            parent_id: comment.parent_id,
            content: comment.content,
            resolved: comment.resolved,
            resolved_at: comment.resolved_at,
            resolved_by: comment.resolved_by,
            created_at: comment.created_at,
            updated_at: comment.updated_at,
        }
    }
}

/// Create comment request
#[derive(Debug, Clone, Deserialize, Serialize, Validate, utoipa::ToSchema)]
pub struct CreateCommentRequest {
    #[validate(length(min = 1, message = "Page ID is required"))]
    pub page_id: String,
    #[validate(length(
        min = 1,
        max = 5000,
        message = "Content must be between 1 and 5000 characters"
    ))]
    pub content: String,
    #[serde(default)]
    pub parent_id: Option<Id>,
}

/// Update comment request
#[derive(Debug, Clone, Deserialize, Serialize, utoipa::ToSchema)]
pub struct UpdateCommentRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolved: Option<bool>,
}

/// Resolve comment request
#[derive(Debug, Clone, Deserialize, Serialize, utoipa::ToSchema)]
pub struct ResolveCommentRequest {
    #[serde(default)]
    pub resolved: bool,
}

/// List comments query
#[derive(Debug, Clone, Deserialize, Serialize, utoipa::ToSchema)]
pub struct ListCommentsQuery {
    #[serde(default)]
    pub page_id: Option<Id>,
    #[serde(default)]
    pub parent_id: Option<Id>,
    #[serde(default)]
    pub resolved: Option<bool>,
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub offset: Option<i64>,
}

/// Comment with replies
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct CommentWithReplies {
    #[serde(flatten)]
    pub comment: CommentResponse,
    pub replies: Vec<CommentResponse>,
}

impl From<CommentResponse> for Comment {
    fn from(response: CommentResponse) -> Self {
        Self {
            id: response.id,
            page_id: response.page_id,
            user_id: response.user_id,
            reader_id: response.reader_id,
            parent_id: response.parent_id,
            content: response.content,
            resolved: response.resolved,
            resolved_at: response.resolved_at,
            resolved_by: response.resolved_by,
            created_at: response.created_at,
            updated_at: response.updated_at,
        }
    }
}

/// Comment with relational authorization context and author display metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommentWithAuth {
    pub comment: Comment,
    pub project_id: Id,
    pub organization_id: Id,
    pub member_role: Option<crate::common::MemberRole>,
    pub author_name: Option<String>,
    pub author_email: Option<String>,
    pub author_image: Option<String>,
}

impl CommentWithAuth {
    /// Returns true if the user has at least the required role in the owning organization.
    pub fn has_min_role(&self, min_role: crate::common::MemberRole) -> bool {
        self.member_role.is_some_and(|r| r >= min_role)
    }

    /// Returns true if the given user is the author of the comment.
    pub fn is_author(&self, user_id: &str) -> bool {
        self.comment.user_id.as_deref() == Some(user_id)
    }

    /// Returns true if the comment belongs to the specified project.
    pub fn belongs_to_project(&self, expected_project_id: &str) -> bool {
        self.project_id == expected_project_id
    }

    /// Author display name, falling back to email or "Anonymous"
    pub fn author_display_name(&self) -> String {
        self.author_name
            .clone()
            .or_else(|| self.author_email.clone())
            .unwrap_or_else(|| "Anonymous".to_string())
    }
}

/// Comment user information for SPA comment thread
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct CommentUserResponse {
    pub id: String,
    pub name: String,
    pub image: Option<String>,
}

/// Project comment response matching SPA Comment interface
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCommentResponse {
    pub id: Id,
    pub body: String,
    pub resolved: bool,
    pub created_at: String,
    pub anchor: Option<serde_json::Value>,
    pub user: CommentUserResponse,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::common::MemberRole;

    #[test]
    fn test_comment_response_symmetric_conversion() {
        let now = Utc::now();
        let comment = Comment {
            id: "c-1".to_string(),
            page_id: "p-1".to_string(),
            user_id: Some("u-1".to_string()),
            reader_id: None,
            parent_id: None,
            content: "Hello world".to_string(),
            resolved: false,
            resolved_at: None,
            resolved_by: None,
            created_at: now,
            updated_at: now,
        };

        let resp: CommentResponse = comment.clone().into();
        assert_eq!(resp.id, "c-1");
        assert_eq!(resp.content, "Hello world");

        let converted_back: Comment = resp.into();
        assert_eq!(converted_back.id, comment.id);
        assert_eq!(converted_back.page_id, comment.page_id);
        assert_eq!(converted_back.user_id, comment.user_id);
        assert_eq!(converted_back.content, comment.content);
    }

    #[test]
    fn test_comment_with_auth_has_min_role() {
        let now = Utc::now();
        let make_auth = |role: Option<MemberRole>| CommentWithAuth {
            comment: Comment {
                id: "c-1".to_string(),
                page_id: "p-1".to_string(),
                user_id: Some("u-author".to_string()),
                reader_id: None,
                parent_id: None,
                content: "Content".to_string(),
                resolved: false,
                resolved_at: None,
                resolved_by: None,
                created_at: now,
                updated_at: now,
            },
            project_id: "proj-1".to_string(),
            organization_id: "org-1".to_string(),
            member_role: role,
            author_name: Some("Jane Doe".to_string()),
            author_email: Some("jane@company.internal".to_string()),
            author_image: None,
        };

        let viewer_auth = make_auth(Some(MemberRole::Viewer));
        assert!(viewer_auth.has_min_role(MemberRole::Viewer));
        assert!(!viewer_auth.has_min_role(MemberRole::Admin));

        let admin_auth = make_auth(Some(MemberRole::Admin));
        assert!(admin_auth.has_min_role(MemberRole::Viewer));
        assert!(admin_auth.has_min_role(MemberRole::Admin));
        assert!(!admin_auth.has_min_role(MemberRole::Owner));

        let unauth = make_auth(None);
        assert!(!unauth.has_min_role(MemberRole::Viewer));
    }

    #[test]
    fn test_comment_with_auth_helpers() {
        let now = Utc::now();
        let auth = CommentWithAuth {
            comment: Comment {
                id: "c-1".to_string(),
                page_id: "p-1".to_string(),
                user_id: Some("u-author".to_string()),
                reader_id: None,
                parent_id: None,
                content: "Content".to_string(),
                resolved: false,
                resolved_at: None,
                resolved_by: None,
                created_at: now,
                updated_at: now,
            },
            project_id: "proj-100".to_string(),
            organization_id: "org-200".to_string(),
            member_role: Some(MemberRole::Member),
            author_name: Some("Alice".to_string()),
            author_email: Some("alice@company.internal".to_string()),
            author_image: None,
        };

        assert!(auth.is_author("u-author"));
        assert!(!auth.is_author("u-other"));
        assert!(auth.belongs_to_project("proj-100"));
        assert!(!auth.belongs_to_project("proj-999"));
        assert_eq!(auth.author_display_name(), "Alice");
    }
}
