use std::sync::Arc;

use axum::{
    extract::{Path, State},
    Json,
};
use cms_entity::{
    common::ApiResponse,
    domain::{AddProjectDomainRequest, DeleteDomainResponse, SpaDomainResponse},
    id::ProjectId,
};
use cms_error::AppError;
use cms_middleware::app_state::AppState;

use super::common::{project_deployments, verify_project_access};
use crate::{auth::AuthExtractor, validation::ValidatedJson};

/// Look up a domain and confirm its owning deployment belongs to the project.
async fn require_domain_in_project(
    state: &Arc<AppState>,
    project_id: &str,
    domain_id: &str,
) -> Result<cms_entity::domain::Domain, AppError> {
    let domain = cms_db::domain::DomainQueries::get_by_id(&state.biz_context.pool, domain_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Domain not found".to_string()))?;
    let deployment = cms_db::deployment::DeploymentQueries::get_by_id(
        &state.biz_context.pool,
        &domain.deployment_id,
    )
    .await?
    .ok_or_else(|| AppError::NotFound("Deployment not found".to_string()))?;
    if deployment.project_id != project_id {
        return Err(AppError::Forbidden);
    }
    Ok(domain)
}

/// List domains for a project
#[utoipa::path(
    get,
    path = "/projects/{project_id}/domains",
    tag = "projects",
    security(
        ("bearerAuth" = []),
        ("apiKeyAuth" = []),
        ("cookieAuth" = []),
    ),
    params(
        ("project_id", Path, description = "Project ID"),
    ),
    responses(
        (status = 200, description = "List of project domains", body = ApiResponse<Vec<SpaDomainResponse>>),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Forbidden"),
        (status = 404, description = "Project not found"),
    )
)]
pub async fn list_project_domains_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<ProjectId>,
) -> Result<Json<ApiResponse<Vec<SpaDomainResponse>>>, AppError> {
    // Auth: confirm the caller can access the project, then gather domains across
    // all of the project's deployments (the domain model is deployment-scoped).
    verify_project_access(&state, &auth, &project_id).await?;
    let deployments = project_deployments(&state, &project_id).await?;

    let mut items = Vec::new();
    for d in deployments {
        let domains =
            cms_db::domain::DomainQueries::get_by_deployment(&state.biz_context.pool, &d.id)
                .await?;
        items.extend(domains.iter().map(SpaDomainResponse::from_domain));
    }

    Ok(Json(ApiResponse::new(items)))
}

/// Add a domain to a project
///
/// Attaches a hostname to the project's newest deployment, creating the primary
/// domain when the deployment has none yet.
#[utoipa::path(
    post,
    path = "/projects/{project_id}/domains",
    tag = "projects",
    security(
        ("bearerAuth" = []),
        ("apiKeyAuth" = []),
        ("cookieAuth" = []),
    ),
    params(
        ("project_id", Path, description = "Project ID"),
    ),
    request_body = AddProjectDomainRequest,
    responses(
        (status = 200, description = "Domain added successfully", body = ApiResponse<SpaDomainResponse>),
        (status = 400, description = "Bad request"),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Forbidden"),
        (status = 404, description = "Project or deployment not found"),
    )
)]
pub async fn add_project_domain_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<ProjectId>,
    ValidatedJson(body): ValidatedJson<AddProjectDomainRequest>,
) -> Result<Json<ApiResponse<SpaDomainResponse>>, AppError> {
    verify_project_access(&state, &auth, &project_id).await?;

    let hostname = body.domain.trim().trim_end_matches('.').to_lowercase();
    if hostname.is_empty() {
        return Err(AppError::InvalidInput("domain is required".to_string()));
    }

    let deployments = project_deployments(&state, &project_id).await?;
    let deployment = deployments
        .first()
        .ok_or_else(|| AppError::NotFound("No deployment exists for this project".to_string()))?;

    let has_primary = cms_db::domain::DomainQueries::get_primary_by_deployment(
        &state.biz_context.pool,
        &deployment.id,
    )
    .await?
    .is_some();
    let is_primary = !has_primary;

    let domain = cms_db::domain::DomainQueries::create(
        &state.biz_context.pool,
        &deployment.id,
        &hostname,
        is_primary,
    )
    .await?;
    state.invalidate_host_resolution_cache();

    Ok(Json(ApiResponse::new(SpaDomainResponse::from_domain(
        &domain,
    ))))
}

/// Delete a domain from a project
#[utoipa::path(
    delete,
    path = "/projects/{project_id}/domains/{id}",
    tag = "projects",
    security(
        ("bearerAuth" = []),
        ("apiKeyAuth" = []),
        ("cookieAuth" = []),
    ),
    params(
        ("project_id", Path, description = "Project ID"),
        ("id", Path, description = "Domain ID"),
    ),
    responses(
        (status = 200, description = "Domain deleted successfully", body = ApiResponse<DeleteDomainResponse>),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Forbidden"),
        (status = 404, description = "Domain not found"),
    )
)]
pub async fn delete_project_domain_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, id)): Path<(ProjectId, String)>,
) -> Result<Json<ApiResponse<DeleteDomainResponse>>, AppError> {
    verify_project_access(&state, &auth, &project_id).await?;
    let _domain = require_domain_in_project(&state, &project_id, &id).await?;
    cms_db::domain::DomainQueries::delete(&state.biz_context.pool, &id).await?;
    state.invalidate_host_resolution_cache();
    Ok(Json(ApiResponse::new(DeleteDomainResponse::new(id))))
}

/// Verify the domain's persisted TXT challenge and keep routing disabled until
/// the DNS proof is visible to the configured resolver.
#[utoipa::path(
    post,
    path = "/projects/{project_id}/domains/{id}/verify",
    tag = "projects",
    security(
        ("bearerAuth" = []),
        ("apiKeyAuth" = []),
        ("cookieAuth" = []),
    ),
    params(
        ("project_id", Path, description = "Project ID"),
        ("id", Path, description = "Domain ID"),
    ),
    responses(
        (status = 200, description = "Domain verification result", body = ApiResponse<SpaDomainResponse>),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Forbidden"),
        (status = 404, description = "Domain not found"),
    )
)]
pub async fn verify_project_domain_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, id)): Path<(ProjectId, String)>,
) -> Result<Json<ApiResponse<SpaDomainResponse>>, AppError> {
    verify_project_access(&state, &auth, &project_id).await?;
    let domain = require_domain_in_project(&state, &project_id, &id).await?;
    let is_verified = cms_biz::domain::DomainService::verify_domain_ownership(
        &state.biz_context,
        &auth.user.id,
        &id,
        &domain.verification_token,
        &state.config.domain_verification.resolver_url,
        state.config.domain_verification.timeout_seconds,
    )
    .await?;
    state.invalidate_host_resolution_cache();
    let updated = require_domain_in_project(&state, &project_id, &id).await?;
    let mut response = SpaDomainResponse::from_domain(&updated);
    if !is_verified {
        response.last_error = Some("TXT ownership record was not found yet".to_string());
    }
    Ok(Json(ApiResponse::new(response)))
}

/// Set the primary domain for a project
#[utoipa::path(
    post,
    path = "/projects/{project_id}/domains/{id}/primary",
    tag = "projects",
    security(
        ("bearerAuth" = []),
        ("apiKeyAuth" = []),
        ("cookieAuth" = []),
    ),
    params(
        ("project_id", Path, description = "Project ID"),
        ("id", Path, description = "Domain ID"),
    ),
    responses(
        (status = 200, description = "Primary domain updated", body = ApiResponse<SpaDomainResponse>),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Forbidden"),
        (status = 404, description = "Domain not found"),
    )
)]
pub async fn set_primary_project_domain_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, id)): Path<(ProjectId, String)>,
) -> Result<Json<ApiResponse<SpaDomainResponse>>, AppError> {
    verify_project_access(&state, &auth, &project_id).await?;
    let domain = require_domain_in_project(&state, &project_id, &id).await?;

    let updated = cms_db::domain::DomainQueries::set_primary_for_deployment(
        &state.biz_context.pool,
        &domain.deployment_id,
        &domain.id,
    )
    .await?;
    state.invalidate_host_resolution_cache();

    Ok(Json(ApiResponse::new(SpaDomainResponse::from_domain(
        &updated,
    ))))
}
