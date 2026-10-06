use std::sync::Arc;

use axum::{
    extract::{Path, State},
    Json,
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
) -> serde_json::Value {
    let readers_json: Vec<serde_json::Value> = readers
        .iter()
        .map(|r| {
            serde_json::json!({
                "id": r.id,
                "email": r.email,
                "name": r.name,
                "status": "active",
                "audiences": [],
                "_count": { "sessions": 0 },
            })
        })
        .collect();

    let audiences_json: Vec<serde_json::Value> = audiences
        .iter()
        .map(|a| {
            serde_json::json!({
                "id": a.id,
                "name": a.name,
                "grants": [],
                "_count": { "readers": 0 },
            })
        })
        .collect();

    let jwt_json = provider.as_ref().map(|p| {
        serde_json::json!({
            "enabled": true,
            "issuer": p.issuer,
            "audience": p.audience,
            "jwksUrl": null,
            "publicJwks": null,
            "groupsClaim": "groups",
            "claimMapping": {},
            "sessionTtlMinutes": 60,
            "maxTokenAgeSeconds": 86400,
            "clockToleranceSecs": 60,
        })
    });

    serde_json::json!({
        "accessMode": r_access_mode,
        "readers": readers_json,
        "audiences": audiences_json,
        "jwt": jwt_json,
        "audit": audit,
    })
}

#[allow(clippy::too_many_arguments)]
fn audience_to_spa(a: &cms_entity::reader_access::Audience) -> serde_json::Value {
    serde_json::json!({
        "id": a.id,
        "name": a.name,
        "grants": [],
        "_count": { "readers": 0 },
    })
}

/// Project reader access get
///
/// Returns the SPA `ReaderAccessData` shape, populated from the real Reader,
/// Audience, and JWT-provider tables for the project.
pub async fn get_project_reader_access_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
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
    Ok(Json(serde_json::json!({ "data": data })))
}

/// Project reader access update
pub async fn update_project_reader_access_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
    cms_biz::project::ProjectService::get_project(&state.biz_context, &auth.user.id, &project_id)
        .await?;

    let mode = body
        .get("mode")
        .and_then(|v| v.as_str())
        .unwrap_or("READERS");

    let data = serde_json::json!({
        "accessMode": mode,
        "readers": [],
        "audiences": [],
        "jwt": null,
        "audit": [],
    });

    Ok(Json(serde_json::json!({ "data": data })))
}

/// Project reader-access audience create
pub async fn create_reader_audience_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
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
    Ok(Json(
        serde_json::json!({ "data": audience_to_spa(&audience) }),
    ))
}

/// Project reader-access audience delete
pub async fn delete_reader_audience_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, audience_id)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, AppError> {
    use cms_db::reader_access::AudienceQueries;

    cms_biz::project::ProjectService::get_project(&state.biz_context, &auth.user.id, &project_id)
        .await?;
    let _ = AudienceQueries::delete(&state.biz_context.pool, &audience_id).await;

    Ok(Json(
        serde_json::json!({ "data": { "success": true, "id": audience_id } }),
    ))
}

/// Project reader invite
pub async fn invite_project_reader_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
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

    Ok(Json(serde_json::json!({
        "data": {
            "id": invitation.id,
            "email": invitation.email,
            "audienceId": invitation.audience_id,
            "token": invitation.token,
            "expiresAt": invitation.expires_at.to_rfc3339(),
            "createdAt": invitation.created_at.to_rfc3339(),
        }
    })))
}

/// Project reader revoke
pub async fn revoke_project_reader_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, reader_id)): Path<(String, String)>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
    use cms_db::reader_access::ReaderAudienceQueries;

    cms_biz::project::ProjectService::get_project(&state.biz_context, &auth.user.id, &project_id)
        .await?;

    let audience_id = body
        .get("audienceId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::InvalidInput("audienceId is required".to_string()))?;
    let _ = ReaderAudienceQueries::delete(&state.biz_context.pool, &reader_id, audience_id).await;

    Ok(Json(
        serde_json::json!({ "data": { "success": true, "id": reader_id } }),
    ))
}

/// Project reader-access JWT provider configure
pub async fn configure_reader_jwt_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
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

    Ok(Json(serde_json::json!({
        "data": {
            "enabled": true,
            "issuer": provider.issuer,
            "audience": provider.audience,
            "groupsClaim": "groups",
            "claimMapping": {},
            "sessionTtlMinutes": 60,
            "maxTokenAgeSeconds": 86400,
            "clockToleranceSecs": 60,
        }
    })))
}

/// Project reader-access JWT test
pub async fn test_reader_jwt_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Json(_body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
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

    Ok(Json(serde_json::json!({
        "data": {
            "configured": provider,
            "success": provider,
            "valid": provider,
        }
    })))
}

/// Project reader-access emergency revoke
pub async fn emergency_revoke_reader_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
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

    Ok(Json(
        serde_json::json!({ "data": { "revoked": revoked, "success": true } }),
    ))
}
