//! MCP parameter types, schemas, and security context.

use serde::{Deserialize, Serialize};

/// Search project documentation using Tantivy full-text search.
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
pub struct SearchParams {
    /// Keyword search query or question
    pub query: String,
    /// UUID of the documentation project to search
    pub project_id: String,
    /// Maximum results to return (default: 10, max: 50)
    pub limit: Option<i64>,
}

/// Retrieve the full markdown content of a documentation page.
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
pub struct GetPageParams {
    /// UUID of the project
    pub project_id: String,
    /// Path to the page (e.g., "/getting-started/installation")
    pub path: String,
    /// Optional branch ID (defaults to project default branch)
    pub branch_id: Option<String>,
    /// Max character limit for content truncation (prevents context blowout)
    pub max_chars: Option<usize>,
}

/// List all available documentation pages in a project hierarchy.
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
pub struct ListPagesParams {
    /// UUID of the project
    pub project_id: String,
    /// Optional branch ID
    pub branch_id: Option<String>,
    /// Pagination limit (default: 50, max: 200)
    pub limit: Option<i64>,
}

/// Retrieve project metadata and configuration.
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
pub struct GetProjectParams {
    /// UUID of the project
    pub project_id: String,
}

/// Security identity and authorization context for MCP operations.
#[derive(Debug, Clone)]
pub struct McpSecurityContext {
    pub user_id: Option<String>,
    pub scopes: Vec<String>,
    pub is_admin: bool,
}

impl McpSecurityContext {
    /// Create an anonymous security context with no scopes.
    pub fn anonymous() -> Self {
        Self {
            user_id: None,
            scopes: vec![],
            is_admin: false,
        }
    }

    /// Create a system-level security context with wildcard access.
    pub fn system() -> Self {
        Self {
            user_id: Some("system".to_string()),
            scopes: vec!["*".to_string()],
            is_admin: true,
        }
    }

    /// Create a security context with specific user ID and scopes.
    pub fn for_user(user_id: impl Into<String>, scopes: Vec<String>) -> Self {
        Self {
            user_id: Some(user_id.into()),
            scopes,
            is_admin: false,
        }
    }

    /// Check if the context has the required scope or wildcard scope.
    pub fn has_scope(&self, required: &str) -> bool {
        self.is_admin || self.scopes.iter().any(|s| s == required || s == "*")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use schemars::schema_for;

    #[test]
    fn test_search_params_schema() {
        let schema = schema_for!(SearchParams);
        let json = serde_json::to_string(&schema).unwrap();
        assert!(json.contains("query"));
        assert!(json.contains("project_id"));
    }

    #[test]
    fn test_get_page_params_schema() {
        let schema = schema_for!(GetPageParams);
        let json = serde_json::to_string(&schema).unwrap();
        assert!(json.contains("path"));
        assert!(json.contains("max_chars"));
    }

    #[test]
    fn test_security_context_scopes() {
        let ctx = McpSecurityContext::for_user("usr_123", vec!["search:read".to_string()]);
        assert!(ctx.has_scope("search:read"));
        assert!(!ctx.has_scope("pages:read"));

        let admin = McpSecurityContext::system();
        assert!(admin.has_scope("anything"));
    }
}
