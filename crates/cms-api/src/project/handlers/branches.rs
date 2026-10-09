use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    Json,
};
use cms_entity::{
    branch::{BranchResponse, CreateBranchRequest, DeleteBranchResponse, ListBranchesQuery},
    common::ApiResponse,
    deployment::DeploymentListItem,
};
use cms_error::AppError;
use cms_middleware::app_state::AppState;

use crate::auth::AuthExtractor;

/// List branches for a project
pub async fn list_project_branches_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Query(mut query): Query<ListBranchesQuery>,
) -> Result<Json<ApiResponse<Vec<BranchResponse>>>, AppError> {
    query.project_id = project_id.clone();
    let result = cms_biz::branch::BranchService::list_branches(
        &state.biz_context,
        &auth.user.id,
        query,
        1,
        100,
    )
    .await?;

    Ok(Json(ApiResponse::new(result.data)))
}

/// Create a branch for a project
pub async fn create_project_branch_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Json(mut request): Json<CreateBranchRequest>,
) -> Result<Json<ApiResponse<BranchResponse>>, AppError> {
    request.project_id = project_id.clone();
    let branch = cms_biz::branch::BranchService::create_branch(
        &state.biz_context,
        &auth.user.id,
        &project_id,
        request,
    )
    .await?;
    Ok(Json(ApiResponse::new(branch.branch)))
}

/// Delete a project branch
///
/// Verifies the branch belongs to the project, refuses to delete the default/main
/// branch, then removes the branch row.
pub async fn delete_project_branch_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, branch_id)): Path<(String, String)>,
) -> Result<Json<ApiResponse<DeleteBranchResponse>>, AppError> {
    use cms_db::branch::BranchQueries;

    cms_biz::project::ProjectService::get_project(&state.biz_context, &auth.user.id, &project_id)
        .await?;

    let branch = BranchQueries::get_by_id(&state.biz_context.pool, &branch_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Branch not found".to_string()))?;

    if branch.project_id != project_id {
        return Err(AppError::NotFound(
            "Branch not found for this project".to_string(),
        ));
    }

    if branch.is_default || branch.name.eq_ignore_ascii_case("main") {
        return Err(AppError::Conflict(
            "Cannot delete the default or main branch".to_string(),
        ));
    }

    BranchQueries::delete(&state.biz_context.pool, &branch_id).await?;

    Ok(Json(ApiResponse::new(DeleteBranchResponse {
        id: branch.id,
        name: branch.name,
        deleted: true,
    })))
}

/// Merge branch — publishes a deployment for the target branch and returns it in
/// the SPA deployment shape (merge = build the branch content into the site).
pub async fn merge_project_branch_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, branch_id)): Path<(String, String)>,
) -> Result<Json<ApiResponse<DeploymentListItem>>, AppError> {
    let auth_user = auth.to_auth_user(&state);
    let session = state.authz().session();
    let target = cms_authz::ProjectTarget {
        id: project_id.clone(),
        is_public: false,
        owner_id: None,
    };
    state
        .authz()
        .project_checker
        .bind(&session, &auth_user, &cms_authz::ProjectAction::Publish, &())
        .authorize(&target)
        .await
        .map_err(|_| AppError::Forbidden)?;

    let branch = cms_db::branch::BranchQueries::get_by_id(&state.biz_context.pool, &branch_id)
        .await?
        .filter(|branch| branch.project_id == project_id)
        .ok_or_else(|| AppError::NotFound("Branch not found".to_string()))?;

    if branch.is_default {
        return Err(AppError::Conflict(
            "Cannot merge the default branch into itself".to_string(),
        ));
    }

    let default_branch = cms_db::branch::BranchQueries::get_default(&state.biz_context.pool, &project_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Default branch not found".to_string()))?;

    let mut tx = state.biz_context.pool.begin().await?;

    sqlx::query("DELETE FROM \"Page\" WHERE project_id = $1 AND branch_id = $2")
        .bind(&project_id)
        .bind(&default_branch.id)
        .execute(&mut *tx)
        .await?;

    sqlx::query("UPDATE \"Page\" SET branch_id = $1 WHERE project_id = $2 AND branch_id = $3")
        .bind(&default_branch.id)
        .bind(&project_id)
        .bind(&branch.id)
        .execute(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM \"Branch\" WHERE id = $1")
        .bind(&branch.id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    let commit_message = format!("Promote {} into {}", branch.name, default_branch.name);
    let deployment = super::deployments::create_publish_deployment(
        &state,
        &project_id,
        &default_branch.id,
        &auth.user.id,
        &commit_message,
        serde_json::json!({}),
    )
    .await?;

    let res = DeploymentListItem {
        id: deployment.id,
        version: None,
        status: "PENDING".to_string(),
        pages_count: 0,
        commit_message,
        error: None,
        error_details: None,
        created_at: deployment.created_at.to_rfc3339(),
        completed_at: None,
    };

    Ok(Json(ApiResponse::new(res)))
}
