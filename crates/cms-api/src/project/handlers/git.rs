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

    let proj = cms_biz::project::ProjectService::get_project(
        &state.biz_context,
        &auth.user.id,
        &project_id,
    )
    .await?;

    let connection =
        GitConnectionQueries::get_by_project(&state.biz_context.pool, &project_id).await?;

    let Some(conn) = connection else {
        return Ok(Json(serde_json::json!({ "data": null })));
    };

    // Webhook secret retrieval or generation & persistence
    let mut config = proj.project.config.unwrap_or_else(|| serde_json::json!({}));
    let existing_secret = config
        .get("git")
        .and_then(|g| g.get("webhookSecret"))
        .and_then(|s| s.as_str())
        .map(String::from);

    let webhook_secret = match existing_secret {
        Some(s) if !s.is_empty() => s,
        _ => {
            let secret = cms_auth::generate_webhook_secret();
            let mut git_obj = config
                .get("git")
                .cloned()
                .unwrap_or_else(|| serde_json::json!({}));
            if !git_obj.is_object() {
                git_obj = serde_json::json!({});
            }
            if let Some(git_map) = git_obj.as_object_mut() {
                git_map.insert(
                    "webhookSecret".to_string(),
                    serde_json::Value::String(secret.clone()),
                );
            }
            if let Some(cfg_map) = config.as_object_mut() {
                cfg_map.insert("git".to_string(), git_obj);
            }
            cms_db::project::ProjectQueries::update(
                &state.biz_context.pool,
                &project_id,
                None,
                None,
                None,
                None,
                None,
                Some(&config),
            )
            .await?;
            secret
        }
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
            "webhookSecret": webhook_secret,
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

    let proj = cms_biz::project::ProjectService::get_project(
        &state.biz_context,
        &auth.user.id,
        &project_id,
    )
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

        let mut config = proj.project.config.unwrap_or_else(|| serde_json::json!({}));
        let existing_secret = config
            .get("git")
            .and_then(|g| g.get("webhookSecret"))
            .and_then(|s| s.as_str())
            .map(String::from);

        let secret = match existing_secret {
            Some(s) if !s.is_empty() => s,
            _ => {
                let s = cms_auth::generate_webhook_secret();
                let mut git_obj = config
                    .get("git")
                    .cloned()
                    .unwrap_or_else(|| serde_json::json!({}));
                if !git_obj.is_object() {
                    git_obj = serde_json::json!({});
                }
                if let Some(git_map) = git_obj.as_object_mut() {
                    git_map.insert(
                        "webhookSecret".to_string(),
                        serde_json::Value::String(s.clone()),
                    );
                }
                if let Some(cfg_map) = config.as_object_mut() {
                    cfg_map.insert("git".to_string(), git_obj);
                }
                cms_db::project::ProjectQueries::update(
                    &state.biz_context.pool,
                    &project_id,
                    None,
                    None,
                    None,
                    None,
                    None,
                    Some(&config),
                )
                .await?;
                s
            }
        };

        let mut conn_json = serde_json::to_value(&conn).unwrap_or_default();
        if let Some(obj) = conn_json.as_object_mut() {
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

    // Webhook secret regeneration / rotation:
    // Generate fresh CSPRNG secret, update Project.config (invalidating old secret), return new secret
    let secret = cms_auth::generate_webhook_secret();
    let mut config = proj.project.config.unwrap_or_else(|| serde_json::json!({}));
    let mut git_obj = config
        .get("git")
        .cloned()
        .unwrap_or_else(|| serde_json::json!({}));
    if !git_obj.is_object() {
        git_obj = serde_json::json!({});
    }
    if let Some(git_map) = git_obj.as_object_mut() {
        git_map.insert(
            "webhookSecret".to_string(),
            serde_json::Value::String(secret.clone()),
        );
    }
    if let Some(cfg_map) = config.as_object_mut() {
        cfg_map.insert("git".to_string(), git_obj);
    }
    cms_db::project::ProjectQueries::update(
        &state.biz_context.pool,
        &project_id,
        None,
        None,
        None,
        None,
        None,
        Some(&config),
    )
    .await?;

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

    let proj = cms_biz::project::ProjectService::get_project(
        &state.biz_context,
        &auth.user.id,
        &project_id,
    )
    .await?;

    let conn =
        cms_db::git::GitConnectionQueries::get_by_project(&state.biz_context.pool, &project_id)
            .await?;
    if let Some(conn) = conn {
        GitService::delete_connection(&state.biz_context, &auth.user.id, &conn.id).await?;
        if let Some(mut config) = proj.project.config {
            if let Some(cfg_map) = config.as_object_mut() {
                if cfg_map.remove("git").is_some() {
                    cms_db::project::ProjectQueries::update(
                        &state.biz_context.pool,
                        &project_id,
                        None,
                        None,
                        None,
                        None,
                        None,
                        Some(&config),
                    )
                    .await?;
                }
            }
        }
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
