use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use cms_entity::{
    common::ApiResponse,
    search::{
        SearchConfiguration, SearchConstraints, SearchDiagnosticsResponse, SearchReindexResponse,
        SearchSettingsResponse, UpdateSearchSettingsRequest,
    },
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
) -> Result<Json<ApiResponse<SearchSettingsResponse>>, AppError> {
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
        .unwrap_or("cmdk")
        .to_string();
    let placeholder = search_config
        .get("placeholder")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let suggested_questions = search_config
        .get("suggestedQuestions")
        .cloned()
        .unwrap_or(serde_json::Value::Null);
    let popular_searches = search_config
        .get("popularSearches")
        .cloned()
        .unwrap_or(serde_json::Value::Null);

    let configuration = SearchConfiguration {
        max_results,
        filters_enabled,
        version_filter_enabled,
        ai_answers,
        hotkey,
        placeholder,
        suggested_questions,
        popular_searches,
    };

    let response = SearchSettingsResponse {
        configuration,
        constraints: SearchConstraints {
            max_results: serde_json::json!({ "default": 10, "min": 1, "max": 50 }),
        },
    };

    Ok(Json(ApiResponse::new(response)))
}

/// Update project search settings — persists the enabled/disabled switch via the
/// project settings row; returns the same SPA shape the GET returns.
pub async fn update_project_search_settings_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Json(body): Json<UpdateSearchSettingsRequest>,
) -> Result<Json<ApiResponse<SearchSettingsResponse>>, AppError> {
    use cms_biz::project::ProjectService;
    let proj = ProjectService::get_project(&state.biz_context, &auth.user.id, &project_id).await?;

    let settings = ensure_project_settings(&state, &project_id).await?;

    let ai_answers = body.ai_answers.unwrap_or(true);
    let enabled = body.enabled.unwrap_or(true);

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
        if let Some(ref v) = body.placeholder {
            map.insert(
                "placeholder".to_string(),
                serde_json::Value::String(v.clone()),
            );
        }
        if let Some(v) = body.max_results {
            map.insert(
                "maxResults".to_string(),
                serde_json::Value::Number(v.into()),
            );
        }
        if let Some(v) = body.filters_enabled {
            map.insert("filtersEnabled".to_string(), serde_json::Value::Bool(v));
        }
        if let Some(v) = body.version_filter_enabled {
            map.insert(
                "versionFilterEnabled".to_string(),
                serde_json::Value::Bool(v),
            );
        }
        if let Some(v) = body.ai_answers {
            map.insert("aiAnswers".to_string(), serde_json::Value::Bool(v));
        }
        if let Some(ref v) = body.hotkey {
            map.insert("hotkey".to_string(), serde_json::Value::String(v.clone()));
        }
        if let Some(ref v) = body.suggested_questions {
            map.insert("suggestedQuestions".to_string(), v.clone());
        }
        if let Some(ref v) = body.popular_searches {
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
        .unwrap_or("cmdk")
        .to_string();
    let placeholder = search_obj
        .get("placeholder")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let suggested_questions = search_obj
        .get("suggestedQuestions")
        .cloned()
        .unwrap_or(serde_json::Value::Null);
    let popular_searches = search_obj
        .get("popularSearches")
        .cloned()
        .unwrap_or(serde_json::Value::Null);

    let configuration = SearchConfiguration {
        max_results,
        filters_enabled,
        version_filter_enabled,
        ai_answers,
        hotkey,
        placeholder,
        suggested_questions,
        popular_searches,
    };

    let response = SearchSettingsResponse {
        configuration,
        constraints: SearchConstraints {
            max_results: serde_json::json!({ "default": 10, "min": 1, "max": 50 }),
        },
    };

    Ok(Json(ApiResponse::new(response)))
}

/// Project search diagnostics
///
/// Returns the `SearchIndexDiagnosticsResult` shape populated from the **live Tantivy index**
/// for the project.
pub async fn get_project_search_diagnostics_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Query(_query): Query<serde_json::Value>,
) -> Result<Json<ApiResponse<SearchDiagnosticsResponse>>, AppError> {
    use cms_biz::search::SearchService;

    // Permission / availability check
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

    let health = if stats.chunk_count > 0 {
        "ready"
    } else {
        "empty"
    };

    let diagnostics = SearchDiagnosticsResponse {
        availability: serde_json::json!({ "configured": stats.chunk_count > 0, "reason": null }),
        health: health.to_string(),
        runtime: "tantivy".to_string(),
        index: serde_json::json!({
            "logicalId": format!("tantivy:project:{}", project_id),
            "schemaVersion": "2",
            "revisionId": null,
            "deploymentVersion": null,
            "embeddingModel": stats.embedding_model.as_deref().unwrap_or("lindera-sudachi"),
            "vectorSize": stats.vector_dim,
        }),
        corpus: serde_json::json!({
            "chunks": stats.chunk_count,
            "pages": stats.page_count,
            "languages": corpus_languages,
            "versions": corpus_versions,
            "distributionTruncated": { "languages": false, "versions": false },
        }),
        latest_run: None,
        samples: serde_json::json!({ "items": samples, "nextCursor": null, "hasMore": false }),
        issues: serde_json::json!({ "staleCount": 0, "failedCount": 0, "items": [] }),
    };

    Ok(Json(ApiResponse::new(diagnostics)))
}

/// Reindex project search
pub async fn reindex_project_search_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
) -> Result<(StatusCode, Json<ApiResponse<SearchReindexResponse>>), AppError> {
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

    let response = SearchReindexResponse {
        id: run.id,
        status: format!("{:?}", run.status).to_uppercase(),
    };

    Ok((StatusCode::ACCEPTED, Json(ApiResponse::new(response))))
}
