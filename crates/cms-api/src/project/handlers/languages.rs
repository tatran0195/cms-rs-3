use std::sync::Arc;

use axum::{
    extract::{Path, State},
    Json,
};
use cms_error::AppError;
use cms_middleware::app_state::AppState;

use crate::auth::AuthExtractor;

/// List languages for a project
pub async fn list_project_languages_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let query = cms_entity::language::ListLanguagesQuery { project_id };
    let result = cms_biz::language::LanguageService::list_languages(
        &state.biz_context,
        &auth.user.id,
        query,
        1,
        100,
    )
    .await?;
    Ok(Json(serde_json::json!({ "data": result.data })))
}

/// Create a language for a project
pub async fn create_project_language_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Json(mut request): Json<cms_entity::language::CreateLanguageRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    request.project_id = project_id.clone();
    let lang = cms_biz::language::LanguageService::create_language(
        &state.biz_context,
        &auth.user.id,
        request,
    )
    .await?;
    Ok(Json(serde_json::json!({ "data": lang })))
}

/// Update a language for a project
pub async fn update_project_language_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, language_id)): Path<(String, String)>,
    Json(request): Json<cms_entity::language::UpdateLanguageRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let existing =
        cms_db::language::LanguageQueries::get_by_id(&state.biz_context.pool, &language_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Language not found".to_string()))?;
    if existing.project_id != project_id {
        return Err(AppError::NotFound("Language not found for this project".to_string()));
    }
    let lang = cms_biz::language::LanguageService::update_language(
        &state.biz_context,
        &auth.user.id,
        &language_id,
        request,
    )
    .await?;
    Ok(Json(serde_json::json!({ "data": lang })))
}

/// Delete a language for a project
pub async fn delete_project_language_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, language_id)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, AppError> {
    let language =
        cms_db::language::LanguageQueries::get_by_id(&state.biz_context.pool, &language_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Language not found".to_string()))?;
    if language.project_id != project_id {
        return Err(AppError::NotFound("Language not found for this project".to_string()));
    }
    cms_biz::language::LanguageService::delete_language(
        &state.biz_context,
        &auth.user.id,
        &language_id,
    )
    .await?;
    Ok(Json(serde_json::json!({ "data": { "success": true } })))
}
