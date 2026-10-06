use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    Json,
};
use cms_error::AppError;
use cms_middleware::app_state::AppState;

use crate::auth::AuthExtractor;

/// Read a project's settings row (creating a populated default on first read).
async fn ensure_project_settings(
    state: &Arc<AppState>,
    project_id: &str,
) -> Result<cms_entity::project::ProjectSettings, AppError> {
    if let Some(s) =
        cms_db::project::ProjectSettingsQueries::get(&state.biz_context.pool, project_id).await?
    {
        return Ok(s);
    }
    cms_db::project::ProjectSettingsQueries::upsert(
        &state.biz_context.pool,
        project_id,
        None,
        None,
        None,
        Some(true),
        Some(true),
    )
    .await
}

/// Project search settings — returns the SPA `SearchConfigurationResult` shape,
/// sourced from the project's search configuration (project settings row).
pub async fn get_project_search_settings_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    use cms_biz::project::ProjectService;
    let proj = ProjectService::get_project(&state.biz_context, &auth.user.id, &project_id).await?;

    ensure_project_settings(&state, &project_id).await?;

    let search_config = proj
        .project
        .config
        .as_ref()
        .and_then(|c| c.get("search"))
        .cloned()
        .unwrap_or_else(|| serde_json::json!({}));

    let max_results = search_config
        .get("maxResults")
        .and_then(|v| v.as_i64())
        .unwrap_or(10);
    let filters_enabled = search_config
        .get("filtersEnabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let version_filter_enabled = search_config
        .get("versionFilterEnabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let ai_answers = search_config
        .get("aiAnswers")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let hotkey = search_config
        .get("hotkey")
        .and_then(|v| v.as_str())
        .unwrap_or("cmdk");
    let placeholder = search_config.get("placeholder").and_then(|v| v.as_str());
    let suggested_questions = search_config
        .get("suggestedQuestions")
        .cloned()
        .unwrap_or(serde_json::Value::Null);
    let popular_searches = search_config
        .get("popularSearches")
        .cloned()
        .unwrap_or(serde_json::Value::Null);

    let configuration = serde_json::json!({
        "maxResults": max_results,
        "filtersEnabled": filters_enabled,
        "versionFilterEnabled": version_filter_enabled,
        "aiAnswers": ai_answers,
        "hotkey": hotkey,
        "placeholder": placeholder,
        "suggestedQuestions": suggested_questions,
        "popularSearches": popular_searches,
    });

    Ok(Json(serde_json::json!({
        "data": {
            "configuration": configuration,
            "constraints": {
                "maxResults": { "default": 10, "min": 1, "max": 50 }
            }
        }
    })))
}

/// Update project search settings — persists the enabled/disabled switch via the
/// project settings row; returns the same SPA shape the GET returns.
pub async fn update_project_search_settings_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
    use cms_biz::project::ProjectService;
    let proj = ProjectService::get_project(&state.biz_context, &auth.user.id, &project_id).await?;

    let settings = ensure_project_settings(&state, &project_id).await?;

    let ai_answers = body
        .get("aiAnswers")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let enabled = body
        .get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    cms_db::project::ProjectSettingsQueries::upsert(
        &state.biz_context.pool,
        &project_id,
        settings.theme.as_deref(),
        settings.default_language.as_deref(),
        settings.custom_domain.as_deref(),
        Some(enabled),
        Some(true),
    )
    .await?;

    // Deep merge search settings into Project.config
    let mut config = proj.project.config.unwrap_or_else(|| serde_json::json!({}));
    let mut search_obj = config
        .get("search")
        .cloned()
        .unwrap_or_else(|| serde_json::json!({}));
    if let serde_json::Value::Object(ref mut map) = search_obj {
        if let Some(v) = body.get("placeholder") {
            map.insert("placeholder".to_string(), v.clone());
        }
        if let Some(v) = body.get("maxResults") {
            map.insert("maxResults".to_string(), v.clone());
        }
        if let Some(v) = body.get("filtersEnabled") {
            map.insert("filtersEnabled".to_string(), v.clone());
        }
        if let Some(v) = body.get("versionFilterEnabled") {
            map.insert("versionFilterEnabled".to_string(), v.clone());
        }
        if let Some(v) = body.get("aiAnswers") {
            map.insert("aiAnswers".to_string(), v.clone());
        }
        if let Some(v) = body.get("hotkey") {
            map.insert("hotkey".to_string(), v.clone());
        }
        if let Some(v) = body.get("suggestedQuestions") {
            map.insert("suggestedQuestions".to_string(), v.clone());
        }
        if let Some(v) = body.get("popularSearches") {
            map.insert("popularSearches".to_string(), v.clone());
        }
    }
    if let serde_json::Value::Object(ref mut cfg_map) = config {
        cfg_map.insert("search".to_string(), search_obj.clone());
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

    let max_results = search_obj
        .get("maxResults")
        .and_then(|v| v.as_i64())
        .unwrap_or(10);
    let filters_enabled = search_obj
        .get("filtersEnabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let version_filter_enabled = search_obj
        .get("versionFilterEnabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let hotkey = search_obj
        .get("hotkey")
        .and_then(|v| v.as_str())
        .unwrap_or("cmdk");
    let placeholder = search_obj.get("placeholder").and_then(|v| v.as_str());
    let suggested_questions = search_obj
        .get("suggestedQuestions")
        .cloned()
        .unwrap_or(serde_json::Value::Null);
    let popular_searches = search_obj
        .get("popularSearches")
        .cloned()
        .unwrap_or(serde_json::Value::Null);

    Ok(Json(serde_json::json!({
        "data": {
            "configuration": {
                "maxResults": max_results,
                "filtersEnabled": filters_enabled,
                "versionFilterEnabled": version_filter_enabled,
                "aiAnswers": ai_answers,
                "hotkey": hotkey,
                "placeholder": placeholder,
                "suggestedQuestions": suggested_questions,
                "popularSearches": popular_searches,
            },
            "constraints": {
                "maxResults": { "default": 10, "min": 1, "max": 50 }
            }
        }
    })))
}

/// Project search diagnostics
///
/// Returns the `SearchIndexDiagnosticsResult` shape populated from the **live Tantivy index**
/// for the project.  All chunk and page counts are sourced directly from the on-disk segments
/// via `SearchEngine::index_stats()`; languages and branch/version metadata are still fetched
/// from the database since that information is not stored inside the search index itself.
pub async fn get_project_search_diagnostics_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Query(_query): Query<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
    use cms_biz::search::SearchService;

    // Permission / availability check (keeps the same guard as before)
    SearchService::get_search_status(&state.biz_context, &auth.user.id, &project_id).await?;

    // --- Live Tantivy stats ---------------------------------------------------
    let stats = state.search_engine.index_stats(&project_id).await?;

    // --- DB metadata (languages, branches) -----------------------------------
    let langs = cms_db::language::LanguageQueries::get_by_project(
        &state.biz_context.pool,
        &project_id,
        Some(100),
        None,
    )
    .await
    .unwrap_or_default();

    let branches = cms_db::branch::BranchQueries::get_by_project(
        &state.biz_context.pool,
        &project_id,
        None,
        Some(100),
        None,
    )
    .await
    .unwrap_or_default();

    // --- Corpus language / version distribution breakdown --------------------
    // Each language / branch gets the project-wide page count as its chunk count
    // since Tantivy does not store per-language/per-branch breakdowns.
    let corpus_languages: Vec<serde_json::Value> = if langs.is_empty() {
        vec![serde_json::json!({ "code": "en", "count": stats.page_count })]
    } else {
        langs
            .iter()
            .map(|l| serde_json::json!({ "code": l.code, "count": stats.page_count }))
            .collect()
    };

    let corpus_versions: Vec<serde_json::Value> = if branches.is_empty() {
        vec![serde_json::json!({ "slug": "main", "count": stats.page_count })]
    } else {
        branches
            .iter()
            .map(|b| serde_json::json!({ "slug": b.name, "count": stats.page_count }))
            .collect()
    };

    // --- Samples: real page IDs from the live index --------------------------
    let samples: Vec<serde_json::Value> = stats
        .sample_page_ids
        .iter()
        .enumerate()
        .map(|(ordinal, page_id)| {
            serde_json::json!({
                "pointId": format!("tantivy:{}", page_id),
                "pageId": page_id,
                "ordinal": ordinal as i64,
                "language": langs.first().map(|l| l.code.as_str()).unwrap_or("en"),
                "versionSlug": branches.first().map(|b| b.name.as_str()).unwrap_or("main"),
                "status": "indexed",
            })
        })
        .collect();

    // --- Health: derived purely from live Tantivy data -----------------------
    let health = if stats.chunk_count > 0 {
        "ready"
    } else {
        "empty"
    };

    Ok(Json(serde_json::json!({
        "data": {
            "availability": { "configured": stats.chunk_count > 0, "reason": null },
            "health": health,
            "runtime": "tantivy",
            "index": {
                "logicalId": format!("tantivy:project:{}", project_id),
                "schemaVersion": "2",
                "revisionId": null,
                "deploymentVersion": null,
                "embeddingModel": stats.embedding_model.as_deref().unwrap_or("lindera-sudachi"),
                "vectorSize": stats.vector_dim,
            },
            "corpus": {
                "chunks": stats.chunk_count,
                "pages": stats.page_count,
                "languages": corpus_languages,
                "versions": corpus_versions,
                "distributionTruncated": { "languages": false, "versions": false },
            },
            // latestRun is omitted for Tantivy: there is no async run concept.
            // The UI already handles a null latestRun gracefully.
            "latestRun": null,
            "samples": { "items": samples, "nextCursor": null, "hasMore": false },
            "issues": { "staleCount": 0, "failedCount": 0, "items": [] },
        }
    })))
}

/// Reindex project search
pub async fn reindex_project_search_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    use cms_biz::search::SearchService;
    use cms_entity::search::ReindexRequest;

    let run = SearchService::reindex(
        &state.biz_context,
        state.search_engine.clone(),
        &auth.user.id,
        ReindexRequest {
            project_id: project_id.clone(),
            branch_id: None,
            language_id: None,
            full_reindex: true,
        },
    )
    .await?;

    Ok(Json(serde_json::json!({
        "data": {
            "id": run.id,
            "status": format!("{:?}", run.status).to_uppercase(),
        }
    })))
}
