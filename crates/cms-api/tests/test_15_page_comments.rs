mod common;

use axum::http::{Method, StatusCode};
use common::*;
use serde_json::json;
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_15_page_comments_lifecycle_and_resolution() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();

    let project = create_project(
        &ctx.app,
        &cookie,
        format!("Comment E2E {}", Uuid::new_v4().simple()),
        &ctx.seed.organization_id,
        true,
    )
    .await?;
    let project_id = required_string(&project, "id", "comment project")?;

    let languages = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/app/projects/{project_id}/languages"), Some(&cookie), None).await?,
        StatusCode::OK,
        "languages",
    )?;
    let english_id = languages["data"][0]["id"].as_str().unwrap();

    let page = create_page(
        &ctx.app,
        &cookie,
        project_id,
        json!({
            "title": "Commentable Page",
            "slug": "comment-doc",
            "kind": "PAGE",
            "languageId": english_id,
            "isPublished": true,
            "content": "# Discussing Specifications",
        }),
    )
    .await?;
    let page_id = required_string(&page, "id", "page")?;

    // Create root comment
    let comment_resp = expect_status(
        request(
            &ctx.app,
            Method::POST,
            "/api/app/comments",
            Some(&cookie),
            Some(json!({
                "page_id": page_id,
                "content": "Is this specification approved?",
            })),
        )
        .await?,
        StatusCode::OK,
        "create comment",
    )?;
    let comment_id = required_string(&comment_resp, "id", "comment")?;
    anyhow::ensure!(comment_resp["content"] == "Is this specification approved?");
    anyhow::ensure!(comment_resp["resolved"] == false);

    // Create reply comment
    let reply_resp = expect_status(
        request(
            &ctx.app,
            Method::POST,
            "/api/app/comments",
            Some(&cookie),
            Some(json!({
                "page_id": page_id,
                "parent_id": comment_id,
                "content": "Yes, approved by the team.",
            })),
        )
        .await?,
        StatusCode::OK,
        "create comment reply",
    )?;
    let reply_id = required_string(&reply_resp, "id", "reply")?;
    anyhow::ensure!(reply_resp["parent_id"] == comment_id);

    // Get comment with replies
    let comment_with_replies = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/app/comments/{comment_id}"), Some(&cookie), None).await?,
        StatusCode::OK,
        "get comment with replies",
    )?;
    let replies = comment_with_replies["replies"].as_array().ok_or_else(|| anyhow::anyhow!("replies array missing"))?;
    anyhow::ensure!(replies.iter().any(|r| r["id"] == reply_id));

    // Resolve parent comment
    let resolve_resp = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/comments/{comment_id}/resolve"),
            Some(&cookie),
            Some(json!({ "resolved": true })),
        )
        .await?,
        StatusCode::OK,
        "resolve comment",
    )?;
    anyhow::ensure!(resolve_resp["resolved"] == true);

    // List page comments filtering by resolved status
    let page_comments = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/app/comments/pages/{page_id}?resolved=true"), Some(&cookie), None).await?,
        StatusCode::OK,
        "list resolved page comments",
    )?;
    let resolved_list = page_comments["data"].as_array().ok_or_else(|| anyhow::anyhow!("comments data not array"))?;
    anyhow::ensure!(resolved_list.iter().any(|c| c["id"] == comment_id));

    // Delete comment
    let del_resp = expect_status(
        request(&ctx.app, Method::DELETE, &format!("/api/app/comments/{reply_id}"), Some(&cookie), None).await?,
        StatusCode::OK,
        "delete reply comment",
    )?;
    anyhow::ensure!(del_resp["success"] == true);

    ctx.teardown().await
}
