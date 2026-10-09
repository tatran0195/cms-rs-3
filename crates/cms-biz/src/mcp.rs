//! MCP Server Business Logic
//!
//! This module contains business logic for the Model Context Protocol (MCP) server.
//! MCP allows AI agents to query CMS documentation programmatically.

use cms_db::{
    branch::BranchQueries, mcp::McpAuditEventQueries, page::PageQueries, project::ProjectQueries,
};
use cms_entity::{
    common::PaginatedResponse,
    mcp::{operation_types, McpAuditEventResponse, McpResourceItem},
    project::Project,
};
use cms_error::AppError;

use crate::BizContext;

/// MCP service providing strongly typed domain operations for MCP tools and resources.
pub struct McpService;

impl McpService {
    /// Internal helper to check access to a project.
    /// Public projects are accessible to all; private projects require Viewer membership.
    async fn check_project_access(
        ctx: &BizContext,
        project_id: &str,
        user_id: Option<&str>,
    ) -> Result<Project, AppError> {
        let project = ProjectQueries::get_by_id(&ctx.pool, project_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Project not found".to_string()))?;

        if project.is_public {
            return Ok(project);
        }

        if let Some(uid) = user_id {
            let session = ctx.gatehouse.session();
            let auth_user = ctx.gatehouse.to_auth_user(uid, "");
            let target = cms_authz::ProjectTarget {
                id: project.id.to_string(),
                is_public: project.is_public,
                owner_id: None,
            };
            ctx.gatehouse
                .project_checker
                .bind(&session, &auth_user, &cms_authz::ProjectAction::View, &())
                .authorize(&target)
                .await
                .map_err(|_| AppError::Forbidden)?;
            Ok(project)
        } else {
            Err(AppError::Forbidden)
        }
    }

    /// Internal helper to record an audit event asynchronously without failing the operation.
    async fn record_audit_event(
        ctx: &BizContext,
        project_id: Option<&str>,
        user_id: Option<&str>,
        operation: &str,
        response_status: i32,
        error_message: Option<&str>,
    ) {
        let _ = McpAuditEventQueries::create(
            &ctx.pool,
            project_id,
            user_id,
            operation,
            None,
            Some(response_status),
            error_message,
        )
        .await;
    }

    /// Search project documentation pages using full-text search.
    pub async fn search(
        ctx: &BizContext,
        user_id: Option<&str>,
        query: &str,
        project_id: &str,
        limit: Option<i64>,
    ) -> Result<String, AppError> {
        Self::check_project_access(ctx, project_id, user_id).await?;

        let limit = limit.unwrap_or(10);
        let default_branch = BranchQueries::get_default(&ctx.pool, project_id).await?;
        let branch_id = default_branch.map(|b| b.id).unwrap_or_default();

        let pages = if !branch_id.is_empty() {
            PageQueries::get_by_project_and_branch(
                &ctx.pool,
                project_id,
                &branch_id,
                None,
                Some(true),
                Some(query),
                Some(limit),
                None,
            )
            .await?
        } else {
            vec![]
        };

        let mut content = format!("# Search Results for \"{}\"\n\n", query);
        if pages.is_empty() {
            content.push_str("No matching documentation pages found.\n");
        } else {
            for page in pages {
                content.push_str(&format!("## [{}]({})\n", page.title, page.path));
                if let Some(desc) = page.description {
                    content.push_str(&format!("{}\n\n", desc));
                } else {
                    content.push('\n');
                }
            }
        }

        Self::record_audit_event(
            ctx,
            Some(project_id),
            user_id,
            operation_types::SEARCH,
            200,
            None,
        )
        .await;

        Ok(content)
    }

    /// Get a specific page by path.
    pub async fn get_page(
        ctx: &BizContext,
        user_id: Option<&str>,
        project_id: &str,
        path: &str,
        branch_id: Option<&str>,
        max_chars: Option<usize>,
    ) -> Result<String, AppError> {
        Self::check_project_access(ctx, project_id, user_id).await?;

        let branch_id = match branch_id {
            Some(bid) => bid.to_string(),
            None => {
                let default_branch = BranchQueries::get_default(&ctx.pool, project_id).await?;
                default_branch.map(|b| b.id).unwrap_or_default()
            }
        };

        let page = PageQueries::get_by_path(&ctx.pool, project_id, &branch_id, path)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Page not found at path: {}", path)))?;

        let mut content = format!(
            "# {}\n\n*Path: {}*\n\n{}\n\n---\n*Last Updated: {}*",
            page.title, page.path, page.content, page.updated_at
        );

        if let Some(limit) = max_chars {
            if content.len() > limit {
                let mut end = limit;
                while end > 0 && !content.is_char_boundary(end) {
                    end -= 1;
                }
                content.truncate(end);
                content.push_str("\n\n... [Truncated: exceeded max_chars limit]");
            }
        }

        Self::record_audit_event(
            ctx,
            Some(project_id),
            user_id,
            operation_types::GET_PAGE,
            200,
            None,
        )
        .await;

        Ok(content)
    }

    /// List all pages in a project.
    pub async fn list_pages(
        ctx: &BizContext,
        user_id: Option<&str>,
        project_id: &str,
        branch_id: Option<&str>,
        limit: Option<i64>,
    ) -> Result<String, AppError> {
        Self::check_project_access(ctx, project_id, user_id).await?;

        let limit = limit.unwrap_or(50);
        let branch_id = match branch_id {
            Some(bid) => bid.to_string(),
            None => {
                let default_branch = BranchQueries::get_default(&ctx.pool, project_id).await?;
                default_branch.map(|b| b.id).unwrap_or_default()
            }
        };

        let pages = if !branch_id.is_empty() {
            PageQueries::get_by_project_and_branch(
                &ctx.pool,
                project_id,
                &branch_id,
                None,
                Some(true),
                None,
                Some(limit),
                None,
            )
            .await?
        } else {
            vec![]
        };

        let mut content = String::from("# Pages\n\n");
        if pages.is_empty() {
            content.push_str("No pages found in this project.\n");
        } else {
            for page in pages {
                content.push_str(&format!("- [{}]({})\n", page.title, page.path));
            }
        }

        Self::record_audit_event(
            ctx,
            Some(project_id),
            user_id,
            operation_types::LIST_PAGES,
            200,
            None,
        )
        .await;

        Ok(content)
    }

    /// Get project information.
    pub async fn get_project(
        ctx: &BizContext,
        user_id: Option<&str>,
        project_id: &str,
    ) -> Result<String, AppError> {
        let project = Self::check_project_access(ctx, project_id, user_id).await?;

        let content = format!(
            "# {}\n\n{}\n\n---\n\n*Created: {}*\n*Updated: {}*",
            project.name,
            project.description.as_deref().unwrap_or(""),
            project.created_at,
            project.updated_at
        );

        Self::record_audit_event(
            ctx,
            Some(project_id),
            user_id,
            operation_types::GET_PROJECT,
            200,
            None,
        )
        .await;

        Ok(content)
    }

    /// List documentation resources available for MCP exploration.
    /// Returns lightweight McpResourceItem metadata without fetching heavy Markdown bodies.
    pub async fn list_resources(
        ctx: &BizContext,
        user_id: Option<&str>,
    ) -> Result<Vec<McpResourceItem>, AppError> {
        let projects = ProjectQueries::list_by_user(&ctx.pool, user_id.unwrap_or(""))
            .await
            .unwrap_or_default();

        let mut resources = Vec::new();

        for project in projects {
            let default_branch = BranchQueries::get_default(&ctx.pool, &project.id).await?;
            if let Some(branch) = default_branch {
                let pages = PageQueries::get_by_project_and_branch(
                    &ctx.pool,
                    &project.id,
                    &branch.id,
                    None,
                    Some(true),
                    None,
                    None,
                    None,
                )
                .await
                .unwrap_or_default();

                for page in pages {
                    let path_suffix = if page.path.starts_with('/') {
                        page.path.clone()
                    } else {
                        format!("/{}", page.path)
                    };

                    resources.push(McpResourceItem {
                        uri: format!("cms://projects/{}/pages{}", project.id, path_suffix),
                        name: page.title.clone(),
                        description: Some(format!("Page '{}' in project '{}'", page.title, project.name)),
                        mime_type: "text/markdown".to_string(),
                    });
                }
            }
        }

        Self::record_audit_event(
            ctx,
            None,
            user_id,
            operation_types::RESOURCE_LIST,
            200,
            None,
        )
        .await;

        Ok(resources)
    }

    /// Read resource content by URI (e.g. cms://projects/{project_id}/pages/{path}).
    pub async fn read_resource(
        ctx: &BizContext,
        user_id: Option<&str>,
        uri: &str,
    ) -> Result<String, AppError> {
        let stripped = uri.strip_prefix("cms://projects/").ok_or_else(|| {
            AppError::InvalidInput(
                "Invalid resource URI scheme. Expected cms://projects/{project_id}/pages/{path}"
                    .to_string(),
            )
        })?;

        let (project_id, after) = stripped.split_once("/pages").ok_or_else(|| {
            AppError::InvalidInput(
                "Invalid resource URI format. Expected cms://projects/{project_id}/pages/{path}"
                    .to_string(),
            )
        })?;

        Self::check_project_access(ctx, project_id, user_id).await?;

        let default_branch = BranchQueries::get_default(&ctx.pool, project_id).await?;
        let branch_id = default_branch.map(|b| b.id).unwrap_or_default();

        let normalized_path = if after.starts_with('/') {
            after.to_string()
        } else if after.is_empty() {
            "/".to_string()
        } else {
            format!("/{}", after)
        };

        let raw_path = after.trim_start_matches('/');

        let page = match PageQueries::get_by_path(&ctx.pool, project_id, &branch_id, &normalized_path).await? {
            Some(p) => p,
            None => {
                if !raw_path.is_empty() {
                    PageQueries::get_by_path(&ctx.pool, project_id, &branch_id, raw_path)
                        .await?
                        .ok_or_else(|| AppError::NotFound(format!("Page not found at URI: {}", uri)))?
                } else {
                    return Err(AppError::NotFound(format!("Page not found at URI: {}", uri)));
                }
            }
        };

        Self::record_audit_event(
            ctx,
            Some(project_id),
            user_id,
            operation_types::RESOURCE_READ,
            200,
            None,
        )
        .await;

        Ok(page.content)
    }

    /// List audit events for administrative / telemetry consumption.
    #[allow(clippy::too_many_arguments)]
    pub async fn list_audit_events(
        ctx: &BizContext,
        _user_id: &str,
        project_id: Option<&str>,
        user_id_filter: Option<&str>,
        operation: Option<&str>,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<PaginatedResponse<McpAuditEventResponse>, AppError> {
        let events = McpAuditEventQueries::list(
            &ctx.pool,
            project_id,
            user_id_filter,
            operation,
            limit,
            offset,
        )
        .await?;
        let total = McpAuditEventQueries::count(
            &ctx.pool,
            project_id,
            user_id_filter,
            operation,
        )
        .await?;
        Ok(PaginatedResponse::new(
            events.into_iter().map(|e| e.into()).collect(),
            total as u64,
            1,
            20,
        ))
    }
}
