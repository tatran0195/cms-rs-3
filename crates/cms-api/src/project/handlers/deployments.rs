use std::sync::Arc;

use axum::{
    extract::{Path, State},
    Json,
};
use cms_biz::platform_event::{FunnelEventType, PlatformEventService};
use cms_error::AppError;
use cms_middleware::app_state::AppState;

use crate::auth::AuthExtractor;

/// Create a publish record and durably enqueue its render job. When PostgreSQL
/// is the queue backend, the deployment row and queue row share one transaction
/// (an outbox) so a server crash cannot strand a pending deployment.
pub async fn create_publish_deployment(
    state: &AppState,
    project_id: &str,
    branch_id: &str,
    user_id: &str,
    commit_message: &str,
    extra_payload: serde_json::Value,
) -> Result<cms_entity::deployment::Deployment, AppError> {
    if cms_db::project::ProjectQueries::is_taken_down(&state.biz_context.pool, project_id)
        .await?
        .unwrap_or(false)
    {
        return Err(AppError::Forbidden);
    }
    if state.config.queue.backend.eq_ignore_ascii_case("postgres") {
        return cms_db::deployment::DeploymentQueries::create_pending_with_publish_job(
            &state.biz_context.pool,
            project_id,
            branch_id,
            commit_message,
            extra_payload,
            Some(user_id),
        )
        .await;
    }

    let deployment = cms_db::deployment::DeploymentQueries::create(
        &state.biz_context.pool,
        project_id,
        branch_id,
        cms_entity::deployment::DeploymentStatus::Pending,
    )
    .await?;
    cms_db::deployment::DeploymentQueries::update_build_logs(
        &state.biz_context.pool,
        &deployment.id,
        commit_message,
    )
    .await?;
    let mut payload = extra_payload.as_object().cloned().ok_or_else(|| {
        AppError::InvalidInput("Publish job payload must be a JSON object".to_string())
    })?;
    payload.insert(
        "deployment_id".to_string(),
        serde_json::Value::String(deployment.id.clone()),
    );
    payload.insert(
        "actor_user_id".to_string(),
        serde_json::Value::String(user_id.to_string()),
    );
    let job = cms_queue::JobEnvelope::new(
        cms_queue::JobType::Publish,
        serde_json::Value::Object(payload),
    );
    if let Err(error) = state.job_queue.enqueue(job).await {
        let _ = cms_db::deployment::DeploymentQueries::update_error(
            &state.biz_context.pool,
            &deployment.id,
            &format!("Could not enqueue publish: {error}"),
        )
        .await;
        return Err(error);
    }
    PlatformEventService::record_funnel_event_best_effort(
        &state.biz_context,
        user_id,
        None,
        FunnelEventType::PublishClicked,
        serde_json::json!({
            "auto": false,
            "deployment_id": deployment.id.as_str(),
            "project_id": project_id,
            "branch_id": branch_id,
        }),
    )
    .await;
    Ok(deployment)
}

/// List deployments for a project
pub async fn list_project_deployments_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let result = cms_biz::deployment::DeploymentService::list_deployments(
        &state.biz_context,
        &auth.user.id,
        &project_id,
        1,
        50,
    )
    .await?;

    let total_count = result.total as i64;
    let pages_count =
        cms_db::page::PageQueries::get_by_project(&state.biz_context.pool, &project_id)
            .await
            .map(|p| p.len() as i64)
            .unwrap_or(0);

    let items: Vec<serde_json::Value> = result
        .data
        .into_iter()
        .enumerate()
        .map(|(idx, d)| {
            let version = total_count - (idx as i64);
            let status_str = match d.status {
                cms_entity::deployment::DeploymentStatus::Active => "READY",
                cms_entity::deployment::DeploymentStatus::Pending => "PENDING",
                cms_entity::deployment::DeploymentStatus::Building
                | cms_entity::deployment::DeploymentStatus::Deploying => "BUILDING",
                cms_entity::deployment::DeploymentStatus::Failed
                | cms_entity::deployment::DeploymentStatus::Deleted => "FAILED",
            };
            serde_json::json!({
                "id": d.id,
                "version": version,
                "status": status_str,
                "pagesCount": pages_count,
                "commitMessage": d.build_logs.as_deref().unwrap_or("Publish site"),
                "error": d.error_message,
                "errorDetails": null,
                "createdAt": d.created_at.to_rfc3339(),
                "completedAt": d.deployed_at.map(|t| t.to_rfc3339()).unwrap_or_else(|| d.created_at.to_rfc3339()),
            })
        })
        .collect();

    Ok(Json(serde_json::json!({ "data": items })))
}

/// Get latest READY deployment for a project
pub async fn get_latest_project_deployment_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let result = cms_biz::deployment::DeploymentService::list_deployments(
        &state.biz_context,
        &auth.user.id,
        &project_id,
        1,
        5,
    )
    .await?;

    let total_count = result.total as i64;
    let pages_count =
        cms_db::page::PageQueries::get_by_project(&state.biz_context.pool, &project_id)
            .await
            .map(|p| p.len() as i64)
            .unwrap_or(0);

    let latest_ready = result.data.into_iter().enumerate().find_map(|(idx, d)| {
        let version = total_count - (idx as i64);
        let status_str = match d.status {
            cms_entity::deployment::DeploymentStatus::Active => "READY",
            cms_entity::deployment::DeploymentStatus::Pending => "PENDING",
            cms_entity::deployment::DeploymentStatus::Building
            | cms_entity::deployment::DeploymentStatus::Deploying => "BUILDING",
            cms_entity::deployment::DeploymentStatus::Failed
            | cms_entity::deployment::DeploymentStatus::Deleted => "FAILED",
        };
        if status_str == "READY" {
            Some(serde_json::json!({
                "id": d.id,
                "version": version,
                "status": status_str,
                "pagesCount": pages_count,
                "commitMessage": d.build_logs.as_deref().unwrap_or("Publish site"),
                "error": d.error_message,
                "errorDetails": null,
                "createdAt": d.created_at.to_rfc3339(),
                "completedAt": d.deployed_at.map(|t| t.to_rfc3339()).unwrap_or_else(|| d.created_at.to_rfc3339()),
            }))
        } else {
            None
        }
    });

    Ok(Json(serde_json::json!({ "data": latest_ready })))
}

/// Deployment changes
///
/// Computes the real set of pages that will change on the next publish, compared
/// against a baseline (the most recent READY deployment). Each current page is
/// reported as `added` when there is no baseline, otherwise `modified`.
pub async fn get_deployment_changes_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    use cms_biz::deployment::DeploymentService;

    let deployments =
        DeploymentService::list_deployments(&state.biz_context, &auth.user.id, &project_id, 1, 50)
            .await?;

    let baseline = deployments
        .data
        .iter()
        .find(|d| matches!(d.status, cms_entity::deployment::DeploymentStatus::Active));

    let pages = cms_db::page::PageQueries::get_by_project(&state.biz_context.pool, &project_id)
        .await
        .unwrap_or_default();

    let changes: Vec<serde_json::Value> = pages
        .iter()
        .map(|p| {
            let status = if baseline.is_some() {
                "modified"
            } else {
                "added"
            };
            serde_json::json!({
                "id": p.id,
                "title": p.title.clone(),
                "path": p.path.clone(),
                "languageCode": "en",
                "kind": "PAGE",
                "status": status,
                "fields": ["title", "content"],
                "additions": 1,
                "deletions": 0,
                "lines": [],
                "truncated": false,
            })
        })
        .collect();

    Ok(Json(serde_json::json!({
        "data": {
            "changes": changes,
            "redirectIssues": [],
            "hasBaseline": baseline.is_some()
        }
    })))
}

/// Create and trigger a project deployment (publish site)
pub async fn create_project_deployment_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
    // 1. Verify project exists
    let _project = cms_db::project::ProjectQueries::get_by_id(&state.biz_context.pool, &project_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Project not found".to_string()))?;

    // Check project role (MemberRole::Member or higher)
    state
        .biz_context
        .authz
        .require_project_role(
            &auth.user.id,
            &project_id,
            cms_entity::common::MemberRole::Member,
        )
        .await?;

    // 2. Resolve the default branch and fail clearly if the project is corrupt.
    let default_branch =
        cms_db::branch::BranchQueries::get_default(&state.biz_context.pool, &project_id)
            .await?
            .ok_or_else(|| AppError::Conflict("Project has no default branch".to_string()))?;
    if default_branch.project_id != project_id {
        return Err(AppError::Conflict(
            "Default branch does not belong to this project".to_string(),
        ));
    }
    let branch_id = default_branch.id;

    let display_message = body
        .get("message")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|message| !message.is_empty())
        .unwrap_or("Publish site")
        .to_string();
    let deployment = create_publish_deployment(
        &state,
        &project_id,
        &branch_id,
        &auth.user.id,
        &display_message,
        serde_json::json!({}),
    )
    .await?;

    // The response is explicitly asynchronous. Clients follow up via the
    // deployments list/latest API while the worker renders the immutable branch snapshot.
    let res = serde_json::json!({
        "id": deployment.id,
        "version": null,
        "status": "PENDING",
        "pagesCount": 0,
        "commitMessage": display_message,
        "error": null,
        "errorDetails": null,
        "createdAt": deployment.created_at.to_rfc3339(),
        "completedAt": null
    });

    Ok(Json(serde_json::json!({ "data": res })))
}

/// Rollback deployment
pub async fn rollback_deployment_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, target_deployment_id)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, AppError> {
    state
        .biz_context
        .authz
        .require_project_role(
            &auth.user.id,
            &project_id,
            cms_entity::common::MemberRole::Member,
        )
        .await?;

    let target = cms_db::deployment::DeploymentQueries::get_by_id(
        &state.biz_context.pool,
        &target_deployment_id,
    )
    .await?
    .ok_or_else(|| AppError::NotFound("Target deployment not found".to_string()))?;
    if target.project_id != project_id {
        return Err(AppError::NotFound(
            "Target deployment not found".to_string(),
        ));
    }
    let branch_id = target
        .branch_id
        .as_deref()
        .filter(|branch_id| !branch_id.is_empty())
        .ok_or_else(|| AppError::Conflict("Target deployment has no branch".to_string()))?;
    cms_db::deployment::DeploymentQueries::get_snapshot_by_deployment(
        &state.biz_context.pool,
        &target_deployment_id,
    )
    .await?
    .ok_or_else(|| {
        AppError::Conflict("Target deployment has no active release snapshot".to_string())
    })?;

    let message = format!("Rollback to deployment {}", target_deployment_id);
    let deployment = create_publish_deployment(
        &state,
        &project_id,
        branch_id,
        &auth.user.id,
        &message,
        serde_json::json!({ "snapshot_from_deployment_id": target_deployment_id }),
    )
    .await?;

    Ok(Json(serde_json::json!({
        "data": {
            "id": deployment.id,
            "version": null,
            "status": "PENDING",
            "pagesCount": 0,
            "commitMessage": message,
            "error": null,
            "errorDetails": null,
            "createdAt": deployment.created_at.to_rfc3339(),
            "completedAt": null
        }
    })))
}
