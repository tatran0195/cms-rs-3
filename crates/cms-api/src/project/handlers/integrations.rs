use std::sync::Arc;

use axum::{
    extract::{Path, State},
    Json,
};
use cms_error::AppError;
use cms_middleware::app_state::AppState;

use crate::auth::AuthExtractor;

fn integration_to_si(i: &cms_entity::integration::ProjectIntegrationResponse) -> serde_json::Value {
    let provider = format!("{:?}", i.provider).to_lowercase();
    serde_json::json!({
        "id": i.id,
        "providerId": provider,
        "category": "webhook",
        "ownership": "project",
        "status": if i.is_active { "active" } else { "inactive" },
        "health": { "status": "unverified", "checkedAt": null, "code": null },
        "credential": { "configured": i.config != serde_json::Value::Null },
        "config": i.config,
        "revision": 1,
        "createdAt": i.created_at.to_rfc3339(),
        "updatedAt": i.updated_at.to_rfc3339(),
    })
}

/// Project integrations list
///
/// Returns the SPA integration catalog summary constructed from the stored
/// ProjectIntegration rows for the project.
pub async fn list_project_integrations_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    use cms_biz::integration::IntegrationService;

    let integrations =
        IntegrationService::list_integrations(&state.biz_context, &auth.user.id, &project_id)
            .await?;
    let items: Vec<serde_json::Value> = integrations.iter().map(integration_to_si).collect();
    Ok(Json(serde_json::json!({ "data": items })))
}

/// Project integration create
pub async fn create_project_integration_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
    use cms_biz::integration::IntegrationService;
    use cms_entity::integration::{CreateProjectIntegrationRequest, IntegrationProvider};

    let provider_str = body
        .get("provider")
        .and_then(|v| v.as_str())
        .unwrap_or("webhook")
        .to_lowercase();
    let provider = match provider_str.as_str() {
        "slack" => IntegrationProvider::Slack,
        "discord" => IntegrationProvider::Discord,
        "zapier" => IntegrationProvider::Zapier,
        _ => IntegrationProvider::Webhook,
    };

    let integration_name = body
        .get("name")
        .and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_else(|| format!("{:?}", provider));

    let integration = IntegrationService::create_integration(
        &state.biz_context,
        &auth.user.id,
        CreateProjectIntegrationRequest {
            project_id: project_id.clone(),
            provider,
            name: integration_name,
            config: body.get("config").cloned().unwrap_or(serde_json::json!({})),
            webhook_url: body
                .get("webhookUrl")
                .and_then(|v| v.as_str())
                .map(String::from),
            is_active: true,
        },
    )
    .await?;

    Ok(Json(
        serde_json::json!({ "data": integration_to_si(&integration) }),
    ))
}

/// Project integration update (provider-scoped)
pub async fn update_project_integration_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, provider_id)): Path<(String, String)>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
    use cms_biz::integration::IntegrationService;
    use cms_entity::integration::UpdateProjectIntegrationRequest;

    let integrations =
        IntegrationService::list_integrations(&state.biz_context, &auth.user.id, &project_id)
            .await?;
    let target = integrations
        .into_iter()
        .find(|i| {
            i.id == provider_id
                || format!("{:?}", i.provider).eq_ignore_ascii_case(&provider_id)
        })
        .ok_or_else(|| AppError::NotFound(format!("Integration '{}' not found for project", provider_id)))?;

    let updated = IntegrationService::update_integration(
        &state.biz_context,
        &auth.user.id,
        &target.id,
        UpdateProjectIntegrationRequest {
            name: body.get("name").and_then(|v| v.as_str()).map(String::from),
            config: body.get("config").cloned(),
            webhook_url: body
                .get("webhookUrl")
                .and_then(|v| v.as_str())
                .map(String::from),
            is_active: body.get("isActive").and_then(|v| v.as_bool()),
        },
    )
    .await?;

    Ok(Json(
        serde_json::json!({ "data": integration_to_si(&updated) }),
    ))
}

/// Project integration delete (provider-scoped)
pub async fn delete_project_integration_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, provider_id)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, AppError> {
    use cms_biz::integration::IntegrationService;

    let integrations =
        IntegrationService::list_integrations(&state.biz_context, &auth.user.id, &project_id)
            .await?;
    let target = integrations
        .into_iter()
        .find(|i| {
            i.id == provider_id
                || format!("{:?}", i.provider).eq_ignore_ascii_case(&provider_id)
        })
        .ok_or_else(|| AppError::NotFound(format!("Integration '{}' not found for project", provider_id)))?;
    IntegrationService::delete_integration(&state.biz_context, &auth.user.id, &target.id).await?;

    Ok(Json(serde_json::json!({
        "data": { "providerId": provider_id, "deleted": true }
    })))
}

/// Project integration verify
pub async fn verify_project_integration_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, provider_id)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, AppError> {
    use cms_biz::integration::IntegrationService;

    let integrations =
        IntegrationService::list_integrations(&state.biz_context, &auth.user.id, &project_id)
            .await?;
    let target = integrations
        .into_iter()
        .find(|i| {
            i.id == provider_id
                || format!("{:?}", i.provider).eq_ignore_ascii_case(&provider_id)
        })
        .ok_or_else(|| AppError::NotFound(format!("Integration '{}' not found for project", provider_id)))?;
    let result =
        IntegrationService::test_integration(&state.biz_context, &auth.user.id, &target.id).await?;

    Ok(Json(serde_json::json!({ "data": result })))
}

/// Project integration delete-confirmation
pub async fn delete_project_integration_confirmation_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, provider_id)): Path<(String, String)>,
    Json(_body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
    use cms_biz::integration::IntegrationService;

    let integrations =
        IntegrationService::list_integrations(&state.biz_context, &auth.user.id, &project_id)
            .await?;
    let _ = integrations
        .into_iter()
        .find(|i| {
            i.id == provider_id
                || format!("{:?}", i.provider).eq_ignore_ascii_case(&provider_id)
        })
        .ok_or_else(|| AppError::NotFound(format!("Integration '{}' not found for project", provider_id)))?;

    Ok(Json(serde_json::json!({
        "data": { "confirmationToken": "confirmed" }
    })))
}
