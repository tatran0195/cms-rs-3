//! MCP ServerHandler implementation powered by rmcp.

use std::sync::Arc;

use cms_biz::{mcp::McpService, BizContext};
use rmcp::{
    handler::server::wrapper::Parameters,
    model::*,
    service::{RequestContext, RoleServer},
    tool, tool_handler, tool_router, ErrorData, ServerHandler,
};

use crate::types::*;

#[inline]
fn mcp_err(code: ErrorCode, msg: impl Into<String>) -> ErrorData {
    ErrorData::new(code, msg.into(), None)
}

/// Primary Model Context Protocol handler for CMS documentation.
#[derive(Clone)]
pub struct CmsMcpHandler {
    pub ctx: Arc<BizContext>,
    pub security: McpSecurityContext,
}

impl CmsMcpHandler {
    /// Create a new handler instance with business context and security credentials.
    pub fn new(ctx: Arc<BizContext>, security: McpSecurityContext) -> Self {
        Self { ctx, security }
    }

    fn check_scope(&self, scope: &str) -> Result<(), ErrorData> {
        if self.security.has_scope(scope) {
            Ok(())
        } else {
            Err(mcp_err(
                ErrorCode::INVALID_REQUEST,
                format!("Access denied: missing required scope '{scope}'"),
            ))
        }
    }
}

#[tool_router]
impl CmsMcpHandler {
    /// Search project documentation pages using keyword and full-text search.
    #[tool(description = "Search project documentation using full-text search")]
    async fn search(
        &self,
        Parameters(args): Parameters<SearchParams>,
    ) -> Result<CallToolResult, ErrorData> {
        self.check_scope("search:read")?;

        let text = McpService::search(
            &self.ctx,
            self.security.user_id.as_deref(),
            self.security.org_id.as_deref(),
            &args.query,
            &args.project_id,
            args.limit,
        )
        .await
        .map_err(|e| mcp_err(ErrorCode::INTERNAL_ERROR, e.to_string()))?;

        Ok(CallToolResult::success(vec![ContentBlock::text(text)]))
    }

    /// Retrieve the full markdown content of a documentation page by path.
    #[tool(description = "Get the full markdown content of a page by project ID and path")]
    async fn get_page(
        &self,
        Parameters(args): Parameters<GetPageParams>,
    ) -> Result<CallToolResult, ErrorData> {
        self.check_scope("pages:read")?;

        let text = McpService::get_page(
            &self.ctx,
            self.security.user_id.as_deref(),
            self.security.org_id.as_deref(),
            &args.project_id,
            &args.path,
            args.branch_id.as_deref(),
            args.max_chars,
        )
        .await
        .map_err(|e| mcp_err(ErrorCode::INTERNAL_ERROR, e.to_string()))?;

        Ok(CallToolResult::success(vec![ContentBlock::text(text)]))
    }

    /// List all documentation pages in a project.
    #[tool(description = "List all documentation pages in a project")]
    async fn list_pages(
        &self,
        Parameters(args): Parameters<ListPagesParams>,
    ) -> Result<CallToolResult, ErrorData> {
        self.check_scope("pages:read")?;

        let text = McpService::list_pages(
            &self.ctx,
            self.security.user_id.as_deref(),
            self.security.org_id.as_deref(),
            &args.project_id,
            args.branch_id.as_deref(),
            args.limit,
        )
        .await
        .map_err(|e| mcp_err(ErrorCode::INTERNAL_ERROR, e.to_string()))?;

        Ok(CallToolResult::success(vec![ContentBlock::text(text)]))
    }

    /// Retrieve project metadata and description.
    #[tool(description = "Get project information and metadata")]
    async fn get_project(
        &self,
        Parameters(args): Parameters<GetProjectParams>,
    ) -> Result<CallToolResult, ErrorData> {
        self.check_scope("projects:read")?;

        let text = McpService::get_project(
            &self.ctx,
            self.security.user_id.as_deref(),
            self.security.org_id.as_deref(),
            &args.project_id,
        )
        .await
        .map_err(|e| mcp_err(ErrorCode::INTERNAL_ERROR, e.to_string()))?;

        Ok(CallToolResult::success(vec![ContentBlock::text(text)]))
    }
}

#[tool_handler]
impl ServerHandler for CmsMcpHandler {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(
            ServerCapabilities::builder()
                .enable_tools()
                .enable_resources()
                .enable_prompts()
                .build(),
        )
        .with_server_info(Implementation::new("cms-mcp", env!("CARGO_PKG_VERSION")))
        .with_instructions(
            "Access CMS documentation pages, search documentation, and explore project structures.",
        )
    }

    async fn list_resources(
        &self,
        _params: Option<PaginatedRequestParams>,
        _ctx: RequestContext<RoleServer>,
    ) -> Result<ListResourcesResult, ErrorData> {
        self.check_scope("pages:read")?;

        let items = McpService::list_resources(&self.ctx, self.security.user_id.as_deref())
            .await
            .map_err(|e| mcp_err(ErrorCode::INTERNAL_ERROR, e.to_string()))?;

        let resources = items
            .into_iter()
            .map(|item| {
                let mut res = Resource::new(item.uri, item.name);
                res.mime_type = Some(item.mime_type);
                res.description = item.description;
                res
            })
            .collect();

        Ok(ListResourcesResult::with_all_items(resources))
    }

    async fn read_resource(
        &self,
        params: ReadResourceRequestParams,
        _ctx: RequestContext<RoleServer>,
    ) -> Result<ReadResourceResponse, ErrorData> {
        self.check_scope("pages:read")?;

        let text = McpService::read_resource(
            &self.ctx,
            self.security.user_id.as_deref(),
            &params.uri,
        )
        .await
        .map_err(|e| mcp_err(ErrorCode::INTERNAL_ERROR, e.to_string()))?;

        Ok(ReadResourceResult::new(vec![ResourceContents::text(text, params.uri)]).into())
    }

    async fn list_prompts(
        &self,
        _params: Option<PaginatedRequestParams>,
        _ctx: RequestContext<RoleServer>,
    ) -> Result<ListPromptsResult, ErrorData> {
        let prompts = vec![
            Prompt::new(
                "troubleshoot_topic",
                Some("Search documentation and provide step-by-step troubleshooting for a topic"),
                Some(vec![
                    PromptArgument::new("project_id")
                        .with_description("Target project ID")
                        .with_required(true),
                    PromptArgument::new("topic")
                        .with_description("Topic or error description to troubleshoot")
                        .with_required(true),
                ]),
            ),
            Prompt::new(
                "explain_architecture",
                Some("Summarize project structure and key components from documentation"),
                Some(vec![PromptArgument::new("project_id")
                    .with_description("Target project ID")
                    .with_required(true)]),
            ),
        ];

        Ok(ListPromptsResult::with_all_items(prompts))
    }

    async fn get_prompt(
        &self,
        params: GetPromptRequestParams,
        _ctx: RequestContext<RoleServer>,
    ) -> Result<GetPromptResponse, ErrorData> {
        let args = params.arguments.unwrap_or_default();
        match params.name.as_str() {
            "troubleshoot_topic" => {
                let project_id = args.get("project_id").cloned().unwrap_or_default();
                let topic = args.get("topic").cloned().unwrap_or_default();
                let prompt_text = format!(
                    "Please search the project documentation for project '{project_id}' regarding '{topic}'. Identify root causes and output a concise, step-by-step resolution."
                );

                let res =
                    GetPromptResult::new(vec![PromptMessage::new_text(Role::User, prompt_text)])
                        .with_description("Troubleshooting prompt");
                Ok(res.into())
            }
            "explain_architecture" => {
                let project_id = args.get("project_id").cloned().unwrap_or_default();
                let prompt_text = format!(
                    "Please list the pages and structure for project '{project_id}' and synthesize a comprehensive architecture overview."
                );

                let res =
                    GetPromptResult::new(vec![PromptMessage::new_text(Role::User, prompt_text)])
                        .with_description("Architecture overview prompt");
                Ok(res.into())
            }
            other => Err(mcp_err(
                ErrorCode::INVALID_PARAMS,
                format!("Unknown prompt: {other}"),
            )),
        }
    }
}
