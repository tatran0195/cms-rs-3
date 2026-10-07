//! MCP (Model Context Protocol) entity types

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::common::Id;

/// MCP audit event entity
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct McpAuditEvent {
    pub id: Id,
    pub organization_id: Option<Id>,
    pub project_id: Option<Id>,
    pub user_id: Option<Id>,
    pub operation: String,
    pub request_id: Option<String>,
    pub response_status: Option<i32>,
    pub error_message: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// MCP audit event response
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct McpAuditEventResponse {
    pub id: Id,
    pub organization_id: Option<Id>,
    pub project_id: Option<Id>,
    pub user_id: Option<Id>,
    pub operation: String,
    pub request_id: Option<String>,
    pub response_status: Option<i32>,
    pub error_message: Option<String>,
    pub created_at: DateTime<Utc>,
}

impl From<McpAuditEvent> for McpAuditEventResponse {
    fn from(event: McpAuditEvent) -> Self {
        Self {
            id: event.id,
            organization_id: event.organization_id,
            project_id: event.project_id,
            user_id: event.user_id,
            operation: event.operation,
            request_id: event.request_id,
            response_status: event.response_status,
            error_message: event.error_message,
            created_at: event.created_at,
        }
    }
}

/// List MCP audit events query
#[derive(Debug, Clone, Deserialize, Serialize, utoipa::ToSchema)]
pub struct ListMcpAuditEventsQuery {
    #[serde(default)]
    pub organization_id: Option<Id>,
    #[serde(default)]
    pub project_id: Option<Id>,
    #[serde(default)]
    pub user_id: Option<Id>,
    #[serde(default)]
    pub operation: Option<String>,
    #[serde(default)]
    pub start_date: Option<DateTime<Utc>>,
    #[serde(default)]
    pub end_date: Option<DateTime<Utc>>,
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub offset: Option<i64>,
}

/// MCP resource representation for listing
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
pub struct McpResourceItem {
    pub uri: String,
    pub name: String,
    pub description: Option<String>,
    pub mime_type: String,
}

/// MCP operation types
pub mod operation_types {
    pub const SEARCH: &str = "search";
    pub const GET_PAGE: &str = "get_page";
    pub const LIST_PAGES: &str = "list_pages";
    pub const GET_PROJECT: &str = "get_project";
    pub const RESOURCE_READ: &str = "resource.read";
    pub const RESOURCE_LIST: &str = "resource.list";
}
