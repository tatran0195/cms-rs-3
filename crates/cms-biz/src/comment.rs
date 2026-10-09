//! Comment Business Logic
//!
//! This module contains business logic for comments on pages.

use cms_db::{comment::CommentQueries, page::PageQueries};
use cms_entity::{
    comment::{CommentResponse, CreateCommentRequest, UpdateCommentRequest},
    common::{MemberRole, PaginatedResponse},
};

use crate::{AppError, BizContext};

/// Comment service
pub struct CommentService;

impl CommentService {
    /// Create a new comment on a page
    pub async fn create_comment(
        ctx: &BizContext,
        user_id: &str,
        page_id: &str,
        request: CreateCommentRequest,
    ) -> Result<CommentResponse, AppError> {
        // Verify page exists
        let _page = PageQueries::get_by_id(&ctx.pool, page_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Page not found".to_string()))?;

        // Verify parent comment exists and belongs to the same page
        if let Some(parent_id) = &request.parent_id {
            let parent = CommentQueries::get_by_id(&ctx.pool, parent_id)
                .await?
                .ok_or_else(|| AppError::NotFound("Parent comment not found".to_string()))?;
            if parent.page_id != page_id {
                return Err(AppError::Conflict(
                    "Parent comment does not belong to this page".to_string(),
                ));
            }
        }

        let comment = CommentQueries::create(
            &ctx.pool,
            page_id,
            Some(user_id),
            None, // reader_id
            request.parent_id.as_deref(),
            &request.content,
        )
        .await?;

        Ok(comment.into())
    }

    /// Helper to enforce required role using in-memory member role
    fn require_role(
        member_role: Option<MemberRole>,
        min_role: MemberRole,
    ) -> Result<(), AppError> {
        if let Some(role) = member_role {
            if role >= min_role {
                return Ok(());
            }
        }
        Err(AppError::Forbidden)
    }

    /// Get a comment by ID
    pub async fn get_comment(
        ctx: &BizContext,
        user_id: &str,
        comment_id: &str,
    ) -> Result<CommentResponse, AppError> {
        let auth_record = CommentQueries::get_with_auth(&ctx.pool, comment_id, user_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Comment not found".to_string()))?;

        Self::require_role(auth_record.member_role, MemberRole::Viewer)?;

        Ok(auth_record.comment.into())
    }

    /// List comments for a page
    pub async fn list_comments(
        ctx: &BizContext,
        _user_id: &str,
        page_id: &str,
        parent_id: Option<&str>,
        resolved: Option<bool>,
        page: u64,
        page_size: u64,
    ) -> Result<PaginatedResponse<CommentResponse>, AppError> {
        // Verify page exists
        let _page_entity = PageQueries::get_by_id(&ctx.pool, page_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Page not found".to_string()))?;

        let limit = page_size.max(1) as i64;
        let offset = page.saturating_sub(1) as i64 * limit;
        let comments = CommentQueries::get_by_page(
            &ctx.pool,
            page_id,
            parent_id,
            resolved,
            Some(limit),
            Some(offset),
        )
        .await?;

        let total = CommentQueries::count_by_page(&ctx.pool, page_id, parent_id, resolved).await?;

        Ok(PaginatedResponse::new(
            comments.into_iter().map(|c| c.into()).collect(),
            total as u64,
            page,
            page_size,
        ))
    }

    /// Update a comment
    pub async fn update_comment(
        ctx: &BizContext,
        user_id: &str,
        comment_id: &str,
        expected_project_id: Option<&str>,
        request: UpdateCommentRequest,
    ) -> Result<CommentResponse, AppError> {
        let auth_record = CommentQueries::get_with_auth(&ctx.pool, comment_id, user_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Comment not found".to_string()))?;

        if let Some(expected_pid) = expected_project_id {
            if !auth_record.belongs_to_project(expected_pid) {
                return Err(AppError::NotFound(
                    "Comment not found for this project".to_string(),
                ));
            }
        }

        // Author can update if they have Viewer access; non-author requires Admin
        if !auth_record.is_author(user_id) {
            Self::require_role(auth_record.member_role, MemberRole::Admin)?;
        } else {
            Self::require_role(auth_record.member_role, MemberRole::Viewer)?;
        }

        let updated = CommentQueries::update(
            &ctx.pool,
            comment_id,
            request.content.as_deref(),
            request.resolved,
        )
        .await?;

        Ok(updated.into())
    }

    /// Delete a comment
    pub async fn delete_comment(
        ctx: &BizContext,
        user_id: &str,
        comment_id: &str,
        expected_project_id: Option<&str>,
    ) -> Result<bool, AppError> {
        let auth_record = CommentQueries::get_with_auth(&ctx.pool, comment_id, user_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Comment not found".to_string()))?;

        if let Some(expected_pid) = expected_project_id {
            if !auth_record.belongs_to_project(expected_pid) {
                return Err(AppError::NotFound(
                    "Comment not found for this project".to_string(),
                ));
            }
        }

        // Author can delete if they have Viewer access; non-author requires Admin
        if !auth_record.is_author(user_id) {
            Self::require_role(auth_record.member_role, MemberRole::Admin)?;
        } else {
            Self::require_role(auth_record.member_role, MemberRole::Viewer)?;
        }

        CommentQueries::delete(&ctx.pool, comment_id).await
    }

    /// Resolve a comment (admin only)
    pub async fn resolve_comment(
        ctx: &BizContext,
        user_id: &str,
        comment_id: &str,
    ) -> Result<CommentResponse, AppError> {
        let auth_record = CommentQueries::get_with_auth(&ctx.pool, comment_id, user_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Comment not found".to_string()))?;

        Self::require_role(auth_record.member_role, MemberRole::Admin)?;

        let updated = CommentQueries::update(&ctx.pool, comment_id, None, Some(true)).await?;

        Ok(updated.into())
    }

    /// Unresolve a comment (admin only)
    pub async fn unresolve_comment(
        ctx: &BizContext,
        user_id: &str,
        comment_id: &str,
    ) -> Result<CommentResponse, AppError> {
        let auth_record = CommentQueries::get_with_auth(&ctx.pool, comment_id, user_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Comment not found".to_string()))?;

        Self::require_role(auth_record.member_role, MemberRole::Admin)?;

        let updated = CommentQueries::update(&ctx.pool, comment_id, None, Some(false)).await?;

        Ok(updated.into())
    }

    /// Get comment with replies
    pub async fn get_comment_with_replies(
        ctx: &BizContext,
        user_id: &str,
        comment_id: &str,
    ) -> Result<cms_entity::comment::CommentWithReplies, AppError> {
        let auth_record = CommentQueries::get_with_auth(&ctx.pool, comment_id, user_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Comment not found".to_string()))?;

        Self::require_role(auth_record.member_role, MemberRole::Viewer)?;

        let replies = CommentQueries::get_by_page(
            &ctx.pool,
            &auth_record.comment.page_id,
            Some(comment_id),
            None,
            None,
            None,
        )
        .await?;

        Ok(cms_entity::comment::CommentWithReplies {
            comment: auth_record.comment.into(),
            replies: replies.into_iter().map(|r| r.into()).collect(),
        })
    }
}

#[cfg(test)]
mod tests {
    use cms_authz::AuthzState;
    use cms_db::{branch::BranchQueries, project::ProjectQueries};
    use uuid::Uuid;

    use super::*;

    #[tokio::test]
    async fn test_relational_comment_single_trip_auth_lookup() {
        let database_url = std::env::var("CMS_DATABASE__URL")
            .or_else(|_| std::env::var("DATABASE_URL"))
            .unwrap_or_else(|_| "postgres://postgres:postgres@localhost:5432/cms".to_string());

        let pool = match cms_db::create_pool(&database_url).await {
            Ok(p) => p,
            Err(_) => return,
        };

        if cms_db::test_connection(&pool).await.is_err() {
            return;
        }

        let now = chrono::Utc::now();
        let author_id = format!("user-author-{}", Uuid::new_v4());
        let author_email = format!("author-{}@internal.company", Uuid::new_v4());
        let _ = cms_db::sqlx::query(
            r#"INSERT INTO "User" (id, email, name, email_verified, role, created_at, updated_at)
               VALUES ($1, $2, 'Author User', TRUE, 'user', $3, $3)"#,
        )
        .bind(&author_id)
        .bind(&author_email)
        .bind(now)
        .execute(&pool)
        .await;

        let other_id = format!("user-other-{}", Uuid::new_v4());
        let other_email = format!("other-{}@internal.company", Uuid::new_v4());
        let _ = cms_db::sqlx::query(
            r#"INSERT INTO "User" (id, email, name, email_verified, role, created_at, updated_at)
               VALUES ($1, $2, 'Other User', TRUE, 'user', $3, $3)"#,
        )
        .bind(&other_id)
        .bind(&other_email)
        .bind(now)
        .execute(&pool)
        .await;

        let unauth_id = format!("user-unauth-{}", Uuid::new_v4());
        let unauth_email = format!("unauth-{}@internal.company", Uuid::new_v4());
        let _ = cms_db::sqlx::query(
            r#"INSERT INTO "User" (id, email, name, email_verified, role, created_at, updated_at)
               VALUES ($1, $2, 'Unauth User', TRUE, 'user', $3, $3)"#,
        )
        .bind(&unauth_id)
        .bind(&unauth_email)
        .bind(now)
        .execute(&pool)
        .await;

        let proj_name = format!("Comment Test Proj {}", Uuid::new_v4());
        let proj_slug = format!("comment-proj-{}", Uuid::new_v4());

        let project = match ProjectQueries::create_atomic(
            &pool,
            &proj_name,
            &proj_slug,
            None,
            None,
            false,
            Some(&author_id),
        )
        .await
        {
            Ok(res) => res,
            Err(_) => return,
        };

        // Add other_id as Admin in project
        let _ = cms_db::authz::ProjectMemberQueries::create(
            &pool,
            &project.id,
            &other_id,
            "admin",
            None,
        )
        .await
        .expect("Failed to add other user as admin");

        let default_branch = BranchQueries::get_default(&pool, &project.id)
            .await
            .expect("branch query")
            .expect("default branch");

        let page = PageQueries::create(
            &pool,
            &project.id,
            &default_branch.id,
            None,
            None,
            Some("doc"),
            "comment-test",
            "Comment Test Page",
            None,
            Some("Page content blob"),
            None,
            None,
            None,
            0,
            true,
        )
        .await
        .expect("page create");

        let comment = CommentQueries::create(
            &pool,
            &page.id,
            Some(&author_id),
            None,
            None,
            "Test single-trip relational comment content",
        )
        .await
        .expect("comment create");

        // 1. Single-trip lookup with authorized author (Owner/Member role from create_atomic)
        let auth_res = CommentQueries::get_with_auth(&pool, &comment.id, &author_id)
            .await
            .expect("get_with_auth failed");
        assert!(auth_res.is_some(), "Comment auth record must be found");
        let auth_record = auth_res.unwrap();
        assert_eq!(auth_record.comment.id, comment.id);
        assert_eq!(auth_record.project_id, project.id);
        assert!(auth_record.member_role.is_some());
        assert_eq!(auth_record.author_name.as_deref(), Some("Author User"));
        assert!(auth_record.is_author(&author_id));
        assert!(auth_record.has_min_role(MemberRole::Viewer));

        // 2. Single-trip lookup with other admin user
        let other_auth = CommentQueries::get_with_auth(&pool, &comment.id, &other_id)
            .await
            .expect("get_with_auth failed")
            .expect("record found");
        assert_eq!(other_auth.member_role, Some(MemberRole::Admin));
        assert!(!other_auth.is_author(&other_id));
        assert!(other_auth.has_min_role(MemberRole::Admin));

        // 3. Single-trip lookup with unauthorized user (no member row)
        let unauth_record = CommentQueries::get_with_auth(&pool, &comment.id, &unauth_id)
            .await
            .expect("get_with_auth failed")
            .expect("record found");
        assert_eq!(unauth_record.member_role, None);
        assert!(!unauth_record.has_min_role(MemberRole::Viewer));

        // 4. Test CommentService RBAC with AuthzState
        let ctx = BizContext::new(
            pool.clone(),
            std::sync::Arc::new(AuthzState::new(pool.clone(), vec![])),
        );

        // Author can get comment
        let fetched = CommentService::get_comment(&ctx, &author_id, &comment.id)
            .await
            .expect("Author get comment");
        assert_eq!(fetched.id, comment.id);

        // Admin can get comment
        let admin_fetched = CommentService::get_comment(&ctx, &other_id, &comment.id)
            .await
            .expect("Admin get comment");
        assert_eq!(admin_fetched.id, comment.id);

        // Unauthorized user cannot get comment
        let unauth_err = CommentService::get_comment(&ctx, &unauth_id, &comment.id).await;
        assert!(unauth_err.is_err(), "Unauthorized user must be denied");

        // Author can update own comment
        let update_res = CommentService::update_comment(
            &ctx,
            &author_id,
            &comment.id,
            Some(&project.id),
            UpdateCommentRequest {
                content: Some("Updated by author".to_string()),
                resolved: None,
            },
        )
        .await
        .expect("Author update");
        assert_eq!(update_res.content, "Updated by author");

        // Mismatched project isolation check
        let iso_err = CommentService::update_comment(
            &ctx,
            &author_id,
            &comment.id,
            Some("foreign-project-id"),
            UpdateCommentRequest {
                content: Some("Should fail".to_string()),
                resolved: None,
            },
        )
        .await;
        assert!(iso_err.is_err(), "Cross-project comment update must fail");

        // Admin can resolve comment
        let resolved = CommentService::resolve_comment(&ctx, &other_id, &comment.id)
            .await
            .expect("Admin resolve");
        assert!(resolved.resolved);

        // Author can delete comment
        let deleted =
            CommentService::delete_comment(&ctx, &author_id, &comment.id, Some(&project.id))
                .await
                .expect("Author delete");
        assert!(deleted);

        // Cleanup
        let _ = cms_db::sqlx::query("DELETE FROM \"Comment\" WHERE page_id = $1")
            .bind(&page.id)
            .execute(&pool)
            .await;
        let _ = cms_db::sqlx::query("DELETE FROM \"Page\" WHERE id = $1")
            .bind(&page.id)
            .execute(&pool)
            .await;
        let _ = cms_db::sqlx::query("DELETE FROM \"Project\" WHERE id = $1")
            .bind(&project.id)
            .execute(&pool)
            .await;
        for uid in [&author_id, &other_id, &unauth_id] {
            let _ = cms_db::sqlx::query("DELETE FROM \"User\" WHERE id = $1")
                .bind(uid)
                .execute(&pool)
                .await;
        }
    }
}
