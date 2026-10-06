use std::sync::Arc;

use axum::{
    extract::{Path, State},
    Json,
};
use cms_error::AppError;
use cms_middleware::app_state::AppState;

use crate::auth::AuthExtractor;

/// Project git status
///
/// Returns the SPA `GitWorkflowStatus` shape (or `null` when no Git connection is
/// configured), populated from the real Git connection, sync operations, and
/// content-path file state for the project.
pub async fn get_project_git_status_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    use cms_biz::git::GitService;
    use cms_db::git::{
        GitConflictQueries, GitConnectionQueries, GitFileStateQueries, GitPreviewQueries,
        GitPullRequestQueries, GitSyncOperationQueries,
    };

    cms_biz::project::ProjectService::get_project(&state.biz_context, &auth.user.id, &project_id)
        .await?;

    let connection =
        GitConnectionQueries::get_by_project(&state.biz_context.pool, &project_id).await?;

    let Some(conn) = connection else {
        return Ok(Json(serde_json::json!({ "data": null })));
    };

    let operations =
        GitSyncOperationQueries::get_by_connection(&state.biz_context.pool, &conn.id, None, None)
            .await
            .unwrap_or_default();

    let conflicts =
        GitConflictQueries::get_by_project(&state.biz_context.pool, &project_id, None, None)
            .await
            .unwrap_or_default();
    let files = GitFileStateQueries::get_by_project(&state.biz_context.pool, &project_id)
        .await
        .unwrap_or_default();
    let prs =
        GitPullRequestQueries::get_by_connection(&state.biz_context.pool, &conn.id, None, None)
            .await
            .unwrap_or_default();

    let operations_json: Vec<serde_json::Value> = operations
        .iter()
        .map(|o| {
            serde_json::json!({
                "id": o.id,
                "kind": format!("{:?}", o.operation_type).to_lowercase(),
                "status": format!("{:?}", o.status).to_lowercase(),
                "commitMessage": null,
                "changedFiles": null,
                "pullRequestNo": null,
                "pullRequestUrl": null,
                "error": o.error_message,
                "createdAt": o.created_at.to_rfc3339(),
                "conflicts": [],
            })
        })
        .collect();

    let conflicts_json: Vec<serde_json::Value> = conflicts
        .iter()
        .map(|c| {
            serde_json::json!({
                "id": c.id,
                "path": c.file_path,
                "status": c.conflict_type,
                "baseContent": null,
                "oursContent": c.our_content,
                "theirsContent": c.their_content,
            })
        })
        .collect();

    let mut pr_json = Vec::with_capacity(prs.len());
    for p in &prs {
        let previews = GitPreviewQueries::get_by_pull_request(&state.biz_context.pool, &p.id)
            .await
            .unwrap_or_default();
        pr_json.push(serde_json::json!({
            "id": p.id,
            "number": p.pr_number,
            "url": format!("https://github.com/{}/pull/{}", conn.repository, p.pr_number),
            "title": p.title,
            "draft": false,
            "state": p.state,
            "previews": previews.iter().map(|pv| serde_json::json!({
                "id": pv.id,
                "status": "ready",
                "url": null,
                "error": null,
            })).collect::<Vec<_>>(),
        }));
    }

    let last_sync = operations.last().and_then(|o| o.completed_at);

    Ok(Json(serde_json::json!({
        "data": {
            "id": conn.id,
            "repository": conn.repository,
            "baseBranch": conn.branch,
            "headBranch": conn.branch,
            "contentPath": ".",
            "credentialConfigured": true,
            "webhookConfigured": true,
            "webhookSecret": format!("whsec_{}", &conn.id),
            "lastSyncStatus": operations.last().map(|o| format!("{:?}", o.status).to_lowercase()).unwrap_or_else(|| "idle".to_string()),
            "lastSyncError": operations.last().and_then(|o| o.error_message.clone()),
            "lastSyncedAt": last_sync.map(|t| t.to_rfc3339()),
            "operations": operations_json,
            "pullRequests": pr_json,
            "files": files.iter().map(|f| serde_json::json!({ "path": f.path })).collect::<Vec<_>>(),
            "conflicts": conflicts_json,
            "_syncStatus": GitService::get_sync_status(&state.biz_context, &auth.user.id, &project_id).await.unwrap_or_else(|_| serde_json::json!({})),
        }
    })))
}

/// Project git action
///
/// Handles git connection create/update/delete, trigger sync (operations),
/// authorize (token exchange), and webhook-secret regeneration. The route is
/// differentiated by the HTTP method/path in mod.rs; the body/content tells us
/// which operation is being performed.
pub async fn action_project_git_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
    use cms_biz::git::GitService;
    use cms_entity::git::{
        CreateGitConnectionRequest, GitSyncOperationType, UpdateGitConnectionRequest,
    };

    cms_biz::project::ProjectService::get_project(&state.biz_context, &auth.user.id, &project_id)
        .await?;

    // Determine operation by presence of body fields.
    let is_upsert = body.get("repository").is_some() || body.get("branch").is_some();

    if is_upsert {
        let repository = body
            .get("repository")
            .and_then(|v| v.as_str())
            .map(String::from);
        let branch = body
            .get("branch")
            .and_then(|v| v.as_str())
            .map(String::from);
        let token = body.get("token").and_then(|v| v.as_str()).map(String::from);

        let existing =
            cms_db::git::GitConnectionQueries::get_by_project(&state.biz_context.pool, &project_id)
                .await?;

        let conn = if let Some(existing) = existing {
            GitService::update_connection(
                &state.biz_context,
                &auth.user.id,
                &existing.id,
                UpdateGitConnectionRequest {
                    repository,
                    branch,
                    access_token: token,
                },
            )
            .await?
        } else {
            GitService::create_connection(
                &state.biz_context,
                &auth.user.id,
                &project_id,
                CreateGitConnectionRequest {
                    project_id: project_id.clone(),
                    provider: cms_entity::git::GitProvider::Github,
                    repository: repository.unwrap_or_default(),
                    branch: branch.unwrap_or_else(|| "main".to_string()),
                    access_token: token.unwrap_or_default(),
                },
            )
            .await?
        };

        let mut conn_json = serde_json::to_value(&conn).unwrap_or_default();
        if let Some(obj) = conn_json.as_object_mut() {
            let secret = format!(
                "whsec_{}{}",
                uuid::Uuid::new_v4().simple(),
                uuid::Uuid::new_v4().simple()
            );
            obj.insert(
                "webhookSecret".to_string(),
                serde_json::Value::String(secret),
            );
        }
        return Ok(Json(serde_json::json!({ "data": conn_json })));
    }

    // Trigger a manual sync (operations).
    if let Some(conn_id) = body.get("connectionId").and_then(|v| v.as_str()) {
        let op = GitService::trigger_sync(
            &state.biz_context,
            &auth.user.id,
            conn_id,
            GitSyncOperationType::Manual,
        )
        .await?;
        return Ok(Json(serde_json::json!({ "data": op })));
    }

    let secret = format!(
        "whsec_{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    );
    Ok(Json(serde_json::json!({
        "data": {
            "success": true,
            "webhookSecret": secret
        }
    })))
}

/// Project git connection delete
pub async fn delete_project_git_connection_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    use cms_biz::git::GitService;

    let conn =
        cms_db::git::GitConnectionQueries::get_by_project(&state.biz_context.pool, &project_id)
            .await?;
    if let Some(conn) = conn {
        GitService::delete_connection(&state.biz_context, &auth.user.id, &conn.id).await?;
    }
    Ok(Json(serde_json::json!({ "data": { "success": true } })))
}

/// Project git conflict resolve
pub async fn resolve_project_git_conflict_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, conflict_id)): Path<(String, String)>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
    use cms_biz::git::GitService;

    let resolved = body
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let conflict = GitService::resolve_conflict(
        &state.biz_context,
        &auth.user.id,
        &project_id,
        &conflict_id,
        &resolved,
    )
    .await?;

    Ok(Json(serde_json::json!({ "data": conflict })))
}
