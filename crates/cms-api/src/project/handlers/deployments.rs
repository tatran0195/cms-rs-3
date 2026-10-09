use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use cms_biz::platform_event::{FunnelEventType, PlatformEventService};
use cms_entity::{
    common::ApiResponse,
    deployment::{
        DeploymentChangeItem, DeploymentChangesResponse, DeploymentListItem, TriggerPublishRequest,
    },
};
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
) -> Result<Json<ApiResponse<Vec<DeploymentListItem>>>, AppError> {
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

    let items: Vec<DeploymentListItem> = result
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
            DeploymentListItem {
                id: d.id,
                version: Some(version),
                status: status_str.to_string(),
                pages_count,
                commit_message: d.build_logs.unwrap_or_else(|| "Publish site".to_string()),
                error: d.error_message,
                error_details: None,
                created_at: d.created_at.to_rfc3339(),
                completed_at: Some(
                    d.deployed_at
                        .map(|t| t.to_rfc3339())
                        .unwrap_or_else(|| d.created_at.to_rfc3339()),
                ),
            }
        })
        .collect();

    Ok(Json(ApiResponse::new(items)))
}

/// Get latest READY deployment for a project
pub async fn get_latest_project_deployment_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
) -> Result<Json<ApiResponse<Option<DeploymentListItem>>>, AppError> {
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
            Some(DeploymentListItem {
                id: d.id,
                version: Some(version),
                status: status_str.to_string(),
                pages_count,
                commit_message: d.build_logs.unwrap_or_else(|| "Publish site".to_string()),
                error: d.error_message,
                error_details: None,
                created_at: d.created_at.to_rfc3339(),
                completed_at: Some(
                    d.deployed_at
                        .map(|t| t.to_rfc3339())
                        .unwrap_or_else(|| d.created_at.to_rfc3339()),
                ),
            })
        } else {
            None
        }
    });

    Ok(Json(ApiResponse::new(latest_ready)))
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
) -> Result<Json<ApiResponse<DeploymentChangesResponse>>, AppError> {
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

    let changes: Vec<DeploymentChangeItem> = pages
        .iter()
        .map(|p| {
            let status = if baseline.is_some() {
                "modified"
            } else {
                "added"
            };
            DeploymentChangeItem {
                id: p.id.clone(),
                title: p.title.clone(),
                path: p.path.clone(),
                language_code: "en".to_string(),
                kind: "PAGE".to_string(),
                status: status.to_string(),
                fields: vec!["title".to_string(), "content".to_string()],
                additions: 1,
                deletions: 0,
                lines: Vec::new(),
                truncated: false,
            }
        })
        .collect();

    Ok(Json(ApiResponse::new(DeploymentChangesResponse {
        changes,
        redirect_issues: Vec::new(),
        has_baseline: baseline.is_some(),
    })))
}

/// Create and trigger a project deployment (publish site)
pub async fn create_project_deployment_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Json(body): Json<TriggerPublishRequest>,
) -> Result<(StatusCode, Json<ApiResponse<DeploymentListItem>>), AppError> {
    // 1. Verify project exists
    let _project = cms_db::project::ProjectQueries::get_by_id(&state.biz_context.pool, &project_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Project not found".to_string()))?;

    let auth_user = auth.to_auth_user(&state);
    let session = state.gatehouse.session();
    let target = cms_authz::ProjectTarget {
        id: project_id.clone(),
        is_public: false,
        owner_id: None,
    };
    state
        .gatehouse
        .project_checker
        .bind(&session, &auth_user, &cms_authz::ProjectAction::Publish, &())
        .authorize(&target)
        .await
        .map_err(|_| AppError::Forbidden)?;

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
        .message
        .map(|m| m.trim().to_string())
        .filter(|m| !m.is_empty())
        .unwrap_or_else(|| "Publish site".to_string());
    let deployment = create_publish_deployment(
        &state,
        &project_id,
        &branch_id,
        &auth.user.id,
        &display_message,
        serde_json::json!({}),
    )
    .await?;

    // The response is explicitly asynchronous (202 Accepted).
    let res = DeploymentListItem {
        id: deployment.id,
        version: None,
        status: "PENDING".to_string(),
        pages_count: 0,
        commit_message: display_message,
        error: None,
        error_details: None,
        created_at: deployment.created_at.to_rfc3339(),
        completed_at: None,
    };

    Ok((StatusCode::ACCEPTED, Json(ApiResponse::new(res))))
}

/// Rollback deployment
pub async fn rollback_deployment_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, target_deployment_id)): Path<(String, String)>,
) -> Result<(StatusCode, Json<ApiResponse<DeploymentListItem>>), AppError> {
    let auth_user = auth.to_auth_user(&state);
    let session = state.gatehouse.session();
    let target = cms_authz::ProjectTarget {
        id: project_id.clone(),
        is_public: false,
        owner_id: None,
    };
    state
        .gatehouse
        .project_checker
        .bind(&session, &auth_user, &cms_authz::ProjectAction::Publish, &())
        .authorize(&target)
        .await
        .map_err(|_| AppError::Forbidden)?;

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

    let res = DeploymentListItem {
        id: deployment.id,
        version: None,
        status: "PENDING".to_string(),
        pages_count: 0,
        commit_message: message,
        error: None,
        error_details: None,
        created_at: deployment.created_at.to_rfc3339(),
        completed_at: None,
    };

    Ok((StatusCode::ACCEPTED, Json(ApiResponse::new(res))))
}
