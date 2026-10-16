//! Export handlers
//!
//! This module contains the actual implementation of export handlers.

use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    Json,
};
use cms_authz::Relation;
use cms_authz_gate::{require_parent_access, require_project_access, ParentLink};
use cms_biz::export::ExportService;
use cms_entity::{
    common::{Id, PaginatedResponse},
    export::{
        CreateExportJobRequest, CreateExportScheduleRequest, ExportFormat, ExportJobResponse,
        ExportScheduleResponse, ListExportJobsQuery, UpdateExportScheduleRequest,
    },
};
use cms_error::AppError;
use cms_middleware::app_state::AppState;
use uuid::Uuid;

use crate::auth::AuthExtractor;

/// List export jobs
///
/// Returns a paginated list of export jobs filtered by snapshot, status, and format.
#[utoipa::path(
    get,
    path = "/export/jobs",
    tag = "export",
    security(
        ("bearerAuth" = []),
        ("apiKeyAuth" = []),
        ("cookieAuth" = []),
    ),
    params(
        ("snapshot_id", Query, description = "Filter by snapshot ID"),
        ("status", Query, description = "Filter by job status"),
        ("format", Query, description = "Filter by export format"),
        ("limit", Query, description = "Number of items per page"),
        ("offset", Query, description = "Pagination offset"),
    ),
    responses(
        (status = 200, description = "List of export jobs", body = PaginatedResponse<ExportJobResponse>),
        (status = 401, description = "Unauthorized"),
        (status = 400, description = "Bad request"),
    )
)]
pub async fn list_export_jobs_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Query(query): Query<ListExportJobsQuery>,
) -> Result<Json<PaginatedResponse<ExportJobResponse>>, AppError> {
    let project_id = if let Some(proj_id) = query.project_id.as_deref() {
        proj_id.to_string()
    } else if let Some(snap_id) = query.snapshot_id.as_deref() {
        let snapshot = cms_db::export::ExportSnapshotQueries::get_by_id(&state.pool, snap_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Snapshot not found".to_string()))?;
        snapshot.project_id
    } else {
        return Err(AppError::BadRequest(
            "project_id or snapshot_id query parameter is required".to_string(),
        ));
    };
    let project_uuid = Uuid::parse_str(&project_id)
        .map_err(|_| AppError::NotFound("Project not found".to_string()))?;
    require_project_access(
        state.authz_backend(),
        &auth.authz_context(),
        project_uuid,
        Relation::Viewer,
    )
    .await?;

    let page_size = query.limit.unwrap_or(20).max(1) as u64;
    let offset = query.offset.unwrap_or(0).max(0) as u64;
    let page = (offset / page_size) + 1;
    let result = ExportService::list_export_jobs(
        &state.biz_context(),
        &auth.user.id,
        &project_id,
        page,
        page_size,
    )
    .await?;

    Ok(Json(result))
}

/// Create a new export job
///
/// Creates a new export job for a project snapshot.
#[utoipa::path(
    post,
    path = "/export/jobs",
    tag = "export",
    security(
        ("bearerAuth" = []),
        ("apiKeyAuth" = []),
        ("cookieAuth" = []),
    ),
    request_body = CreateExportJobRequest,
    responses(
        (status = 200, description = "Export job created successfully", body = ExportJobResponse),
        (status = 400, description = "Bad request"),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Forbidden - user may not have permission"),
    )
)]
pub async fn create_export_job_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Json(request): Json<CreateExportJobRequest>,
) -> Result<Json<ExportJobResponse>, AppError> {
    let effective_format = request
        .format
        .or_else(|| request.formats.as_ref().and_then(|f| f.first().copied()))
        .unwrap_or(ExportFormat::Markdown);

    let (project_id, snapshot_id) = if let Some(snap_id) = request.resolved_snapshot_id() {
        let snapshot =
            cms_db::export::ExportSnapshotQueries::get_by_id(&state.pool, snap_id)
                .await?
                .ok_or_else(|| AppError::NotFound("Snapshot not found".to_string()))?;
        (snapshot.project_id, snap_id.to_string())
    } else if let Some(proj_id) = request.resolved_project_id() {
        let snap = ExportService::create_export_snapshot(
            &state.biz_context(),
            &auth.user.id,
            cms_entity::export::CreateExportRequest {
                project_id: proj_id.to_string(),
                branch_id: None,
                language_id: None,
                format: effective_format,
                snapshot_id: None,
            },
        )
        .await?;
        (proj_id.to_string(), snap.id)
    } else {
        return Err(AppError::BadRequest(
            "snapshot_id or project_id is required".to_string(),
        ));
    };

    let project_uuid = Uuid::parse_str(&project_id)
        .map_err(|_| AppError::NotFound("Project not found".to_string()))?;
    require_project_access(
        state.authz_backend(),
        &auth.authz_context(),
        project_uuid,
        Relation::Editor,
    )
    .await?;

    let format_strings: Vec<String> = request
        .formats
        .as_ref()
        .map(|fmts| {
            fmts.iter()
                .map(|f| format!("{:?}", f).to_uppercase())
                .collect()
        })
        .unwrap_or_else(|| vec![format!("{:?}", effective_format).to_uppercase()]);

    let job = ExportService::create_export_job(
        &state.biz_context(),
        &auth.user.id,
        &snapshot_id,
        Some(&project_id),
        effective_format,
        Some(&format_strings),
        Some("MANUAL"),
    )
    .await?;

    let mut resp = ExportJobResponse::from(job.clone());
    if let Ok(Some(snap)) = cms_db::export::ExportSnapshotQueries::get_by_id(&state.pool, &snapshot_id).await {
        resp.snapshot = Some(cms_entity::export::ExportSnapshotDetails {
            id: snap.id,
            deployment_version: snap.deployment_version,
            pages_count: snap.pages_count,
            created_at: snap.created_at,
        });
    }

    let job_envelope = cms_queue::JobEnvelope::new(
        cms_queue::JobType::Export,
        serde_json::json!({
            "job_id": job.id,
            "snapshot_id": snapshot_id,
            "format": format!("{:?}", effective_format).to_lowercase(),
        }),
    );
    let _ = state.job_queue.enqueue(job_envelope).await;

    Ok(Json(resp))
}

/// Get a specific export job
///
/// Retrieves an export job by its unique identifier.
#[utoipa::path(
    get,
    path = "/export/jobs/{job_id}",
    tag = "export",
    security(
        ("bearerAuth" = []),
        ("apiKeyAuth" = []),
        ("cookieAuth" = []),
    ),
    params(
        ("job_id", Path, description = "The ID of the export job to retrieve"),
    ),
    responses(
        (status = 200, description = "Export job found", body = ExportJobResponse),
        (status = 404, description = "Export job not found"),
        (status = 401, description = "Unauthorized"),
    )
)]
pub async fn get_export_job_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(job_id): Path<Id>,
) -> Result<Json<ExportJobResponse>, AppError> {
    let job_uuid = Uuid::parse_str(&job_id)
        .map_err(|_| AppError::NotFound("Export job not found".to_string()))?;
    require_parent_access(
        state.authz_backend(),
        &auth.authz_context(),
        &state.pool,
        ParentLink::ExportJob(job_uuid),
        Relation::Viewer,
    )
    .await?;

    let job = ExportService::get_export_job(&state.biz_context(), &auth.user.id, &job_id).await?;

    Ok(Json(job.into()))
}

/// Download export artifact
///
/// Returns a download URL for the exported artifact.
#[utoipa::path(
    get,
    path = "/export/jobs/{job_id}/download",
    tag = "export",
    security(
        ("bearerAuth" = []),
        ("apiKeyAuth" = []),
        ("cookieAuth" = []),
    ),
    params(
        ("job_id", Path, description = "The ID of the export job"),
    ),
    responses(
        (status = 200, description = "Download URL", body = serde_json::Value),
        (status = 404, description = "Export job not found or not ready"),
        (status = 401, description = "Unauthorized"),
    )
)]
pub async fn download_export_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(job_id): Path<Id>,
) -> Result<Json<serde_json::Value>, AppError> {
    let job_uuid = Uuid::parse_str(&job_id)
        .map_err(|_| AppError::NotFound("Export job not found".to_string()))?;
    require_parent_access(
        state.authz_backend(),
        &auth.authz_context(),
        &state.pool,
        ParentLink::ExportJob(job_uuid),
        Relation::Viewer,
    )
    .await?;

    let download_url =
        ExportService::get_download_url(&state.biz_context(), &auth.user.id, &job_id).await?;

    Ok(Json(serde_json::json!({"download_url": download_url})))
}

/// List export schedules for a project
///
/// Returns all export schedules for a specific project.
#[utoipa::path(
    get,
    path = "/export/projects/{project_id}/schedules",
    tag = "export",
    security(
        ("bearerAuth" = []),
        ("apiKeyAuth" = []),
        ("cookieAuth" = []),
    ),
    params(
        ("project_id", Path, description = "The ID of the project"),
    ),
    responses(
        (status = 200, description = "List of export schedules", body = Vec<ExportScheduleResponse>),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Project not found"),
    )
)]
pub async fn list_export_schedules_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<Id>,
) -> Result<Json<Vec<ExportScheduleResponse>>, AppError> {
    let project_uuid = Uuid::parse_str(&project_id)
        .map_err(|_| AppError::NotFound("Project not found".to_string()))?;
    require_project_access(
        state.authz_backend(),
        &auth.authz_context(),
        project_uuid,
        Relation::Viewer,
    )
    .await?;

    let schedules =
        ExportService::list_export_schedules(&state.biz_context(), &auth.user.id, &project_id)
            .await?;

    Ok(Json(schedules.into_iter().map(|s| s.into()).collect()))
}

/// Create a new export schedule
///
/// Creates a new recurring export schedule for a project.
#[utoipa::path(
    post,
    path = "/export/projects/{project_id}/schedules",
    tag = "export",
    security(
        ("bearerAuth" = []),
        ("apiKeyAuth" = []),
        ("cookieAuth" = []),
    ),
    params(
        ("project_id", Path, description = "The ID of the project"),
    ),
    request_body = CreateExportScheduleRequest,
    responses(
        (status = 200, description = "Export schedule created successfully", body = ExportScheduleResponse),
        (status = 400, description = "Bad request"),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Forbidden - user may not have permission"),
    )
)]
pub async fn create_export_schedule_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<Id>,
    Json(request): Json<CreateExportScheduleRequest>,
) -> Result<Json<ExportScheduleResponse>, AppError> {
    let project_uuid = Uuid::parse_str(&project_id)
        .map_err(|_| AppError::NotFound("Project not found".to_string()))?;
    require_project_access(
        state.authz_backend(),
        &auth.authz_context(),
        project_uuid,
        Relation::Editor,
    )
    .await?;

    let schedule = ExportService::create_export_schedule(
        &state.biz_context(),
        &auth.user.id,
        &project_id,
        request.format,
        &request.frequency,
        request.day_of_week,
        request.day_of_month,
        &request.time_of_day,
    )
    .await?;

    Ok(Json(schedule.into()))
}

/// Update an export schedule
///
/// Updates an export schedule by its ID.
#[utoipa::path(
    put,
    path = "/export/schedules/{schedule_id}",
    tag = "export",
    security(
        ("bearerAuth" = []),
        ("apiKeyAuth" = []),
        ("cookieAuth" = []),
    ),
    params(
        ("schedule_id", Path, description = "The ID of the export schedule to update"),
    ),
    request_body = UpdateExportScheduleRequest,
    responses(
        (status = 200, description = "Export schedule updated successfully", body = ExportScheduleResponse),
        (status = 400, description = "Bad request"),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Forbidden - user may not have permission"),
        (status = 404, description = "Export schedule not found"),
    )
)]
pub async fn update_export_schedule_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(schedule_id): Path<Id>,
    Json(request): Json<UpdateExportScheduleRequest>,
) -> Result<Json<ExportScheduleResponse>, AppError> {
    let sched_uuid = Uuid::parse_str(&schedule_id)
        .map_err(|_| AppError::NotFound("Export schedule not found".to_string()))?;
    require_parent_access(
        state.authz_backend(),
        &auth.authz_context(),
        &state.pool,
        ParentLink::ExportSchedule(sched_uuid),
        Relation::Editor,
    )
    .await?;

    let schedule = ExportService::update_export_schedule(
        &state.biz_context(),
        &auth.user.id,
        &schedule_id,
        request,
    )
    .await?;

    Ok(Json(schedule.into()))
}

/// Delete an export schedule
///
/// Permanently deletes an export schedule by its ID.
#[utoipa::path(
    delete,
    path = "/export/schedules/{schedule_id}",
    tag = "export",
    security(
        ("bearerAuth" = []),
        ("apiKeyAuth" = []),
        ("cookieAuth" = []),
    ),
    params(
        ("schedule_id", Path, description = "The ID of the export schedule to delete"),
    ),
    responses(
        (status = 200, description = "Export schedule deleted successfully", body = serde_json::Value),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Forbidden - user may not have permission"),
        (status = 404, description = "Export schedule not found"),
    )
)]
pub async fn delete_export_schedule_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(schedule_id): Path<Id>,
) -> Result<Json<serde_json::Value>, AppError> {
    let sched_uuid = Uuid::parse_str(&schedule_id)
        .map_err(|_| AppError::NotFound("Export schedule not found".to_string()))?;
    require_parent_access(
        state.authz_backend(),
        &auth.authz_context(),
        &state.pool,
        ParentLink::ExportSchedule(sched_uuid),
        Relation::Editor,
    )
    .await?;

    ExportService::delete_export_schedule(&state.biz_context(), &auth.user.id, &schedule_id)
        .await?;

    Ok(Json(
        serde_json::json!({"success": true, "id": schedule_id}),
    ))
}
