//! Workspace business logic service
//!
//! Provides business operations for workspace settings, member management,
//! and workspace invitations.

use chrono::Utc;
use cms_db::workspace::WorkspaceQueries;
use cms_entity::workspace::{
    InviteWorkspaceMemberRequest, UpdateWorkspaceMemberRoleRequest, UpdateWorkspaceSettingsRequest,
    WorkspaceInvitationItem, WorkspaceInvitationResponse, WorkspaceMemberItem, WorkspaceMemberUser,
    WorkspaceMembersResponse, WorkspaceMutationResponse, WorkspaceSettingsResponse,
};
use cms_error::AppError;
use uuid::Uuid;

use crate::BizContext;

pub struct WorkspaceService;

impl WorkspaceService {
    /// Get workspace settings
    pub async fn get_settings(ctx: &BizContext) -> Result<WorkspaceSettingsResponse, AppError> {
        let project_count = cms_db::project::ProjectQueries::count(&ctx.pool, None, None)
            .await
            .unwrap_or(0);

        let member_count = WorkspaceQueries::count_members(&ctx.pool)
            .await
            .unwrap_or(1);

        let row = WorkspaceQueries::get_settings(&ctx.pool)
            .await
            .unwrap_or(None);

        let (name, slug) = if let Some(r) = row {
            (r.name, r.slug)
        } else {
            ("Company Workspace".to_string(), "workspace".to_string())
        };

        Ok(WorkspaceSettingsResponse {
            name,
            slug,
            notifications: std::collections::HashMap::new(),
            integrations: std::collections::HashMap::new(),
            git: std::collections::HashMap::new(),
            project_count,
            member_count,
        })
    }

    /// Update workspace settings
    pub async fn update_settings(
        ctx: &BizContext,
        req: &UpdateWorkspaceSettingsRequest,
    ) -> Result<(), AppError> {
        let logo_url = req.logo_url.as_deref().or(req.logo.as_deref());
        WorkspaceQueries::update_settings(
            &ctx.pool,
            req.name.as_deref().map(str::trim),
            logo_url,
            req.description.as_deref(),
        )
        .await
    }

    /// List workspace members and active invitations
    pub async fn list_members(ctx: &BizContext) -> Result<WorkspaceMembersResponse, AppError> {
        let users = WorkspaceQueries::list_members(&ctx.pool).await?;
        let first_id = users.first().map(|r| r.id.clone());

        let members: Vec<WorkspaceMemberItem> = users
            .into_iter()
            .map(|u| {
                let role = if Some(&u.id) == first_id.as_ref() {
                    "owner".to_string()
                } else if u.role == "admin" {
                    "admin".to_string()
                } else {
                    "member".to_string()
                };

                WorkspaceMemberItem {
                    id: u.id.clone(),
                    user_id: u.id.clone(),
                    role,
                    created_at: u.created_at,
                    user: WorkspaceMemberUser {
                        id: u.id,
                        name: u.name,
                        email: u.email,
                        image: u.image,
                    },
                }
            })
            .collect();

        let invitations_rows = WorkspaceQueries::list_pending_invitations(&ctx.pool).await?;
        let invitations: Vec<WorkspaceInvitationItem> = invitations_rows
            .into_iter()
            .map(|r| WorkspaceInvitationItem {
                id: r.id,
                email: r.email,
                role: r.role,
                expires_at: r.expires_at,
                created_at: r.created_at,
            })
            .collect();

        Ok(WorkspaceMembersResponse {
            members,
            invitations,
        })
    }

    /// Create or update an invitation
    pub async fn invite_member(
        ctx: &BizContext,
        inviter_id: &str,
        req: &InviteWorkspaceMemberRequest,
    ) -> Result<(WorkspaceInvitationResponse, String), AppError> {
        let email = req.email.trim().to_lowercase();
        let role = req.role.as_deref().unwrap_or("member");
        if role != "admin" && role != "member" {
            return Err(AppError::InvalidInput(
                "Invalid role: must be 'admin' or 'member'".to_string(),
            ));
        }

        // Check if user is already a registered member
        if let Some(_existing) = cms_db::auth::UserQueries::get_by_email(&ctx.pool, &email).await? {
            return Err(AppError::Conflict(format!(
                "User {} is already a member of this workspace",
                email
            )));
        }

        let invitation_id = Uuid::new_v4().to_string();
        let token = Uuid::new_v4().simple().to_string();
        let now = Utc::now();
        let expires = now + chrono::Duration::days(7);

        WorkspaceQueries::upsert_invitation(
            &ctx.pool,
            &invitation_id,
            &email,
            role,
            &token,
            inviter_id,
            expires,
            now,
        )
        .await?;

        let response = WorkspaceInvitationResponse {
            id: invitation_id,
            email,
            role: role.to_string(),
            token: Some(token.clone()),
            expires_at: expires.to_rfc3339(),
            created_at: now.to_rfc3339(),
        };

        Ok((response, token))
    }

    /// Update a member's role
    pub async fn update_member_role(
        ctx: &BizContext,
        target_user_id: &str,
        req: &UpdateWorkspaceMemberRoleRequest,
    ) -> Result<WorkspaceMutationResponse, AppError> {
        let new_role = req.role.as_deref().unwrap_or("member");
        if new_role != "admin" && new_role != "member" {
            return Err(AppError::InvalidInput(
                "Invalid role: must be 'admin' or 'member'".to_string(),
            ));
        }

        let _target_user = cms_db::auth::UserQueries::get_by_id(&ctx.pool, target_user_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Member not found".to_string()))?;

        // Protect workspace owner
        let owner_id = WorkspaceQueries::get_owner_user_id(&ctx.pool).await?;
        if Some(target_user_id) == owner_id.as_deref() {
            return Err(AppError::InvalidInput(
                "Cannot change role of the workspace owner".to_string(),
            ));
        }

        let db_role = if new_role == "admin" { "admin" } else { "user" };
        let is_admin = cms_db::auth::UserQueries::is_system_admin(&ctx.pool, target_user_id)
            .await
            .unwrap_or(false);

        // Prevent demoting last remaining admin
        if is_admin && db_role == "user" {
            let admin_count = WorkspaceQueries::count_admins(&ctx.pool).await.unwrap_or(0);
            if admin_count <= 1 {
                return Err(AppError::InvalidInput(
                    "Cannot demote the last remaining workspace admin".to_string(),
                ));
            }
        }

        WorkspaceQueries::update_user_role(&ctx.pool, target_user_id, db_role).await?;

        Ok(WorkspaceMutationResponse {
            success: true,
            id: target_user_id.to_string(),
        })
    }

    /// Remove a member
    pub async fn remove_member(
        ctx: &BizContext,
        caller_id: &str,
        target_user_id: &str,
    ) -> Result<WorkspaceMutationResponse, AppError> {
        if caller_id == target_user_id {
            return Err(AppError::InvalidInput(
                "You cannot remove yourself from the workspace".to_string(),
            ));
        }

        let _target_user = cms_db::auth::UserQueries::get_by_id(&ctx.pool, target_user_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Member not found".to_string()))?;

        let owner_id = WorkspaceQueries::get_owner_user_id(&ctx.pool).await?;
        if Some(target_user_id) == owner_id.as_deref() {
            return Err(AppError::InvalidInput(
                "Cannot remove the workspace owner".to_string(),
            ));
        }

        let is_admin = cms_db::auth::UserQueries::is_system_admin(&ctx.pool, target_user_id)
            .await
            .unwrap_or(false);

        if is_admin {
            let admin_count = WorkspaceQueries::count_admins(&ctx.pool).await.unwrap_or(0);
            if admin_count <= 1 {
                return Err(AppError::InvalidInput(
                    "Cannot remove the last remaining workspace admin".to_string(),
                ));
            }
        }

        WorkspaceQueries::delete_user(&ctx.pool, target_user_id).await?;

        Ok(WorkspaceMutationResponse {
            success: true,
            id: target_user_id.to_string(),
        })
    }

    /// Cancel invitation
    pub async fn cancel_invitation(
        ctx: &BizContext,
        id: &str,
    ) -> Result<WorkspaceMutationResponse, AppError> {
        let deleted = WorkspaceQueries::delete_invitation(&ctx.pool, id).await?;
        if deleted == 0 {
            return Err(AppError::NotFound("Invitation not found".to_string()));
        }

        Ok(WorkspaceMutationResponse {
            success: true,
            id: id.to_string(),
        })
    }

    /// Transfer ownership
    pub async fn transfer_ownership(
        ctx: &BizContext,
        caller_id: &str,
        target_member_id: &str,
    ) -> Result<WorkspaceMutationResponse, AppError> {
        if target_member_id == caller_id {
            return Err(AppError::InvalidInput(
                "Cannot transfer ownership to yourself".to_string(),
            ));
        }

        let _target_user = cms_db::auth::UserQueries::get_by_id(&ctx.pool, target_member_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Target member not found".to_string()))?;

        // Promote target member to admin in User table
        WorkspaceQueries::update_user_role(&ctx.pool, target_member_id, "admin").await?;

        Ok(WorkspaceMutationResponse {
            success: true,
            id: target_member_id.to_string(),
        })
    }

    /// Reset / Delete workspace
    pub async fn delete_workspace(ctx: &BizContext) -> Result<WorkspaceMutationResponse, AppError> {
        WorkspaceQueries::reset_workspace(&ctx.pool).await?;

        Ok(WorkspaceMutationResponse {
            success: true,
            id: "workspace".to_string(),
        })
    }
}
