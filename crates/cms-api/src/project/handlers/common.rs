use std::sync::Arc;

use cms_biz::project::ProjectService;
use cms_error::AppError;
use cms_middleware::app_state::AppState;

use crate::auth::AuthExtractor;

/// Resolve the organization id that owns a project, so member/role operations can
/// be delegated to the org service. Enforces project membership for the caller.
pub async fn project_org_id(
    state: &Arc<AppState>,
    auth: &AuthExtractor,
    project_id: &str,
) -> Result<String, AppError> {
    let project =
        ProjectService::get_project(&state.biz_context, &auth.user.id, project_id).await?;
    Ok(project.project.organization_id.clone())
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
