//! MCP ServerHandler implementation powered by rmcp.

use std::sync::Arc;

use cms_biz::{mcp::McpService, BizContext};
use cms_entity::mcp::McpRequest;
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

        let request = McpRequest {
            tool_name: "search".to_string(),
            arguments: serde_json::json!({
                "query": args.query,
                "project_id": args.project_id,
                "limit": args.limit.unwrap_or(10),
            }),
        };

        let resp = McpService::execute_tool(
            &self.ctx,
            self.security.user_id.as_deref(),
            self.security.org_id.as_deref(),
            request,
        )
        .await
        .map_err(|e| mcp_err(ErrorCode::INTERNAL_ERROR, e.to_string()))?;

        if resp.is_error {
            let msg = resp
                .error_message
                .unwrap_or_else(|| "Search failed".to_string());
            Ok(CallToolResult::error(vec![ContentBlock::text(msg)]))
        } else {
            let text = resp
                .result
                .get("content")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            Ok(CallToolResult::success(vec![ContentBlock::text(text)]))
        }
    }

    /// Retrieve the full markdown content of a documentation page by path.
    #[tool(description = "Get the full markdown content of a page by project ID and path")]
    async fn get_page(
        &self,
        Parameters(args): Parameters<GetPageParams>,
    ) -> Result<CallToolResult, ErrorData> {
        self.check_scope("pages:read")?;

        let request = McpRequest {
            tool_name: "get_page".to_string(),
            arguments: serde_json::json!({
                "project_id": args.project_id,
                "path": args.path,
                "branch_id": args.branch_id,
            }),
        };

        let resp = McpService::execute_tool(
            &self.ctx,
            self.security.user_id.as_deref(),
            self.security.org_id.as_deref(),
            request,
        )
        .await
        .map_err(|e| mcp_err(ErrorCode::INTERNAL_ERROR, e.to_string()))?;

        if resp.is_error {
            let msg = resp
                .error_message
                .unwrap_or_else(|| "Failed to get page".to_string());
            Ok(CallToolResult::error(vec![ContentBlock::text(msg)]))
        } else {
            let mut text = resp
                .result
                .get("content")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            // Truncate if max_chars parameter specified
            if let Some(limit) = args.max_chars {
                if text.len() > limit {
                    text.truncate(limit);
                    text.push_str("\n\n... [Truncated: exceeded max_chars limit]");
                }
            }

            Ok(CallToolResult::success(vec![ContentBlock::text(text)]))
        }
    }

    /// List all documentation pages in a project.
    #[tool(description = "List all documentation pages in a project")]
    async fn list_pages(
        &self,
        Parameters(args): Parameters<ListPagesParams>,
    ) -> Result<CallToolResult, ErrorData> {
        self.check_scope("pages:read")?;

        let request = McpRequest {
            tool_name: "list_pages".to_string(),
            arguments: serde_json::json!({
                "project_id": args.project_id,
                "branch_id": args.branch_id,
                "limit": args.limit.unwrap_or(50),
            }),
        };

        let resp = McpService::execute_tool(
            &self.ctx,
            self.security.user_id.as_deref(),
            self.security.org_id.as_deref(),
            request,
        )
        .await
        .map_err(|e| mcp_err(ErrorCode::INTERNAL_ERROR, e.to_string()))?;

        if resp.is_error {
            let msg = resp
                .error_message
                .unwrap_or_else(|| "Failed to list pages".to_string());
            Ok(CallToolResult::error(vec![ContentBlock::text(msg)]))
        } else {
            let text = resp
                .result
                .get("content")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            Ok(CallToolResult::success(vec![ContentBlock::text(text)]))
        }
    }

    /// Retrieve project metadata and description.
    #[tool(description = "Get project information and metadata")]
    async fn get_project(
        &self,
        Parameters(args): Parameters<GetProjectParams>,
    ) -> Result<CallToolResult, ErrorData> {
        self.check_scope("projects:read")?;

        let request = McpRequest {
            tool_name: "get_project".to_string(),
            arguments: serde_json::json!({
                "project_id": args.project_id,
            }),
        };

        let resp = McpService::execute_tool(
            &self.ctx,
            self.security.user_id.as_deref(),
            self.security.org_id.as_deref(),
            request,
        )
        .await
        .map_err(|e| mcp_err(ErrorCode::INTERNAL_ERROR, e.to_string()))?;

        if resp.is_error {
            let msg = resp
                .error_message
                .unwrap_or_else(|| "Failed to get project".to_string());
            Ok(CallToolResult::error(vec![ContentBlock::text(msg)]))
        } else {
            let text = resp
                .result
                .get("content")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            Ok(CallToolResult::success(vec![ContentBlock::text(text)]))
        }
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

        let val =
            McpService::list_resources(&self.ctx, self.security.user_id.as_deref().unwrap_or(""))
                .await
                .map_err(|e| mcp_err(ErrorCode::INTERNAL_ERROR, e.to_string()))?;

        let mut resources = Vec::new();
        if let Some(arr) = val.as_array() {
            for item in arr {
                if let (Some(uri), Some(name)) = (
                    item.get("uri").and_then(|v| v.as_str()),
                    item.get("name").and_then(|v| v.as_str()),
                ) {
                    let mut res = Resource::new(uri, name);
                    res.mime_type = Some("text/markdown".to_string());
                    res.description = item
                        .get("description")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    resources.push(res);
                }
            }
        }

        Ok(ListResourcesResult::with_all_items(resources))
    }

    async fn read_resource(
        &self,
        params: ReadResourceRequestParams,
        _ctx: RequestContext<RoleServer>,
    ) -> Result<ReadResourceResponse, ErrorData> {
        self.check_scope("pages:read")?;

        let val = McpService::read_resource(
            &self.ctx,
            self.security.user_id.as_deref().unwrap_or(""),
            &params.uri,
        )
        .await
        .map_err(|e| mcp_err(ErrorCode::INTERNAL_ERROR, e.to_string()))?;

        let text = val
            .get("contents")
            .and_then(|c| c.as_array())
            .and_then(|arr| arr.first())
            .and_then(|first| first.get("text"))
            .and_then(|t| t.as_str())
            .unwrap_or("")
            .to_string();

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
