use std::sync::Arc;
use cms_biz::BizContext;
use cms_mcp::{
    handler::CmsMcpHandler,
    types::{GetPageParams, GetProjectParams, ListPagesParams, McpSecurityContext, SearchParams},
};
use rmcp::ServerHandler;

fn create_test_handler(security: McpSecurityContext) -> CmsMcpHandler {
    let pool = cms_db::sqlx::PgPool::connect_lazy("postgres://localhost/test").unwrap();
    let gatehouse = Arc::new(cms_authz::GatehouseState::new(pool.clone(), vec![]));
    let ctx = Arc::new(BizContext::new(pool, gatehouse));
    CmsMcpHandler::new(ctx, security)
}

#[test]
fn test_security_context_scopes() {
    let system = McpSecurityContext::system();
    assert!(system.has_scope("search:read"));
    assert!(system.has_scope("pages:read"));
    assert!(system.has_scope("projects:read"));
    assert!(system.has_scope("mcp:connect"));

    let read_only = McpSecurityContext::for_user(
        "usr_123",
        vec!["search:read".into(), "pages:read".into()],
    );
    assert!(read_only.has_scope("search:read"));
    assert!(read_only.has_scope("pages:read"));
    assert!(!read_only.has_scope("projects:read"));
}

#[test]
fn test_search_params_deserialization() {
    let json = serde_json::json!({
        "query": "authentication",
        "project_id": "proj_abc",
        "limit": 5
    });
    let params: SearchParams = serde_json::from_value(json).unwrap();
    assert_eq!(params.query, "authentication");
    assert_eq!(params.project_id, "proj_abc");
    assert_eq!(params.limit, Some(5));
}

#[test]
fn test_get_page_params_deserialization() {
    let json = serde_json::json!({
        "project_id": "proj_1",
        "path": "/getting-started",
        "max_chars": 2000
    });
    let params: GetPageParams = serde_json::from_value(json).unwrap();
    assert_eq!(params.project_id, "proj_1");
    assert_eq!(params.path, "/getting-started");
    assert_eq!(params.max_chars, Some(2000));
    assert!(params.branch_id.is_none());
}

#[test]
fn test_list_pages_params_deserialization() {
    let json = serde_json::json!({
        "project_id": "proj_1"
    });
    let params: ListPagesParams = serde_json::from_value(json).unwrap();
    assert_eq!(params.project_id, "proj_1");
    assert_eq!(params.limit, None);
}

#[test]
fn test_get_project_params_deserialization() {
    let json = serde_json::json!({
        "project_id": "proj_99"
    });
    let params: GetProjectParams = serde_json::from_value(json).unwrap();
    assert_eq!(params.project_id, "proj_99");
}

#[tokio::test]
async fn test_server_handler_get_info() {
    let handler = create_test_handler(McpSecurityContext::system());
    let info = handler.get_info();

    assert_eq!(info.server_info.name, "cms-mcp");
    assert_eq!(info.server_info.version, env!("CARGO_PKG_VERSION"));
    assert!(info.capabilities.tools.is_some());
    assert!(info.capabilities.resources.is_some());
    assert!(info.capabilities.prompts.is_some());
    assert!(info.instructions.unwrap().contains("CMS documentation"));
}

#[tokio::test]
async fn test_create_mcp_http_service() {
    let pool = cms_db::sqlx::PgPool::connect_lazy("postgres://localhost/test").unwrap();
    let gatehouse = Arc::new(cms_authz::GatehouseState::new(pool.clone(), vec![]));
    let ctx = Arc::new(BizContext::new(pool, gatehouse));
    let service = cms_mcp::create_mcp_http_service(ctx, McpSecurityContext::system());
    let _router: axum::Router = axum::Router::new().nest_service("/api/mcp", service);
}
