mod common;

use axum::http::{Method, StatusCode};
use common::*;
use serde_json::json;
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_04_page_hierarchy_and_tree_reordering() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();

    let project = create_project(
        &ctx.app,
        &cookie,
        format!("Hierarchy E2E {}", Uuid::new_v4().simple()),
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

    let rtl_lang = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/languages"),
            Some(&cookie),
            Some(json!({ "code": "he-il", "name": "Hebrew", "direction": "RTL" })),
        )
        .await?,
        StatusCode::OK,
        "create rtl",
    )?;
    let rtl_id = rtl_lang["data"]["id"].as_str().unwrap();

    let en_group = create_page(
        &ctx.app,
        &cookie,
        project_id,
        json!({
            "title": "Guide",
            "slug": "guide",
            "kind": "GROUP",
            "languageId": english_id,
            "isPublished": true,
        }),
    )
    .await?;
    let en_group_id = required_string(&en_group, "id", "en group")?;

    let rtl_group = create_page(
        &ctx.app,
        &cookie,
        project_id,
        json!({
            "title": "מדריך",
            "slug": "guide",
            "kind": "GROUP",
            "languageId": rtl_id,
            "isPublished": true,
        }),
    )
    .await?;
    let rtl_group_id = required_string(&rtl_group, "id", "rtl group")?;

    let rtl_page = create_page(
        &ctx.app,
        &cookie,
        project_id,
        json!({
            "title": "התחלה",
            "slug": "start",
            "kind": "PAGE",
            "parentId": rtl_group_id,
            "languageId": rtl_id,
            "translationKey": "getting-started",
            "isPublished": true,
            "content": "# התחלה",
        }),
    )
    .await?;
    let rtl_page_id = required_string(&rtl_page, "id", "rtl page")?;
    anyhow::ensure!(rtl_page["path"] == "/guide/start");

    expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/pages"),
            Some(&cookie),
            Some(json!({
                "title": "Cross scope",
                "slug": "cross-scope",
                "parentId": en_group_id,
                "languageId": rtl_id,
            })),
        )
        .await?,
        StatusCode::CONFLICT,
        "reject parenting under different language",
    )?;

    let draft_page = create_page(
        &ctx.app,
        &cookie,
        project_id,
        json!({
            "title": "Draft",
            "slug": "draft",
            "parentId": rtl_group_id,
            "languageId": rtl_id,
            "isPublished": false,
            "content": "Draft",
        }),
    )
    .await?;
    let draft_id = required_string(&draft_page, "id", "draft")?;

    let reorder = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/pages/reorder"),
            Some(&cookie),
            Some(json!({
                "items": [
                    { "id": rtl_group_id, "parentId": null, "position": 0 },
                    { "id": rtl_page_id, "parentId": rtl_group_id, "position": 1 },
                    { "id": draft_id, "parentId": rtl_group_id, "position": 2 },
                ]
            })),
        )
        .await?,
        StatusCode::OK,
        "reorder tree",
    )?;
    anyhow::ensure!(reorder["data"]["success"] == true);

    expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/pages/reorder"),
            Some(&cookie),
            Some(json!({
                "items": [
                    { "id": rtl_group_id, "parentId": rtl_page_id, "position": 0 },
                    { "id": rtl_page_id, "parentId": rtl_group_id, "position": 1 },
                    { "id": draft_id, "parentId": rtl_group_id, "position": 2 },
                ]
            })),
        )
        .await?,
        StatusCode::CONFLICT,
        "reject cycle",
    )?;

    let unnest = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/pages/reorder"),
            Some(&cookie),
            Some(json!({
                "items": [
                    { "id": rtl_group_id, "parentId": null, "position": 0 },
                    { "id": rtl_page_id, "parentId": rtl_group_id, "position": 0 },
                    { "id": draft_id, "parentId": null, "position": 1 },
                ]
            })),
        )
        .await?,
        StatusCode::OK,
        "unnest page to root",
    )?;
    anyhow::ensure!(unnest["data"]["success"] == true);

    let draft_row: (Option<String>, String) = sqlx::query_as(r#"SELECT parent_id, path FROM "Page" WHERE id = $1"#)
        .bind(draft_id)
        .fetch_one(&ctx.state.biz_context.pool)
        .await?;
    anyhow::ensure!(draft_row.0.is_none());
    anyhow::ensure!(draft_row.1 == "/draft");

    expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/pages/reorder"),
            Some(&cookie),
            Some(json!({
                "items": [
                    { "id": rtl_group_id, "parentId": null, "position": 0 },
                    { "id": rtl_group_id, "parentId": null, "position": 1 },
                ]
            })),
        )
        .await?,
        StatusCode::BAD_REQUEST,
        "reject duplicate id in reorder",
    )?;

    expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/pages/reorder"),
            Some(&cookie),
            Some(json!({
                "items": [{ "id": rtl_group_id, "parentId": rtl_group_id, "position": 0 }],
            })),
        )
        .await?,
        StatusCode::CONFLICT,
        "reject self-parenting",
    )?;

    expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/pages/reorder"),
            Some(&cookie),
            Some(json!({
                "items": [{ "id": rtl_page_id, "parentId": "non-existent-id", "position": 0 }],
            })),
        )
        .await?,
        StatusCode::CONFLICT,
        "reject non-existent parent",
    )?;

    let del_group = expect_status(
        request(&ctx.app, Method::DELETE, &format!("/api/app/projects/{project_id}/pages/{rtl_group_id}"), Some(&cookie), None).await?,
        StatusCode::OK,
        "delete group",
    )?;
    anyhow::ensure!(del_group["data"]["success"] == true);

    let reparented = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/app/projects/{project_id}/pages/{rtl_page_id}"), Some(&cookie), None).await?,
        StatusCode::OK,
        "read reparented child",
    )?;
    anyhow::ensure!(reparented["data"]["path"] == "/start");
    anyhow::ensure!(reparented["data"]["parentId"].is_null());

    ctx.teardown().await
}
