use std::sync::Arc;
use cms_biz::BizContext;
use cms_mcp::{create_mcp_http_service, McpSecurityContext};

#[tokio::test]
async fn test_mcp_http_service_e2e_handshake() {
    let pool = cms_db::sqlx::PgPool::connect_lazy("postgres://localhost/test").unwrap();
    let authz = Arc::new(cms_authz::AuthzState::new(pool.clone(), vec![]));
    let ctx = Arc::new(BizContext::new(pool, authz));
    let service = create_mcp_http_service(ctx, McpSecurityContext::system());

    let app = axum::Router::new().nest_service("/mcp", service);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();

    let server_task = tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });

    let client = reqwest::Client::new();
    let url = format!("http://{addr}/mcp");

    // 1. Initialize MCP Handshake
    let init_req = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-03-26",
            "capabilities": {},
            "clientInfo": {
                "name": "e2e-client",
                "version": "1.0.0"
            }
        }
    });

    let resp = client
        .post(&url)
        .header("content-type", "application/json")
        .header("accept", "application/json, text/event-stream")
        .json(&init_req)
        .send()
        .await
        .expect("Failed to send initialize request");

    assert_eq!(resp.status(), reqwest::StatusCode::OK);

    // Extract session id if present before consuming resp
    let session_id = resp
        .headers()
        .get("mcp-session-id")
        .and_then(|h| h.to_str().ok())
        .map(|s| s.to_string());

    let text = resp.text().await.expect("Failed to get response text");

    // Extract JSON from SSE `data: {...}` lines or direct JSON body
    let json_str = text
        .lines()
        .filter_map(|l| l.strip_prefix("data: "))
        .find(|l| l.trim().starts_with('{'))
        .unwrap_or(&text);

    let body: serde_json::Value =
        serde_json::from_str(json_str).expect("Failed to parse init response JSON");

    assert_eq!(body.get("jsonrpc").and_then(|v| v.as_str()), Some("2.0"));
    assert_eq!(body.get("id").and_then(|v| v.as_i64()), Some(1));

    let result = body.get("result").expect("Expected result in init response");
    let server_info = result.get("serverInfo").expect("Expected serverInfo");
    assert_eq!(server_info.get("name").and_then(|v| v.as_str()), Some("cms-mcp"));

    let capabilities = result.get("capabilities").expect("Expected capabilities");
    assert!(capabilities.get("tools").is_some());
    assert!(capabilities.get("resources").is_some());
    assert!(capabilities.get("prompts").is_some());

    // 2. Initialized notification
    let mut init_notif = client
        .post(&url)
        .header("content-type", "application/json")
        .json(&serde_json::json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized",
            "params": {}
        }));
    if let Some(ref sid) = session_id {
        init_notif = init_notif.header("mcp-session-id", sid);
    }
    let _ = init_notif.send().await;

    // 3. List Prompts
    let mut prompt_req = client
        .post(&url)
        .header("content-type", "application/json")
        .header("accept", "application/json, text/event-stream")
        .json(&serde_json::json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "prompts/list",
            "params": {}
        }));
    if let Some(ref sid) = session_id {
        prompt_req = prompt_req.header("mcp-session-id", sid);
    }
    let prompt_resp = prompt_req.send().await.expect("Failed to send prompts/list");
    let prompt_text = prompt_resp.text().await.unwrap_or_default();
    let prompt_json_str = prompt_text
        .lines()
        .filter_map(|l| l.strip_prefix("data: "))
        .find(|l| l.trim().starts_with('{'))
        .unwrap_or(&prompt_text);

    if let Ok(prompt_body) = serde_json::from_str::<serde_json::Value>(prompt_json_str) {
        if let Some(prompts) = prompt_body.pointer("/result/prompts").and_then(|v| v.as_array()) {
            let names: Vec<&str> = prompts.iter().filter_map(|p| p.get("name").and_then(|n| n.as_str())).collect();
            assert!(names.contains(&"troubleshoot_topic"));
            assert!(names.contains(&"explain_architecture"));
        }
    }

    server_task.abort();
}
