mod common;

use axum::http::{Method, StatusCode};
use common::*;
use serde_json::json;
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_06_public_search_and_grounded_qa() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();

    let project = create_project(
        &ctx.app,
        &cookie,
        format!("SearchQA E2E {}", Uuid::new_v4().simple()),
        &ctx.seed.organization_id,
        true,
    )
    .await?;
    let project_id = required_string(&project, "id", "project")?;

    let languages = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/app/projects/{project_id}/languages"), Some(&cookie), None).await?,
        StatusCode::OK,
        "languages",
    )?;
    let english_id = languages["data"][0]["id"].as_str().unwrap();

    let rtl_resp = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/languages"),
            Some(&cookie),
            Some(json!({ "code": "he-il", "name": "Hebrew", "direction": "RTL" })),
        )
        .await?,
        StatusCode::OK,
        "rtl",
    )?;
    let rtl_id = rtl_resp["data"]["id"].as_str().unwrap();

    let en_page = create_page(
        &ctx.app,
        &cookie,
        project_id,
        json!({
            "title": "Search Guide",
            "slug": "guide",
            "kind": "PAGE",
            "languageId": english_id,
            "isPublished": true,
            "content": "# Search Guide\n\nQuantum algorithms and distributed consensus.",
        }),
    )
    .await?;
    let en_page_id = required_string(&en_page, "id", "en page")?;

    let rtl_page = create_page(
        &ctx.app,
        &cookie,
        project_id,
        json!({
            "title": "מדריך חיפוש",
            "slug": "guide",
            "kind": "PAGE",
            "languageId": rtl_id,
            "isPublished": true,
            "content": "# מדריך חיפוש\n\nאלגוריתמי קוונטים וקונצנזוס מבוזר.",
        }),
    )
    .await?;
    let rtl_page_id = required_string(&rtl_page, "id", "rtl page")?;

    let deployment = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/deployments"),
            Some(&cookie),
            Some(json!({ "message": "SearchQA publish" })),
        )
        .await?,
        StatusCode::OK,
        "publish",
    )?;
    let deployment_id = required_string(&deployment["data"], "id", "deployment")?;
    wait_for_deployment_ready(&ctx.state, deployment_id).await?;

    let en_search = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/public/sites/{project_id}/search?q=Quantum&lang=en&version=main"), None, None).await?,
        StatusCode::OK,
        "en search",
    )?;
    anyhow::ensure!(en_search["data"]["hits"].as_array().is_some_and(|h| h.iter().any(|hit| hit["id"] == en_page_id)));

    let rtl_search = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/public/sites/{project_id}/search?q=Quantum&lang=he-IL&version=main"), None, None).await?,
        StatusCode::OK,
        "rtl search isolation",
    )?;
    anyhow::ensure!(rtl_search["data"]["hits"].as_array().is_some_and(Vec::is_empty));

    let qa = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/public/sites/{project_id}/answer"),
            None,
            Some(json!({ "question": "אלגוריתמי", "lang": "he-IL", "version": "main" })),
        )
        .await?,
        StatusCode::OK,
        "grounded qa",
    )?;
    anyhow::ensure!(qa["data"]["mode"] == "extractive");
    anyhow::ensure!(qa["data"]["sources"].as_array().is_some_and(|s| s.iter().any(|src| src["id"] == rtl_page_id)));

    expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/public/sites/{project_id}/events"),
            None,
            Some(json!({
                "type": "page_view",
                "userId": &ctx.seed.user_id,
                "ip": "203.0.113.195",
                "metadata": { "path": "guide" },
            })),
        )
        .await?,
        StatusCode::OK,
        "public analytics event",
    )?;

    let stored: (Option<String>, Option<String>) = sqlx::query_as(
        r#"SELECT user_id, ip_address FROM "AnalyticsEvent" WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1"#,
    )
    .bind(project_id)
    .fetch_one(&ctx.state.biz_context.pool)
    .await?;
    anyhow::ensure!(stored.0.is_none(), "user_id stripped for privacy");
    anyhow::ensure!(stored.1.is_none(), "ip stripped for privacy");

    ctx.teardown().await
}
