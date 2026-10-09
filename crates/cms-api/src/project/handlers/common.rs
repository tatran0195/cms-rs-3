use std::sync::Arc;

use cms_biz::project::ProjectService;
use cms_error::AppError;
use cms_middleware::app_state::AppState;

use crate::auth::AuthExtractor;

/// Verify caller has access to the project.
pub async fn verify_project_access(
    state: &Arc<AppState>,
    auth: &AuthExtractor,
    project_id: &str,
) -> Result<(), AppError> {
    let _project =
        ProjectService::get_project(&state.biz_context, &auth.user.id, project_id).await?;
    Ok(())
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

/// Authorize a project action using Gatehouse.
pub async fn authorize_project(
    state: &AppState,
    auth: &AuthExtractor,
    project_id: &str,
    action: cms_authz::ProjectAction,
) -> Result<cms_entity::project::Project, AppError> {
    let project = cms_db::project::ProjectQueries::get_by_id(&state.biz_context.pool, project_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Project not found".to_string()))?;
    let auth_user = auth.to_auth_user(state);
    let session = state.authz().session();
    let target = cms_authz::ProjectTarget {
        id: project.id.clone(),
        is_public: project.is_public,
        owner_id: None,
    };
    state
        .authz()
        .project_checker
        .bind(&session, &auth_user, &action, &())
        .authorize(&target)
        .await
        .map_err(|_| AppError::Forbidden)?;
    Ok(project)
}

