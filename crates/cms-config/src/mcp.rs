use serde::Deserialize;

/// MCP configuration
#[derive(Debug, Clone, Deserialize)]
pub struct McpConfig {
    /// Whether MCP server is enabled
    #[serde(default)]
    pub enabled: bool,

    /// Maximum concurrent MCP connections
    #[serde(default = "default_mcp_max_connections")]
    pub max_connections: usize,

    /// MCP rate limit per minute
    #[serde(default = "default_mcp_rate_limit")]
    pub rate_limit: usize,
}

fn default_mcp_max_connections() -> usize {
    100
}
fn default_mcp_rate_limit() -> usize {
    60
}

impl Default for McpConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            max_connections: default_mcp_max_connections(),
            rate_limit: default_mcp_rate_limit(),
        }
    }
}
