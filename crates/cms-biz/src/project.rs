//! Project Business Logic
//!
//! This module contains business logic for projects, including creation,
//! updates, deletion, and membership management.

use cms_db::{
    org::MemberQueries,
    project::{ProjectAddonQueries, ProjectQueries, ProjectSettingsQueries},
};
use cms_entity::{
    common::{MemberRole, PaginatedResponse},
    project::{
        CreateProjectRequest, ListProjectsQuery, ListProjectsResponse, ProjectAddonResponse,
        ProjectResponse, ProjectSettings, ProjectWithOrgResponse, UpdateProjectRequest,
        UpdateProjectSettingsRequest,
    },
};
use uuid::Uuid;

use crate::{AppError, BizContext};

/// Project service
pub struct ProjectService;

impl ProjectService {
    /// Create a new project
    pub async fn create_project(
        ctx: &BizContext,
        user_id: &str,
        org_id: &str,
        request: CreateProjectRequest,
    ) -> Result<ProjectWithOrgResponse, AppError> {
        let (effective_org_id, new_org_info) = if org_id.trim().is_empty() {
            // Check if user already belongs to an organization
            let user_memberships =
                cms_db::org::MemberQueries::get_by_user(&ctx.pool, user_id).await?;
            if let Some(first_membership) = user_memberships.first() {
                (first_membership.organization_id.clone(), None)
            } else {
                // Mint dedicated organization for user (site is its own workspace)
                let new_org_id = Uuid::new_v4().to_string();
                let org_slug = Uuid::new_v4().to_string();
                let org_name = request.name.clone();
                (new_org_id, Some((org_name, org_slug, user_id.to_string())))
            }
        } else {
            ctx.authz.require_org_member(user_id, org_id).await?;
            (org_id.to_string(), None)
        };

        // Generate a base slug from the request name
        let sanitized = request
            .name
            .trim()
            .chars()
            .flat_map(char::to_lowercase)
            .filter_map(|c| {
                if c.is_ascii_alphanumeric() {
                    Some(c)
                } else if c == ' ' || c == '-' || c == '_' {
                    Some('-')
                } else {
                    None
                }
            })
            .collect::<String>();
        let base_slug = if sanitized.trim_matches('-').is_empty() {
            "project".to_string()
        } else {
            sanitized.trim_matches('-').to_string()
        };

        let mut slug = base_slug.clone();
        let mut counter = 1;

        // Atomically insert with collision retry on PostgreSQL unique constraint conflict (23505)
        let (project, org) = loop {
            let new_org_tuple = new_org_info
                .as_ref()
                .map(|(name, slug, uid)| (name.as_str(), slug.as_str(), uid.as_str()));

            match ProjectQueries::create_atomic(
                &ctx.pool,
                new_org_tuple,
                &effective_org_id,
                &request.name,
                &slug,
                request.description.as_deref(),
                request.icon.as_deref(),
                request.is_public,
            )
            .await
            {
                Ok(res) => break res,
                Err(AppError::Conflict(_)) => {
                    slug = format!("{}-{}", base_slug, counter);
                    counter += 1;
                    if counter > 50 {
                        return Err(AppError::Conflict(
                            "Unable to allocate unique project slug after multiple attempts"
                                .to_string(),
                        ));
                    }
                }
                Err(err) => return Err(err),
            }
        };

        Ok(ProjectWithOrgResponse {
            project: project.into(),
            organization: org.into(),
        })
    }

    /// Get a project by ID
    pub async fn get_project(
        ctx: &BizContext,
        user_id: &str,
        project_id: &str,
    ) -> Result<ProjectWithOrgResponse, AppError> {
        let project = ProjectQueries::get_by_id(&ctx.pool, project_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Project not found".to_string()))?;

        // Check if user has access to the project
        // Either through organization membership or reader access
        ctx.authz
            .require_org_member(user_id, &project.organization_id)
            .await?;

        let org = cms_db::org::OrganizationQueries::get_by_id(&ctx.pool, &project.organization_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Organization not found".to_string()))?;

        Ok(ProjectWithOrgResponse {
            project: project.into(),
            organization: org.into(),
        })
    }

    /// Get a public project by org and project slug
    pub async fn get_public_project(
        ctx: &BizContext,
        org_slug: &str,
        project_slug: &str,
    ) -> Result<ProjectWithOrgResponse, AppError> {
        let org = cms_db::org::OrganizationQueries::get_by_slug(&ctx.pool, org_slug)
            .await?
            .ok_or_else(|| AppError::NotFound("Organization not found".to_string()))?;
        let project = ProjectQueries::get_by_slug(&ctx.pool, &org.id, project_slug)
            .await?
            .ok_or_else(|| AppError::NotFound("Project not found".to_string()))?;
        if !project.is_public {
            return Err(AppError::NotFound("Project not found".to_string()));
        }
        Ok(ProjectWithOrgResponse {
            project: project.into(),
            organization: org.into(),
        })
    }

    /// Get a project by slug
    pub async fn get_project_by_slug(
        ctx: &BizContext,
        user_id: &str,
        org_slug: &str,
        project_slug: &str,
    ) -> Result<ProjectWithOrgResponse, AppError> {
        let org = cms_db::org::OrganizationQueries::get_by_slug(&ctx.pool, org_slug)
            .await?
            .ok_or_else(|| AppError::NotFound("Organization not found".to_string()))?;

        // Check if user has access to the organization
        ctx.authz.require_org_member(user_id, &org.id).await?;

        let project = ProjectQueries::get_by_slug(&ctx.pool, &org.id, project_slug)
            .await?
            .ok_or_else(|| AppError::NotFound("Project not found".to_string()))?;

        Ok(ProjectWithOrgResponse {
            project: project.into(),
            organization: org.into(),
        })
    }

    /// Update a project
    pub async fn update_project(
        ctx: &BizContext,
        user_id: &str,
        project_id: &str,
        request: UpdateProjectRequest,
    ) -> Result<ProjectResponse, AppError> {
        let project = ProjectQueries::get_by_id(&ctx.pool, project_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Project not found".to_string()))?;

        // Check if user has admin role in the organization
        ctx.authz
            .require_org_admin(user_id, &project.organization_id)
            .await?;

        let updated = ProjectQueries::update(
            &ctx.pool,
            project_id,
            request.name.as_deref(),
            request.slug.as_deref(),
            request.description.as_deref(),
            request.icon.as_deref(),
            request.is_public,
            request.config.as_ref(),
        )
        .await?;

        Ok(updated.into())
    }

    /// Delete a project
    pub async fn delete_project(
        ctx: &BizContext,
        user_id: &str,
        project_id: &str,
    ) -> Result<bool, AppError> {
        let project = ProjectQueries::get_by_id(&ctx.pool, project_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Project not found".to_string()))?;

        // Only organization owner can delete a project
        ctx.authz
            .require_org_owner(user_id, &project.organization_id)
            .await?;

        ProjectQueries::delete(&ctx.pool, project_id).await
    }

    /// List projects for an organization
    pub async fn list_projects(
        ctx: &BizContext,
        user_id: &str,
        org_id: &str,
        query: ListProjectsQuery,
        page: u64,
        page_size: u64,
    ) -> Result<ListProjectsResponse, AppError> {
        // Check if user is a member of the organization
        ctx.authz.require_org_member(user_id, org_id).await?;

        let offset = page.saturating_sub(1) * page_size;
        let projects = ProjectQueries::get_by_organization(
            &ctx.pool,
            org_id,
            query.is_public,
            query.search.as_deref(),
            Some(page_size as i64),
            Some(offset as i64),
        )
        .await?;

        let total = ProjectQueries::count_by_organization(
            &ctx.pool,
            org_id,
            query.is_public,
            query.search.as_deref(),
        )
        .await?;

        Ok(PaginatedResponse::new(
            projects.into_iter().map(|p| p.into()).collect(),
            total as u64,
            page,
            page_size,
        ))
    }

    /// List all projects accessible to a user
    pub async fn list_all_projects_for_user(
        ctx: &BizContext,
        user_id: &str,
        page: u64,
        page_size: u64,
    ) -> Result<ListProjectsResponse, AppError> {
        // Get all organizations the user is a member of
        let members = MemberQueries::get_by_user(&ctx.pool, user_id).await?;
        let org_ids: Vec<&str> = members.iter().map(|m| m.organization_id.as_str()).collect();

        if org_ids.is_empty() {
            return Ok(PaginatedResponse::new(vec![], 0, page, page_size));
        }

        let offset = page.saturating_sub(1) * page_size;
        let projects = ProjectQueries::get_by_organizations(
            &ctx.pool,
            &org_ids,
            Some(page_size as i64),
            Some(offset as i64),
        )
        .await?;

        let total = ProjectQueries::count_by_organizations(&ctx.pool, &org_ids).await?;

        Ok(PaginatedResponse::new(
            projects.into_iter().map(|p| p.into()).collect(),
            total as u64,
            page,
            page_size,
        ))
    }

    /// Get project settings
    pub async fn get_project_settings(
        ctx: &BizContext,
        user_id: &str,
        project_id: &str,
    ) -> Result<ProjectSettings, AppError> {
        let _project = ProjectQueries::get_by_id(&ctx.pool, project_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Project not found".to_string()))?;

        // Check if user has admin role in the project
        ctx.authz
            .require_project_role(user_id, project_id, MemberRole::Admin)
            .await?;

        let settings = ProjectSettingsQueries::get(&ctx.pool, project_id)
            .await?
            .unwrap_or_else(|| ProjectSettings {
                project_id: project_id.to_string(),
                theme: None,
                default_language: None,
                custom_domain: None,
                search_enabled: true,
                comments_enabled: true,
                created_at: chrono::Utc::now(),
                updated_at: chrono::Utc::now(),
            });

        Ok(settings)
    }

    /// Update project settings
    pub async fn update_project_settings(
        ctx: &BizContext,
        user_id: &str,
        project_id: &str,
        request: UpdateProjectSettingsRequest,
    ) -> Result<ProjectSettings, AppError> {
        let _project = ProjectQueries::get_by_id(&ctx.pool, project_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Project not found".to_string()))?;

        // Check if user has admin role in the project
        ctx.authz
            .require_project_role(user_id, project_id, MemberRole::Admin)
            .await?;

        let settings = ProjectSettingsQueries::upsert(
            &ctx.pool,
            project_id,
            request.theme.as_deref(),
            request.default_language.as_deref(),
            request.custom_domain.as_deref(),
            request.search_enabled,
            request.comments_enabled,
        )
        .await?;

        Ok(settings)
    }

    /// List project addons
    pub async fn list_project_addons(
        ctx: &BizContext,
        user_id: &str,
        project_id: &str,
    ) -> Result<Vec<ProjectAddonResponse>, AppError> {
        let project = ProjectQueries::get_by_id(&ctx.pool, project_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Project not found".to_string()))?;

        // Check if user has access to the project
        ctx.authz
            .require_org_member(user_id, &project.organization_id)
            .await?;

        let addons = ProjectAddonQueries::get_by_project(&ctx.pool, project_id).await?;

        Ok(addons.into_iter().map(|a| a.into()).collect())
    }

    /// Create a project addon
    pub async fn create_project_addon(
        ctx: &BizContext,
        user_id: &str,
        project_id: &str,
        addon_type: &str,
        config: serde_json::Value,
        is_enabled: bool,
    ) -> Result<ProjectAddonResponse, AppError> {
        let _project = ProjectQueries::get_by_id(&ctx.pool, project_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Project not found".to_string()))?;

        // Check if user has admin role in the project
        ctx.authz
            .require_project_role(user_id, project_id, MemberRole::Admin)
            .await?;

        let addon =
            ProjectAddonQueries::create(&ctx.pool, project_id, addon_type, config, is_enabled)
                .await?;

        Ok(addon.into())
    }

    /// Update a project addon
    pub async fn update_project_addon(
        ctx: &BizContext,
        user_id: &str,
        project_id: &str,
        addon_id: &str,
        config: Option<serde_json::Value>,
        is_enabled: Option<bool>,
    ) -> Result<ProjectAddonResponse, AppError> {
        let addon = ProjectAddonQueries::get_by_id(&ctx.pool, addon_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Addon not found".to_string()))?;

        if addon.project_id != project_id {
            return Err(AppError::NotFound(
                "Addon not found for this project".to_string(),
            ));
        }

        // Check if user has admin role in the project
        ctx.authz
            .require_project_role(user_id, &addon.project_id, MemberRole::Admin)
            .await?;

        let updated = ProjectAddonQueries::update(&ctx.pool, addon_id, config, is_enabled).await?;

        Ok(updated.into())
    }

    /// Delete a project addon
    pub async fn delete_project_addon(
        ctx: &BizContext,
        user_id: &str,
        project_id: &str,
        addon_id: &str,
    ) -> Result<bool, AppError> {
        let addon = ProjectAddonQueries::get_by_id(&ctx.pool, addon_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Addon not found".to_string()))?;

        if addon.project_id != project_id {
            return Err(AppError::NotFound(
                "Addon not found for this project".to_string(),
            ));
        }

        // Check if user has admin role in the project
        ctx.authz
            .require_project_role(user_id, &addon.project_id, MemberRole::Admin)
            .await?;

        ProjectAddonQueries::delete(&ctx.pool, addon_id).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        asset::AssetService, branch::BranchService, comment::CommentService,
        deployment::DeploymentService, integration::IntegrationService, page::PageService,
    };
    use bytes::Bytes;
    use cms_db::{branch::BranchQueries, comment::CommentQueries, page::PageQueries};
    use cms_entity::{
        asset::CreateAssetRequest,
        branch::CreateBranchRequest,
        comment::CreateCommentRequest,
        deployment::CreateDeploymentRequest,
        integration::{CreateProjectIntegrationRequest, IntegrationProvider},
    };
    use cms_storage::LocalFsStorage;
    use std::sync::Arc;

    #[tokio::test]
    async fn test_atomic_project_creation_seeds_branch_language_settings() {
        let database_url = std::env::var("CMS_DATABASE__URL")
            .or_else(|_| std::env::var("DATABASE_URL"))
            .unwrap_or_else(|_| "postgres://postgres:postgres@localhost:5432/cms".to_string());

        let pool = match cms_db::create_pool(&database_url).await {
            Ok(p) => p,
            Err(_) => {
                // If database is not reachable, skip test gracefully
                return;
            }
        };

        if cms_db::test_connection(&pool).await.is_err() {
            return;
        }

        let user_id = format!("test-user-{}", Uuid::new_v4());
        let user_email = format!("test-{}@internal.company", Uuid::new_v4());
        let now = chrono::Utc::now();
        let _ = cms_db::sqlx::query(
            r#"INSERT INTO "User" (id, email, name, email_verified, role, created_at, updated_at)
               VALUES ($1, $2, 'Atomic Test User', TRUE, 'user', $3, $3)"#,
        )
        .bind(&user_id)
        .bind(&user_email)
        .bind(now)
        .execute(&pool)
        .await;

        let org_name = format!("Atomic Org {}", Uuid::new_v4());
        let org_slug = format!("atomic-org-{}", Uuid::new_v4());
        let org_id = Uuid::new_v4().to_string();

        let proj_name = format!("Atomic Proj {}", Uuid::new_v4());
        let proj_slug = format!("atomic-proj-{}", Uuid::new_v4());

        // 1. Call create_atomic with new organization
        let result = ProjectQueries::create_atomic(
            &pool,
            Some((&org_name, &org_slug, &user_id)),
            &org_id,
            &proj_name,
            &proj_slug,
            Some("Atomic project description"),
            None,
            false,
        )
        .await;

        assert!(result.is_ok(), "create_atomic failed: {:?}", result.err());
        let (project, org) = result.unwrap();

        assert_eq!(project.name, proj_name);
        assert_eq!(project.slug, proj_slug);
        assert_eq!(org.id, org_id);

        // 2. Verify default branch was created atomically
        let default_branch = cms_db::branch::BranchQueries::get_default(&pool, &project.id).await;
        assert!(default_branch.is_ok(), "get_default branch failed");
        let branch = default_branch.unwrap();
        assert!(
            branch.is_some(),
            "default branch 'main' must exist immediately after creation"
        );
        let branch = branch.unwrap();
        assert_eq!(branch.name, "main");
        assert_eq!(branch.slug, "main");
        assert!(branch.is_default);

        // 3. Verify default language was created atomically
        let default_language =
            cms_db::language::LanguageQueries::get_default(&pool, &project.id).await;
        assert!(default_language.is_ok(), "get_default language failed");
        let lang = default_language.unwrap();
        assert!(
            lang.is_some(),
            "default language 'en' must exist immediately after creation"
        );
        let lang = lang.unwrap();
        assert_eq!(lang.code, "en");
        assert!(lang.is_default);

        // 4. Verify settings were created atomically
        let settings = cms_db::project::ProjectSettingsQueries::get(&pool, &project.id).await;
        assert!(settings.is_ok(), "get settings failed");
        let settings = settings.unwrap();
        assert!(
            settings.is_some(),
            "settings must exist immediately after creation without extra upsert"
        );
        let settings = settings.unwrap();
        assert_eq!(settings.default_language.as_deref(), Some("en"));
        assert!(settings.search_enabled);
        assert!(settings.comments_enabled);

        // Cleanup created test rows
        let _ = cms_db::sqlx::query("DELETE FROM \"ProjectSettings\" WHERE project_id = $1")
            .bind(&project.id)
            .execute(&pool)
            .await;
        let _ = cms_db::sqlx::query("DELETE FROM \"Language\" WHERE project_id = $1")
            .bind(&project.id)
            .execute(&pool)
            .await;
        let _ = cms_db::sqlx::query("DELETE FROM \"Branch\" WHERE project_id = $1")
            .bind(&project.id)
            .execute(&pool)
            .await;
        let _ = cms_db::sqlx::query("DELETE FROM \"Project\" WHERE id = $1")
            .bind(&project.id)
            .execute(&pool)
            .await;
        let _ = cms_db::sqlx::query("DELETE FROM \"Member\" WHERE organization_id = $1")
            .bind(&org_id)
            .execute(&pool)
            .await;
        let _ = cms_db::sqlx::query("DELETE FROM \"Organization\" WHERE id = $1")
            .bind(&org_id)
            .execute(&pool)
            .await;
        let _ = cms_db::sqlx::query("DELETE FROM \"User\" WHERE id = $1")
            .bind(&user_id)
            .execute(&pool)
            .await;
    }

    #[tokio::test]
    async fn test_update_project_addon_mismatched_project_id_fails() {
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

        let ctx = BizContext::new(pool.clone(), std::sync::Arc::new(cms_authz::NoopAuthz));
        let user_id = format!("test-user-{}", Uuid::new_v4());
        let project_id = format!("test-proj-{}", Uuid::new_v4());
        let foreign_project_id = format!("test-foreign-proj-{}", Uuid::new_v4());
        let org_id = format!("test-org-{}", Uuid::new_v4());

        let now = chrono::Utc::now();
        let _ = cms_db::sqlx::query(
            r#"INSERT INTO "Organization" (id, name, slug, created_at, updated_at) VALUES ($1, 'Test Org', $2, $3, $3)"#,
        )
        .bind(&org_id)
        .bind(format!("org-{}", Uuid::new_v4()))
        .bind(now)
        .execute(&pool)
        .await;

        let _ = cms_db::sqlx::query(
            r#"INSERT INTO "Project" (id, organization_id, name, slug, is_public, created_at, updated_at) VALUES ($1, $2, 'Test Proj', $3, false, $4, $4)"#,
        )
        .bind(&project_id)
        .bind(&org_id)
        .bind(format!("proj-{}", Uuid::new_v4()))
        .bind(now)
        .execute(&pool)
        .await;

        let addon = match cms_db::project::ProjectAddonQueries::create(
            &pool,
            &project_id,
            "feedback",
            serde_json::json!({}),
            true,
        )
        .await
        {
            Ok(a) => a,
            Err(_) => return,
        };

        let result = ProjectService::update_project_addon(
            &ctx,
            &user_id,
            &foreign_project_id,
            &addon.id,
            None,
            Some(false),
        )
        .await;

        assert!(
            result.is_err(),
            "update with mismatched project_id should fail"
        );
        match result.unwrap_err() {
            AppError::NotFound(msg) => assert!(msg.contains("not found")),
            err => panic!("Expected NotFound error, got: {:?}", err),
        }

        let _ = cms_db::sqlx::query("DELETE FROM \"ProjectAddon\" WHERE id = $1")
            .bind(&addon.id)
            .execute(&pool)
            .await;
        let _ = cms_db::sqlx::query("DELETE FROM \"Project\" WHERE id = $1")
            .bind(&project_id)
            .execute(&pool)
            .await;
        let _ = cms_db::sqlx::query("DELETE FROM \"Organization\" WHERE id = $1")
            .bind(&org_id)
            .execute(&pool)
            .await;
    }

    #[tokio::test]
    async fn test_resolve_git_conflict_mismatched_project_id_fails() {
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

        let ctx = BizContext::new(pool.clone(), std::sync::Arc::new(cms_authz::NoopAuthz));
        let user_id = format!("test-user-{}", Uuid::new_v4());
        let project_id = format!("test-proj-{}", Uuid::new_v4());
        let foreign_project_id = format!("test-foreign-proj-{}", Uuid::new_v4());
        let org_id = format!("test-org-{}", Uuid::new_v4());
        let conflict_id = format!("test-conflict-{}", Uuid::new_v4());

        let now = chrono::Utc::now();
        let _ = cms_db::sqlx::query(
            r#"INSERT INTO "Organization" (id, name, slug, created_at, updated_at) VALUES ($1, 'Test Org 2', $2, $3, $3)"#,
        )
        .bind(&org_id)
        .bind(format!("org-{}", Uuid::new_v4()))
        .bind(now)
        .execute(&pool)
        .await;

        let _ = cms_db::sqlx::query(
            r#"INSERT INTO "Project" (id, organization_id, name, slug, is_public, created_at, updated_at) VALUES ($1, $2, 'Test Proj 2', $3, false, $4, $4)"#,
        )
        .bind(&project_id)
        .bind(&org_id)
        .bind(format!("proj-{}", Uuid::new_v4()))
        .bind(now)
        .execute(&pool)
        .await;

        let _ = cms_db::sqlx::query(
            r#"INSERT INTO "GitConflict" (id, project_id, file_path, conflict_type, base_content, local_content, remote_content, created_at)
               VALUES ($1, $2, 'README.md', 'CONTENT', 'base', 'local', 'remote', $3)"#,
        )
        .bind(&conflict_id)
        .bind(&project_id)
        .bind(now)
        .execute(&pool)
        .await;

        let result = crate::git::GitService::resolve_conflict(
            &ctx,
            &user_id,
            &foreign_project_id,
            &conflict_id,
            "resolved",
        )
        .await;

        assert!(
            result.is_err(),
            "resolve_conflict with mismatched project_id should fail"
        );
        match result.unwrap_err() {
            AppError::NotFound(msg) => assert!(msg.contains("not found")),
            err => panic!("Expected NotFound error, got: {:?}", err),
        }

        let _ = cms_db::sqlx::query("DELETE FROM \"GitConflict\" WHERE id = $1")
            .bind(&conflict_id)
            .execute(&pool)
            .await;
        let _ = cms_db::sqlx::query("DELETE FROM \"Project\" WHERE id = $1")
            .bind(&project_id)
            .execute(&pool)
            .await;
        let _ = cms_db::sqlx::query("DELETE FROM \"Organization\" WHERE id = $1")
            .bind(&org_id)
            .execute(&pool)
            .await;
    }

    #[tokio::test]
    async fn test_cross_project_branch_access_fails() {
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

        let ctx = BizContext::new(pool.clone(), std::sync::Arc::new(cms_authz::NoopAuthz));
        let user_id = format!("test-user-{}", Uuid::new_v4());
        let user_email = format!("test-{}@internal.company", Uuid::new_v4());
        let now = chrono::Utc::now();
        let _ = cms_db::sqlx::query(
            r#"INSERT INTO "User" (id, email, name, email_verified, role, created_at, updated_at)
               VALUES ($1, $2, 'Test Cross User', TRUE, 'user', $3, $3)"#,
        )
        .bind(&user_id)
        .bind(&user_email)
        .bind(now)
        .execute(&pool)
        .await;

        let org_id_1 = Uuid::new_v4().to_string();
        let org_name_1 = format!("Org 1 {}", Uuid::new_v4());
        let org_slug_1 = format!("org-1-{}", Uuid::new_v4());
        let proj_name_1 = format!("Proj 1 {}", Uuid::new_v4());
        let proj_slug_1 = format!("proj-1-{}", Uuid::new_v4());

        let (project1, org1) = match ProjectQueries::create_atomic(
            &pool,
            Some((&org_name_1, &org_slug_1, &user_id)),
            &org_id_1,
            &proj_name_1,
            &proj_slug_1,
            None,
            None,
            false,
        )
        .await
        {
            Ok(res) => res,
            Err(_) => return,
        };

        let org_id_2 = Uuid::new_v4().to_string();
        let org_name_2 = format!("Org 2 {}", Uuid::new_v4());
        let org_slug_2 = format!("org-2-{}", Uuid::new_v4());
        let proj_name_2 = format!("Proj 2 {}", Uuid::new_v4());
        let proj_slug_2 = format!("proj-2-{}", Uuid::new_v4());

        let (project2, org2) = match ProjectQueries::create_atomic(
            &pool,
            Some((&org_name_2, &org_slug_2, &user_id)),
            &org_id_2,
            &proj_name_2,
            &proj_slug_2,
            None,
            None,
            false,
        )
        .await
        {
            Ok(res) => res,
            Err(_) => return,
        };

        let branch2 = BranchQueries::get_default(&pool, &project2.id)
            .await
            .expect("Failed to get default branch")
            .expect("Default branch missing");

        // 1. PageService::get_page_by_path with project 1 and branch from project 2
        let res1 =
            PageService::get_page_by_path(&ctx, &user_id, &project1.id, &branch2.id, "/index")
                .await;
        assert!(
            res1.is_err(),
            "Accessing foreign branch via get_page_by_path must fail"
        );
        match res1.unwrap_err() {
            AppError::Conflict(msg) => {
                assert!(msg.contains("Branch does not belong to this project"))
            }
            err => panic!("Expected Conflict, got {:?}", err),
        }

        // 2. PageService::get_page_tree with project 1 and branch from project 2
        let res2 =
            PageService::get_page_tree(&ctx, &user_id, &project1.id, &branch2.id, None).await;
        assert!(
            res2.is_err(),
            "Accessing foreign branch via get_page_tree must fail"
        );
        match res2.unwrap_err() {
            AppError::Conflict(msg) => {
                assert!(msg.contains("Branch does not belong to this project"))
            }
            err => panic!("Expected Conflict, got {:?}", err),
        }

        // 3. DeploymentService::create_deployment with project 1 and branch from project 2
        let res3 = DeploymentService::create_deployment(
            &ctx,
            &user_id,
            &project1.id,
            CreateDeploymentRequest {
                project_id: project1.id.clone(),
                branch_id: Some(branch2.id.clone()),
            },
        )
        .await;
        assert!(res3.is_err(), "Deploying foreign branch must fail");
        match res3.unwrap_err() {
            AppError::Conflict(msg) => {
                assert!(msg.contains("Branch does not belong to this project"))
            }
            err => panic!("Expected Conflict, got {:?}", err),
        }

        // Cleanup
        for pid in [&project1.id, &project2.id] {
            let _ = cms_db::sqlx::query("DELETE FROM \"ProjectSettings\" WHERE project_id = $1")
                .bind(pid)
                .execute(&pool)
                .await;
            let _ = cms_db::sqlx::query("DELETE FROM \"Language\" WHERE project_id = $1")
                .bind(pid)
                .execute(&pool)
                .await;
            let _ = cms_db::sqlx::query("DELETE FROM \"Branch\" WHERE project_id = $1")
                .bind(pid)
                .execute(&pool)
                .await;
            let _ = cms_db::sqlx::query("DELETE FROM \"Project\" WHERE id = $1")
                .bind(pid)
                .execute(&pool)
                .await;
        }
        for oid in [&org1.id, &org2.id] {
            let _ = cms_db::sqlx::query("DELETE FROM \"Member\" WHERE organization_id = $1")
                .bind(oid)
                .execute(&pool)
                .await;
            let _ = cms_db::sqlx::query("DELETE FROM \"Organization\" WHERE id = $1")
                .bind(oid)
                .execute(&pool)
                .await;
        }
        let _ = cms_db::sqlx::query("DELETE FROM \"User\" WHERE id = $1")
            .bind(&user_id)
            .execute(&pool)
            .await;
    }

    #[tokio::test]
    async fn test_cross_page_comment_parent_idor_fails() {
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

        let ctx = BizContext::new(pool.clone(), std::sync::Arc::new(cms_authz::NoopAuthz));
        let user_id = format!("test-user-{}", Uuid::new_v4());
        let user_email = format!("test-{}@internal.company", Uuid::new_v4());
        let now = chrono::Utc::now();
        let _ = cms_db::sqlx::query(
            r#"INSERT INTO "User" (id, email, name, email_verified, role, created_at, updated_at)
               VALUES ($1, $2, 'Comment Test User', TRUE, 'user', $3, $3)"#,
        )
        .bind(&user_id)
        .bind(&user_email)
        .bind(now)
        .execute(&pool)
        .await;

        let org_id = Uuid::new_v4().to_string();
        let org_name = format!("Comment Org {}", Uuid::new_v4());
        let org_slug = format!("comment-org-{}", Uuid::new_v4());
        let proj_name = format!("Comment Proj {}", Uuid::new_v4());
        let proj_slug = format!("comment-proj-{}", Uuid::new_v4());

        let (project, org) = match ProjectQueries::create_atomic(
            &pool,
            Some((&org_name, &org_slug, &user_id)),
            &org_id,
            &proj_name,
            &proj_slug,
            None,
            None,
            false,
        )
        .await
        {
            Ok(res) => res,
            Err(_) => return,
        };

        let branch = BranchQueries::get_default(&pool, &project.id)
            .await
            .expect("Failed to get default branch")
            .expect("Default branch missing");

        let page1 = PageQueries::create(
            &pool,
            &project.id,
            &branch.id,
            None,
            None,
            Some("doc"),
            "page-1",
            "Page 1",
            None,
            Some("Content 1"),
            None,
            None,
            None,
            0,
            true,
        )
        .await
        .expect("Failed to create page 1");

        let page2 = PageQueries::create(
            &pool,
            &project.id,
            &branch.id,
            None,
            None,
            Some("doc"),
            "page-2",
            "Page 2",
            None,
            Some("Content 2"),
            None,
            None,
            None,
            1,
            true,
        )
        .await
        .expect("Failed to create page 2");

        let comment1 = CommentQueries::create(
            &pool,
            &page1.id,
            Some(&user_id),
            None,
            None,
            "Parent comment on page 1",
        )
        .await
        .expect("Failed to create comment 1");

        let res = CommentService::create_comment(
            &ctx,
            &user_id,
            &page2.id,
            CreateCommentRequest {
                page_id: page2.id.clone(),
                content: "Cross-page child comment attempt".to_string(),
                parent_id: Some(comment1.id.clone()),
            },
        )
        .await;

        assert!(res.is_err(), "Cross-page comment parent must fail");
        match res.unwrap_err() {
            AppError::Conflict(msg) => {
                assert!(msg.contains("Parent comment does not belong to this page"))
            }
            err => panic!("Expected Conflict, got {:?}", err),
        }

        // Cleanup
        let _ = cms_db::sqlx::query("DELETE FROM \"Comment\" WHERE page_id IN ($1, $2)")
            .bind(&page1.id)
            .bind(&page2.id)
            .execute(&pool)
            .await;
        let _ = cms_db::sqlx::query("DELETE FROM \"Page\" WHERE project_id = $1")
            .bind(&project.id)
            .execute(&pool)
            .await;
        let _ = cms_db::sqlx::query("DELETE FROM \"ProjectSettings\" WHERE project_id = $1")
            .bind(&project.id)
            .execute(&pool)
            .await;
        let _ = cms_db::sqlx::query("DELETE FROM \"Language\" WHERE project_id = $1")
            .bind(&project.id)
            .execute(&pool)
            .await;
        let _ = cms_db::sqlx::query("DELETE FROM \"Branch\" WHERE project_id = $1")
            .bind(&project.id)
            .execute(&pool)
            .await;
        let _ = cms_db::sqlx::query("DELETE FROM \"Project\" WHERE id = $1")
            .bind(&project.id)
            .execute(&pool)
            .await;
        let _ = cms_db::sqlx::query("DELETE FROM \"Member\" WHERE organization_id = $1")
            .bind(&org.id)
            .execute(&pool)
            .await;
        let _ = cms_db::sqlx::query("DELETE FROM \"Organization\" WHERE id = $1")
            .bind(&org.id)
            .execute(&pool)
            .await;
        let _ = cms_db::sqlx::query("DELETE FROM \"User\" WHERE id = $1")
            .bind(&user_id)
            .execute(&pool)
            .await;
    }

    #[tokio::test]
    async fn test_cross_project_asset_upload_fails() {
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

        let ctx = BizContext::new(pool.clone(), std::sync::Arc::new(cms_authz::NoopAuthz));
        let user_id = format!("test-user-{}", Uuid::new_v4());
        let user_email = format!("test-{}@internal.company", Uuid::new_v4());
        let now = chrono::Utc::now();
        let _ = cms_db::sqlx::query(
            r#"INSERT INTO "User" (id, email, name, email_verified, role, created_at, updated_at)
               VALUES ($1, $2, 'Asset Test User', TRUE, 'user', $3, $3)"#,
        )
        .bind(&user_id)
        .bind(&user_email)
        .bind(now)
        .execute(&pool)
        .await;

        let org_id_1 = Uuid::new_v4().to_string();
        let org_name_1 = format!("Asset Org 1 {}", Uuid::new_v4());
        let org_slug_1 = format!("asset-org-1-{}", Uuid::new_v4());
        let proj_name_1 = format!("Asset Proj 1 {}", Uuid::new_v4());
        let proj_slug_1 = format!("asset-proj-1-{}", Uuid::new_v4());

        let (project1, org1) = match ProjectQueries::create_atomic(
            &pool,
            Some((&org_name_1, &org_slug_1, &user_id)),
            &org_id_1,
            &proj_name_1,
            &proj_slug_1,
            None,
            None,
            false,
        )
        .await
        {
            Ok(res) => res,
            Err(_) => return,
        };

        let org_id_2 = Uuid::new_v4().to_string();
        let org_name_2 = format!("Asset Org 2 {}", Uuid::new_v4());
        let org_slug_2 = format!("asset-org-2-{}", Uuid::new_v4());
        let proj_name_2 = format!("Asset Proj 2 {}", Uuid::new_v4());
        let proj_slug_2 = format!("asset-proj-2-{}", Uuid::new_v4());

        let (project2, org2) = match ProjectQueries::create_atomic(
            &pool,
            Some((&org_name_2, &org_slug_2, &user_id)),
            &org_id_2,
            &proj_name_2,
            &proj_slug_2,
            None,
            None,
            false,
        )
        .await
        {
            Ok(res) => res,
            Err(_) => return,
        };

        let branch2 = BranchQueries::get_default(&pool, &project2.id)
            .await
            .expect("Failed to get default branch")
            .expect("Default branch missing");

        let page2 = PageQueries::create(
            &pool,
            &project2.id,
            &branch2.id,
            None,
            None,
            Some("doc"),
            "page-2",
            "Page 2",
            None,
            Some("Content 2"),
            None,
            None,
            None,
            0,
            true,
        )
        .await
        .expect("Failed to create page 2");

        let storage = Arc::new(LocalFsStorage::new(
            std::env::temp_dir().to_string_lossy().to_string(),
        ));
        let res = AssetService::upload_asset(
            &ctx,
            &user_id,
            storage,
            &project1.id,
            Some(&page2.id),
            CreateAssetRequest {
                project_id: project1.id.clone(),
                page_id: Some(page2.id.clone()),
                file_name: "test.png".to_string(),
                content_type: "image/png".to_string(),
                file_size: Some(10),
                width: None,
                height: None,
                alt_text: None,
            },
            Bytes::from_static(b"fakebytes"),
        )
        .await;

        assert!(res.is_err(), "Asset upload with foreign page must fail");
        match res.unwrap_err() {
            AppError::Conflict(msg) => {
                assert!(msg.contains("Page does not belong to this project"))
            }
            err => panic!("Expected Conflict, got {:?}", err),
        }

        // Cleanup
        let _ = cms_db::sqlx::query("DELETE FROM \"Page\" WHERE id = $1")
            .bind(&page2.id)
            .execute(&pool)
            .await;
        for pid in [&project1.id, &project2.id] {
            let _ = cms_db::sqlx::query("DELETE FROM \"ProjectSettings\" WHERE project_id = $1")
                .bind(pid)
                .execute(&pool)
                .await;
            let _ = cms_db::sqlx::query("DELETE FROM \"Language\" WHERE project_id = $1")
                .bind(pid)
                .execute(&pool)
                .await;
            let _ = cms_db::sqlx::query("DELETE FROM \"Branch\" WHERE project_id = $1")
                .bind(pid)
                .execute(&pool)
                .await;
            let _ = cms_db::sqlx::query("DELETE FROM \"Project\" WHERE id = $1")
                .bind(pid)
                .execute(&pool)
                .await;
        }
        for oid in [&org1.id, &org2.id] {
            let _ = cms_db::sqlx::query("DELETE FROM \"Member\" WHERE organization_id = $1")
                .bind(oid)
                .execute(&pool)
                .await;
            let _ = cms_db::sqlx::query("DELETE FROM \"Organization\" WHERE id = $1")
                .bind(oid)
                .execute(&pool)
                .await;
        }
        let _ = cms_db::sqlx::query("DELETE FROM \"User\" WHERE id = $1")
            .bind(&user_id)
            .execute(&pool)
            .await;
    }

    #[tokio::test]
    async fn test_integration_rbac_enforcement() {
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

        let owner_id = format!("owner-{}", Uuid::new_v4());
        let guest_id = format!("guest-{}", Uuid::new_v4());
        let admin_id = format!("admin-{}", Uuid::new_v4());
        let now = chrono::Utc::now();

        for (uid, name) in [
            (&owner_id, "Owner User"),
            (&guest_id, "Guest User"),
            (&admin_id, "Admin User"),
        ] {
            let email = format!(
                "{}-{}@internal.company",
                name.replace(' ', "-").to_lowercase(),
                Uuid::new_v4()
            );
            let _ = cms_db::sqlx::query(
                r#"INSERT INTO "User" (id, email, name, email_verified, role, created_at, updated_at)
                   VALUES ($1, $2, $3, TRUE, 'user', $4, $4)"#,
            )
            .bind(uid)
            .bind(email)
            .bind(name)
            .bind(now)
            .execute(&pool)
            .await;
        }

        let org_id = Uuid::new_v4().to_string();
        let org_name = format!("RBAC Org {}", Uuid::new_v4());
        let org_slug = format!("rbac-org-{}", Uuid::new_v4());
        let proj_name = format!("RBAC Proj {}", Uuid::new_v4());
        let proj_slug = format!("rbac-proj-{}", Uuid::new_v4());

        let (project, org) = match ProjectQueries::create_atomic(
            &pool,
            Some((&org_name, &org_slug, &owner_id)),
            &org_id,
            &proj_name,
            &proj_slug,
            None,
            None,
            false,
        )
        .await
        {
            Ok(res) => res,
            Err(_) => return,
        };

        // Add guest with Guest role
        let _ = MemberQueries::create(&pool, &guest_id, &org.id, MemberRole::Guest).await;
        // Add admin with Admin role
        let _ = MemberQueries::create(&pool, &admin_id, &org.id, MemberRole::Admin).await;

        let authz = Arc::new(cms_authz::ProductionAuthz::new(pool.clone()));
        let ctx = BizContext::new(pool.clone(), authz);

        // 1. Guest user attempts to create integration -> InsufficientRole (Admin required)
        let guest_req = CreateProjectIntegrationRequest {
            project_id: project.id.clone(),
            provider: IntegrationProvider::Webhook,
            name: "Webhook Integration".to_string(),
            config: serde_json::json!({}),
            webhook_url: Some("https://example.com/webhook".to_string()),
            is_active: true,
        };
        let res_guest = IntegrationService::create_integration(&ctx, &guest_id, guest_req).await;
        assert!(
            res_guest.is_err(),
            "Guest role must not be permitted to create integration"
        );
        match res_guest.unwrap_err() {
            AppError::InsufficientRole(msg) => assert!(msg.contains("Admin")),
            err => panic!("Expected InsufficientRole, got {:?}", err),
        }

        // 2. Admin user creates integration -> Ok
        let admin_req = CreateProjectIntegrationRequest {
            project_id: project.id.clone(),
            provider: IntegrationProvider::Webhook,
            name: "Webhook Integration Admin".to_string(),
            config: serde_json::json!({}),
            webhook_url: Some("https://example.com/webhook".to_string()),
            is_active: true,
        };
        let res_admin = IntegrationService::create_integration(&ctx, &admin_id, admin_req).await;
        assert!(
            res_admin.is_ok(),
            "Admin role must be permitted to create integration"
        );
        let integration = res_admin.unwrap();

        // 3. Guest user attempts to get integration -> InsufficientRole (Viewer required)
        let res_guest_get =
            IntegrationService::get_integration(&ctx, &guest_id, &integration.id).await;
        assert!(
            res_guest_get.is_err(),
            "Guest role must not be permitted to read integration"
        );
        match res_guest_get.unwrap_err() {
            AppError::InsufficientRole(msg) => assert!(msg.contains("Viewer")),
            err => panic!("Expected InsufficientRole, got {:?}", err),
        }

        // 4. Admin user reads integration -> Ok
        let res_admin_get =
            IntegrationService::get_integration(&ctx, &admin_id, &integration.id).await;
        assert!(
            res_admin_get.is_ok(),
            "Admin role must be permitted to read integration"
        );

        // Cleanup
        let _ = cms_db::sqlx::query("DELETE FROM \"ProjectIntegration\" WHERE project_id = $1")
            .bind(&project.id)
            .execute(&pool)
            .await;
        let _ = cms_db::sqlx::query("DELETE FROM \"ProjectSettings\" WHERE project_id = $1")
            .bind(&project.id)
            .execute(&pool)
            .await;
        let _ = cms_db::sqlx::query("DELETE FROM \"Language\" WHERE project_id = $1")
            .bind(&project.id)
            .execute(&pool)
            .await;
        let _ = cms_db::sqlx::query("DELETE FROM \"Branch\" WHERE project_id = $1")
            .bind(&project.id)
            .execute(&pool)
            .await;
        let _ = cms_db::sqlx::query("DELETE FROM \"Project\" WHERE id = $1")
            .bind(&project.id)
            .execute(&pool)
            .await;
        let _ = cms_db::sqlx::query("DELETE FROM \"Member\" WHERE organization_id = $1")
            .bind(&org.id)
            .execute(&pool)
            .await;
        let _ = cms_db::sqlx::query("DELETE FROM \"Organization\" WHERE id = $1")
            .bind(&org.id)
            .execute(&pool)
            .await;
        for uid in [&owner_id, &guest_id, &admin_id] {
            let _ = cms_db::sqlx::query("DELETE FROM \"User\" WHERE id = $1")
                .bind(uid)
                .execute(&pool)
                .await;
        }
    }

    #[tokio::test]
    async fn test_concurrent_branch_slug_creation_atomic() {
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

        let ctx = BizContext::new(pool.clone(), std::sync::Arc::new(cms_authz::NoopAuthz));
        let user_id = format!("test-user-{}", Uuid::new_v4());
        let user_email = format!("test-{}@internal.company", Uuid::new_v4());
        let now = chrono::Utc::now();
        let _ = cms_db::sqlx::query(
            r#"INSERT INTO "User" (id, email, name, email_verified, role, created_at, updated_at)
               VALUES ($1, $2, 'Concurrent Test User', TRUE, 'user', $3, $3)"#,
        )
        .bind(&user_id)
        .bind(&user_email)
        .bind(now)
        .execute(&pool)
        .await;

        let org_id = Uuid::new_v4().to_string();
        let org_name = format!("Concurrent Org {}", Uuid::new_v4());
        let org_slug = format!("concurrent-org-{}", Uuid::new_v4());
        let proj_name = format!("Concurrent Proj {}", Uuid::new_v4());
        let proj_slug = format!("concurrent-proj-{}", Uuid::new_v4());

        let (project, org) = match ProjectQueries::create_atomic(
            &pool,
            Some((&org_name, &org_slug, &user_id)),
            &org_id,
            &proj_name,
            &proj_slug,
            None,
            None,
            false,
        )
        .await
        {
            Ok(res) => res,
            Err(_) => return,
        };

        let mut handles = Vec::new();
        for _ in 0..5 {
            let ctx_c = ctx.clone();
            let uid_c = user_id.clone();
            let pid_c = project.id.clone();
            handles.push(tokio::spawn(async move {
                BranchService::create_branch(
                    &ctx_c,
                    &uid_c,
                    &pid_c,
                    CreateBranchRequest {
                        project_id: pid_c.clone(),
                        name: "concurrent-feature".to_string(),
                        description: None,
                        is_protected: false,
                    },
                )
                .await
            }));
        }

        let mut slugs = std::collections::HashSet::new();
        for handle in handles {
            let res = handle.await.expect("Task join failed");
            assert!(
                res.is_ok(),
                "Concurrent branch creation failed: {:?}",
                res.err()
            );
            let branch = res.unwrap();
            slugs.insert(branch.branch.slug);
        }

        assert_eq!(
            slugs.len(),
            5,
            "All 5 concurrent branches must receive distinct slugs without collisions"
        );
        assert!(
            slugs.contains("concurrent-feature"),
            "Primary slug must be allocated to one task"
        );

        // Cleanup
        let _ = cms_db::sqlx::query("DELETE FROM \"Branch\" WHERE project_id = $1")
            .bind(&project.id)
            .execute(&pool)
            .await;
        let _ = cms_db::sqlx::query("DELETE FROM \"ProjectSettings\" WHERE project_id = $1")
            .bind(&project.id)
            .execute(&pool)
            .await;
        let _ = cms_db::sqlx::query("DELETE FROM \"Language\" WHERE project_id = $1")
            .bind(&project.id)
            .execute(&pool)
            .await;
        let _ = cms_db::sqlx::query("DELETE FROM \"Project\" WHERE id = $1")
            .bind(&project.id)
            .execute(&pool)
            .await;
        let _ = cms_db::sqlx::query("DELETE FROM \"Member\" WHERE organization_id = $1")
            .bind(&org.id)
            .execute(&pool)
            .await;
        let _ = cms_db::sqlx::query("DELETE FROM \"Organization\" WHERE id = $1")
            .bind(&org.id)
            .execute(&pool)
            .await;
        let _ = cms_db::sqlx::query("DELETE FROM \"User\" WHERE id = $1")
            .bind(&user_id)
            .execute(&pool)
            .await;
    }
}
