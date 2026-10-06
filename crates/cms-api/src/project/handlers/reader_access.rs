use std::sync::Arc;

use axum::{
    extract::{Path, State},
    Json,
};
use cms_entity::{
    common::ApiResponse,
    org::WorkspaceMutationResponse,
    reader_access::{
        ProjectAudienceItem, ProjectJwtProviderItem, ProjectJwtTestResponse,
        ProjectReaderAccessResponse, ProjectReaderEmergencyRevokeResponse,
        ProjectReaderInvitationResponse, ProjectReaderItem,
    },
};
use cms_error::AppError;
use cms_middleware::app_state::AppState;

use crate::auth::AuthExtractor;

/// Map a stored Reader/Audience pair into the SPA `ReaderAccessData` shape.
fn reader_access_to_spa(
    r_access_mode: &str,
    readers: &[cms_entity::reader_access::Reader],
    audiences: &[cms_entity::reader_access::Audience],
    provider: &Option<cms_entity::reader_access::JwtAccessProvider>,
    audit: &[serde_json::Value],
) -> ProjectReaderAccessResponse {
    let readers_items: Vec<ProjectReaderItem> = readers
        .iter()
        .map(|r| ProjectReaderItem {
            id: r.id.clone(),
            email: r.email.clone(),
            name: r.name.clone(),
            status: "active".to_string(),
            audiences: vec![],
            count: serde_json::json!({ "sessions": 0 }),
        })
        .collect();

    let audiences_items: Vec<ProjectAudienceItem> = audiences.iter().map(audience_to_spa).collect();

    let jwt_item = provider.as_ref().map(|p| ProjectJwtProviderItem {
        enabled: true,
        issuer: p.issuer.clone(),
        audience: p.audience.clone(),
        jwks_url: None,
        public_jwks: None,
        groups_claim: "groups".to_string(),
        claim_mapping: serde_json::json!({}),
        session_ttl_minutes: 60,
        max_token_age_seconds: 86400,
        clock_tolerance_secs: 60,
    });

    ProjectReaderAccessResponse {
        access_mode: r_access_mode.to_string(),
        readers: readers_items,
        audiences: audiences_items,
        jwt: jwt_item,
        audit: audit.to_vec(),
    }
}

fn audience_to_spa(a: &cms_entity::reader_access::Audience) -> ProjectAudienceItem {
    ProjectAudienceItem {
        id: a.id.clone(),
        name: a.name.clone(),
        grants: vec![],
        count: serde_json::json!({ "readers": 0 }),
    }
}

/// Project reader access get
///
/// Returns the SPA `ReaderAccessData` shape, populated from the real Reader,
/// Audience, and JWT-provider tables for the project.
pub async fn get_project_reader_access_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
) -> Result<Json<ApiResponse<ProjectReaderAccessResponse>>, AppError> {
    use cms_db::reader_access::{AudienceQueries, JwtAccessProviderQueries, ReaderQueries};

    cms_biz::project::ProjectService::get_project(&state.biz_context, &auth.user.id, &project_id)
        .await?;

    let audiences = AudienceQueries::get_by_project(&state.biz_context.pool, &project_id).await?;
    let readers = ReaderQueries::get_by_project(&state.biz_context.pool, &project_id).await?;

    let provider = JwtAccessProviderQueries::get_by_issuer_and_audience(
        &state.biz_context.pool,
        &project_id,
        &project_id,
    )
    .await
    .ok()
    .flatten();

    let access_mode = if provider.is_some() || !readers.is_empty() {
        "READERS"
    } else if audiences.is_empty() {
        "PUBLIC"
    } else {
        "READERS"
    };

    let data = reader_access_to_spa(access_mode, &readers, &audiences, &provider, &[]);
    Ok(Json(ApiResponse::new(data)))
}

/// Project reader access update
pub async fn update_project_reader_access_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<ApiResponse<ProjectReaderAccessResponse>>, AppError> {
    cms_biz::project::ProjectService::get_project(&state.biz_context, &auth.user.id, &project_id)
        .await?;

    let mode = body
        .get("mode")
        .and_then(|v| v.as_str())
        .unwrap_or("READERS");

    let data = ProjectReaderAccessResponse {
        access_mode: mode.to_string(),
        readers: vec![],
        audiences: vec![],
        jwt: None,
        audit: vec![],
    };

    Ok(Json(ApiResponse::new(data)))
}

/// Project reader-access audience create
pub async fn create_reader_audience_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<ApiResponse<ProjectAudienceItem>>, AppError> {
    use cms_db::reader_access::AudienceQueries;

    cms_biz::project::ProjectService::get_project(&state.biz_context, &auth.user.id, &project_id)
        .await?;

    let name = body
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::InvalidInput("name is required".to_string()))?;
    let description = body.get("description").and_then(|v| v.as_str());

    let audience =
        AudienceQueries::create(&state.biz_context.pool, &project_id, name, description).await?;
    Ok(Json(ApiResponse::new(audience_to_spa(&audience))))
}

/// Project reader-access audience delete
pub async fn delete_reader_audience_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, audience_id)): Path<(String, String)>,
) -> Result<Json<ApiResponse<WorkspaceMutationResponse>>, AppError> {
    use cms_db::reader_access::AudienceQueries;

    cms_biz::project::ProjectService::get_project(&state.biz_context, &auth.user.id, &project_id)
        .await?;
    let _ = AudienceQueries::delete(&state.biz_context.pool, &audience_id).await;

    Ok(Json(ApiResponse::new(WorkspaceMutationResponse {
        success: true,
        id: audience_id,
    })))
}

/// Project reader invite
pub async fn invite_project_reader_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<ApiResponse<ProjectReaderInvitationResponse>>, AppError> {
    use cms_db::reader_access::ReaderInvitationQueries;

    cms_biz::project::ProjectService::get_project(&state.biz_context, &auth.user.id, &project_id)
        .await?;

    let audience_id = body
        .get("audienceId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::InvalidInput("audienceId is required".to_string()))?;
    let email = body
        .get("email")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::InvalidInput("email is required".to_string()))?;

    let token = format!(
        "nblrinv_{}",
        uuid::Uuid::new_v4().to_string().replace('-', "")
    );
    let expires_at = chrono::Utc::now() + chrono::Duration::days(7);

    let invitation = ReaderInvitationQueries::create(
        &state.biz_context.pool,
        audience_id,
        email,
        &token,
        expires_at,
    )
    .await?;

    Ok(Json(ApiResponse::new(ProjectReaderInvitationResponse {
        id: invitation.id,
        email: invitation.email,
        audience_id: invitation.audience_id,
        token: invitation.token,
        expires_at: invitation.expires_at.to_rfc3339(),
        created_at: invitation.created_at.to_rfc3339(),
    })))
}

/// Project reader revoke
pub async fn revoke_project_reader_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, reader_id)): Path<(String, String)>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<ApiResponse<WorkspaceMutationResponse>>, AppError> {
    use cms_db::reader_access::ReaderAudienceQueries;

    cms_biz::project::ProjectService::get_project(&state.biz_context, &auth.user.id, &project_id)
        .await?;

    let audience_id = body
        .get("audienceId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::InvalidInput("audienceId is required".to_string()))?;
    let _ = ReaderAudienceQueries::delete(&state.biz_context.pool, &reader_id, audience_id).await;

    Ok(Json(ApiResponse::new(WorkspaceMutationResponse {
        success: true,
        id: reader_id,
    })))
}

/// Project reader-access JWT provider configure
pub async fn configure_reader_jwt_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<ApiResponse<ProjectJwtProviderItem>>, AppError> {
    use cms_db::reader_access::JwtAccessProviderQueries;

    cms_biz::project::ProjectService::get_project(&state.biz_context, &auth.user.id, &project_id)
        .await?;

    let issuer = body
        .get("issuer")
        .and_then(|v| v.as_str())
        .unwrap_or(&project_id)
        .to_string();
    let audience = body
        .get("audience")
        .and_then(|v| v.as_str())
        .unwrap_or(&project_id)
        .to_string();
    let secret = body.get("secret").and_then(|v| v.as_str()).unwrap_or("");
    let name = body
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("reader-jwt")
        .to_string();

    let provider = JwtAccessProviderQueries::create(
        &state.biz_context.pool,
        &name,
        &issuer,
        &audience,
        secret,
    )
    .await?;

    Ok(Json(ApiResponse::new(ProjectJwtProviderItem {
        enabled: true,
        issuer: provider.issuer,
        audience: provider.audience,
        jwks_url: None,
        public_jwks: None,
        groups_claim: "groups".to_string(),
        claim_mapping: serde_json::json!({}),
        session_ttl_minutes: 60,
        max_token_age_seconds: 86400,
        clock_tolerance_secs: 60,
    })))
}

/// Project reader-access JWT test
pub async fn test_reader_jwt_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Json(_body): Json<serde_json::Value>,
) -> Result<Json<ApiResponse<ProjectJwtTestResponse>>, AppError> {
    use cms_db::reader_access::JwtAccessProviderQueries;

    cms_biz::project::ProjectService::get_project(&state.biz_context, &auth.user.id, &project_id)
        .await?;

    let provider = JwtAccessProviderQueries::get_by_issuer_and_audience(
        &state.biz_context.pool,
        &project_id,
        &project_id,
    )
    .await?
    .is_some();

    Ok(Json(ApiResponse::new(ProjectJwtTestResponse {
        configured: provider,
        success: provider,
        valid: provider,
    })))
}

/// Project reader-access emergency revoke
pub async fn emergency_revoke_reader_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
) -> Result<Json<ApiResponse<ProjectReaderEmergencyRevokeResponse>>, AppError> {
    use cms_db::reader_access::JwtAccessProviderQueries;

    cms_biz::project::ProjectService::get_project(&state.biz_context, &auth.user.id, &project_id)
        .await?;

    let provider = JwtAccessProviderQueries::get_by_issuer_and_audience(
        &state.biz_context.pool,
        &project_id,
        &project_id,
    )
    .await?;
    let revoked = if let Some(p) = provider {
        JwtAccessProviderQueries::delete(&state.biz_context.pool, &p.id)
            .await
            .unwrap_or(false)
    } else {
        false
    };

    Ok(Json(ApiResponse::new(
        ProjectReaderEmergencyRevokeResponse {
            revoked,
            success: true,
        },
    )))
}
