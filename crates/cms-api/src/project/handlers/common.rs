use std::sync::Arc;

use cms_authz::Relation;
use cms_error::AppError;
use cms_middleware::app_state::AppState;
use uuid::Uuid;

use crate::auth::AuthExtractor;

/// Verify caller has access to the project.
pub async fn verify_project_access(
    state: &Arc<AppState>,
    auth: &AuthExtractor,
    project_id: &str,
) -> Result<(), AppError> {
    let project_uuid = Uuid::parse_str(project_id)
        .map_err(|_| AppError::NotFound("Project not found".to_string()))?;
    cms_authz_gate::require_project_access(
        state.authz_backend(),
        &auth.authz_context(),
        project_uuid,
        Relation::Viewer,
    )
    .await
}

/// Resolve the deployments that belong to a project (newest first).
pub async fn project_deployments(
    state: &Arc<AppState>,
    project_id: &str,
) -> Result<Vec<cms_entity::deployment::Deployment>, AppError> {
    cms_db::deployment::DeploymentQueries::get_by_project(
        &state.biz_context.pool,
        project_id,
        Some(100),
        None,
    )
    .await
}

/// Authorize a project action using Zanzibar ReBAC.
/// Denied check returns `AppError::NotFound` to defend against existence oracles.
pub async fn authorize_project(
    state: &AppState,
    auth: &AuthExtractor,
    project_id: &str,
    relation: Relation,
) -> Result<cms_entity::project::Project, AppError> {
    let project_uuid = Uuid::parse_str(project_id)
        .map_err(|_| AppError::NotFound("Project not found".to_string()))?;

    let project = cms_db::project::ProjectQueries::get_by_id(&state.biz_context.pool, project_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Project not found".to_string()))?;

    // Public projects allow Viewer access to any caller
    if project.is_public && relation == Relation::Viewer {
        return Ok(project);
    }

    cms_authz_gate::require_project_access(
        state.authz_backend(),
        &auth.authz_context(),
        project_uuid,
        relation,
    )
    .await?;

    Ok(project)
}

