use std::sync::Arc;

use axum::{
    extract::{Path, State},
    Json,
};
use cms_entity::{
    common::ApiResponse,
    language::{
        CreateLanguageRequest, DeleteLanguageResponse, LanguageResponse, ListLanguagesQuery,
        UpdateLanguageRequest,
    },
};
use cms_error::AppError;
use cms_middleware::app_state::AppState;

use crate::auth::AuthExtractor;

/// List languages for a project
pub async fn list_project_languages_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
) -> Result<Json<ApiResponse<Vec<LanguageResponse>>>, AppError> {
    let query = ListLanguagesQuery { project_id };
    let result = cms_biz::language::LanguageService::list_languages(
        &state.biz_context,
        &auth.user.id,
        query,
        1,
        100,
    )
    .await?;
    Ok(Json(ApiResponse::new(result.data)))
}

/// Create a language for a project
pub async fn create_project_language_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Json(mut request): Json<CreateLanguageRequest>,
) -> Result<Json<ApiResponse<LanguageResponse>>, AppError> {
    super::common::authorize_project(
        &state,
        &auth,
        &project_id,
        cms_authz::ProjectAction::Edit,
    )
    .await?;
    request.project_id = project_id.clone();
    let lang = cms_biz::language::LanguageService::create_language(
        &state.biz_context,
        &auth.user.id,
        request,
    )
    .await?;
    Ok(Json(ApiResponse::new(lang)))
}

/// Update a language for a project
pub async fn update_project_language_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, language_id)): Path<(String, String)>,
    Json(request): Json<UpdateLanguageRequest>,
) -> Result<Json<ApiResponse<LanguageResponse>>, AppError> {
    super::common::authorize_project(
        &state,
        &auth,
        &project_id,
        cms_authz::ProjectAction::Edit,
    )
    .await?;
    let existing =
        cms_db::language::LanguageQueries::get_by_id(&state.biz_context.pool, &language_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Language not found".to_string()))?;
    if existing.project_id != project_id {
        return Err(AppError::NotFound(
            "Language not found for this project".to_string(),
        ));
    }
    let lang = cms_biz::language::LanguageService::update_language(
        &state.biz_context,
        &auth.user.id,
        &language_id,
        request,
    )
    .await?;
    Ok(Json(ApiResponse::new(lang)))
}

/// Delete a language for a project
pub async fn delete_project_language_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, language_id)): Path<(String, String)>,
) -> Result<Json<ApiResponse<DeleteLanguageResponse>>, AppError> {
    super::common::authorize_project(
        &state,
        &auth,
        &project_id,
        cms_authz::ProjectAction::Edit,
    )
    .await?;
    let language =
        cms_db::language::LanguageQueries::get_by_id(&state.biz_context.pool, &language_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Language not found".to_string()))?;
    if language.project_id != project_id {
        return Err(AppError::NotFound(
            "Language not found for this project".to_string(),
        ));
    }
    cms_biz::language::LanguageService::delete_language(
        &state.biz_context,
        &auth.user.id,
        &language_id,
    )
    .await?;
    Ok(Json(ApiResponse::new(DeleteLanguageResponse {
        success: true,
    })))
}
