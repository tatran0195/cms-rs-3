use std::sync::Arc;

use axum::{
    extract::{Path, State},
    Json,
};
use cms_entity::{
    common::ApiResponse,
    project::ProjectAddonResponse,
    theme::{
        ImportProjectThemeTemplateResponse, ProjectThemeStyles, ProjectThemeTemplateDetails,
        ProjectThemeTemplateResponse,
    },
};
use cms_error::AppError;
use cms_middleware::app_state::AppState;

use crate::auth::AuthExtractor;

pub async fn get_project_theme_template_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
) -> Result<Json<ApiResponse<Option<ProjectThemeTemplateResponse>>>, AppError> {
    use cms_biz::theme::ThemeService;

    let themes = ThemeService::list_themes(&state.biz_context, &auth.user.id, &project_id).await?;
    let theme = themes.first();

    let template = theme.map(|t| ProjectThemeTemplateResponse {
        id: t.id.clone(),
        name: t.name.clone(),
        primary_color: t.primary_color.clone(),
        secondary_color: t.secondary_color.clone(),
        background_color: t.background_color.clone(),
        text_color: t.text_color.clone(),
        font_family: t.font_family.clone(),
        logo_url: t.logo_url.clone(),
        favicon_url: t.favicon_url.clone(),
        template: ProjectThemeTemplateDetails {
            styles: ProjectThemeStyles {
                primary_color: t.primary_color.clone(),
                secondary_color: t.secondary_color.clone(),
                background_color: t.background_color.clone(),
                text_color: t.text_color.clone(),
            },
        },
        changes: vec![],
        published_changes_pending: false,
    });

    Ok(Json(ApiResponse::new(template)))
}

/// Download the project theme repository as a JSON bundle (legacy `theme-repository` link).
///
/// Returns a real, downloadable artifact built from the stored theme row.
pub async fn get_project_theme_repository_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
) -> Result<impl axum::response::IntoResponse, AppError> {
    use cms_biz::theme::ThemeService;

    let themes = ThemeService::list_themes(&state.biz_context, &auth.user.id, &project_id).await?;
    let theme = themes.first();

    let bundle = serde_json::json!({
        "projectId": project_id,
        "exportedAt": chrono::Utc::now().to_rfc3339(),
        "theme": theme.map(|t| serde_json::json!({
            "id": t.id,
            "name": t.name,
            "primary_color": t.primary_color,
            "secondary_color": t.secondary_color,
            "background_color": t.background_color,
            "text_color": t.text_color,
            "font_family": t.font_family,
            "logo_url": t.logo_url,
            "favicon_url": t.favicon_url,
        })),
    });

    let body = serde_json::to_string_pretty(&bundle).unwrap_or_else(|_| "{}".to_string());
    let headers = [
        (axum::http::header::CONTENT_TYPE, "application/json"),
        (
            axum::http::header::CONTENT_DISPOSITION,
            "attachment; filename=\"theme-repository.json\"",
        ),
    ];
    Ok((headers, body))
}

/// Project theme template import
pub async fn import_project_theme_template_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<ApiResponse<ImportProjectThemeTemplateResponse>>, AppError> {
    use cms_biz::theme::ThemeService;
    use cms_entity::theme::CreateThemeRequest;

    let template = body
        .get("template")
        .cloned()
        .unwrap_or(serde_json::json!({}));
    let name = template
        .get("name")
        .and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_else(|| format!("Imported theme {}", chrono::Utc::now().timestamp()));
    let primary_color = template
        .get("primary_color")
        .and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_else(|| "#2563eb".to_string());

    let theme = ThemeService::create_theme(
        &state.biz_context,
        &auth.user.id,
        &project_id,
        CreateThemeRequest {
            project_id: project_id.clone(),
            name,
            primary_color: primary_color.clone(),
            secondary_color: template
                .get("secondary_color")
                .and_then(|v| v.as_str())
                .unwrap_or("#0ea5e9")
                .to_string(),
            background_color: template
                .get("background_color")
                .and_then(|v| v.as_str())
                .unwrap_or("#ffffff")
                .to_string(),
            text_color: template
                .get("text_color")
                .and_then(|v| v.as_str())
                .unwrap_or("#0f172a")
                .to_string(),
            font_family: template
                .get("font_family")
                .and_then(|v| v.as_str())
                .map(String::from),
            logo_url: template
                .get("logo_url")
                .and_then(|v| v.as_str())
                .map(String::from),
            favicon_url: template
                .get("favicon_url")
                .and_then(|v| v.as_str())
                .map(String::from),
            config: Some(template.clone()),
            is_global: Some(false),
        },
    )
    .await?;

    Ok(Json(ApiResponse::new(ImportProjectThemeTemplateResponse {
        id: theme.id,
        name: theme.name,
        changes: vec![],
        migrated_from: 0,
    })))
}

/// Project addon update
pub async fn update_project_addon_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, addon_id)): Path<(String, String)>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<ApiResponse<ProjectAddonResponse>>, AppError> {
    use cms_biz::project::ProjectService;

    let addon = ProjectService::update_project_addon(
        &state.biz_context,
        &auth.user.id,
        &project_id,
        &addon_id,
        body.get("config").cloned(),
        None,
    )
    .await?;
    Ok(Json(ApiResponse::new(addon)))
}

/// Project addon activate
pub async fn activate_project_addon_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, addon_id)): Path<(String, String)>,
) -> Result<Json<ApiResponse<ProjectAddonResponse>>, AppError> {
    use cms_biz::project::ProjectService;
    let addon = ProjectService::update_project_addon(
        &state.biz_context,
        &auth.user.id,
        &project_id,
        &addon_id,
        None,
        Some(true),
    )
    .await?;
    Ok(Json(ApiResponse::new(addon)))
}

/// Project addon deactivate
pub async fn deactivate_project_addon_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, addon_id)): Path<(String, String)>,
) -> Result<Json<ApiResponse<ProjectAddonResponse>>, AppError> {
    use cms_biz::project::ProjectService;
    let addon = ProjectService::update_project_addon(
        &state.biz_context,
        &auth.user.id,
        &project_id,
        &addon_id,
        None,
        Some(false),
    )
    .await?;
    Ok(Json(ApiResponse::new(addon)))
}
