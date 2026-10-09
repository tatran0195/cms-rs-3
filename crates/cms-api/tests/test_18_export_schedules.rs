mod common;

use axum::http::{Method, StatusCode};
use common::*;
use serde_json::json;
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_18_export_schedules_lifecycle() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();

    let project = create_project(
        &ctx.app,
        &cookie,
        format!("Export E2E {}", Uuid::new_v4().simple()),
        true,
    )
    .await?;
    let project_id = required_string(&project, "id", "export project")?;

    // Create an export schedule
    let schedule_resp = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/export/projects/{project_id}/schedules"),
            Some(&cookie),
            Some(json!({
                "project_id": project_id,
                "format": "html",
                "frequency": "weekly",
                "day_of_week": 1,
                "time_of_day": "02:00:00",
                "is_active": true,
            })),
        )
        .await?,
        StatusCode::OK,
        "create export schedule",
    )?;
    let schedule_id = required_string(&schedule_resp, "id", "schedule")?;
    anyhow::ensure!(schedule_resp["format"] == "html");
    anyhow::ensure!(schedule_resp["frequency"] == "weekly");
    anyhow::ensure!(schedule_resp["is_active"] == true);

    // List export schedules for project
    let schedules = expect_status(
        request(
            &ctx.app,
            Method::GET,
            &format!("/api/app/export/projects/{project_id}/schedules"),
            Some(&cookie),
            None,
        )
        .await?,
        StatusCode::OK,
        "list project export schedules",
    )?;
    let sched_list = schedules
        .as_array()
        .ok_or_else(|| anyhow::anyhow!("schedules not array"))?;
    anyhow::ensure!(sched_list.iter().any(|s| s["id"] == schedule_id));

    // Update export schedule
    let updated_schedule = expect_status(
        request(
            &ctx.app,
            Method::PUT,
            &format!("/api/app/export/schedules/{schedule_id}"),
            Some(&cookie),
            Some(json!({
                "frequency": "daily",
                "time_of_day": "04:30:00",
            })),
        )
        .await?,
        StatusCode::OK,
        "update export schedule",
    )?;
    anyhow::ensure!(updated_schedule["frequency"] == "daily");
    anyhow::ensure!(updated_schedule["time_of_day"] == "04:30:00");

    // Delete export schedule
    let del_sched = expect_status(
        request(
            &ctx.app,
            Method::DELETE,
            &format!("/api/app/export/schedules/{schedule_id}"),
            Some(&cookie),
            None,
        )
        .await?,
        StatusCode::OK,
        "delete export schedule",
    )?;
    anyhow::ensure!(del_sched["success"] == true);

    ctx.teardown().await
}
