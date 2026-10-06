use std::sync::Arc;

use axum::{
    extract::{Path, State},
    Json,
};
use cms_error::AppError;
use cms_middleware::app_state::AppState;

use super::common::{project_deployments, project_org_id};
use crate::auth::AuthExtractor;

/// Render a stored domain as the SPA's `Domain` shape, including the stable DNS
/// TXT challenge that an authorized project member must publish before routing is enabled.
fn domain_to_spa(d: &cms_entity::domain::Domain) -> serde_json::Value {
    let verified = d.verified_at.is_some();
    let dns_status = if verified { "VERIFIED" } else { "PENDING" };
    // TLS status is recorded only by a successful request observed through the
    // configured trusted TLS terminator; DNS ownership alone is not sufficient.
    let record_name = format!("_cms-rs-verification.{}", d.hostname);
    let record_value = format!("cms-rs-verification={}", d.verification_token);

    serde_json::json!({
        "id": d.id,
        "domain": d.hostname,
        "verified": verified,
        "isPrimary": d.is_primary,
        "dnsStatus": dns_status,
        "sslStatus": d.ssl_status,
        "sslCertificateExpiresAt": d.ssl_certificate_expires_at.map(|t| t.to_rfc3339()),
        "verificationToken": d.verification_token,
        "records": [{
            "type": "TXT",
            "name": record_name,
            "value": record_value,
            "ttl": 300
        }],
        "createdAt": d.created_at.to_rfc3339(),
        "verifiedAt": d.verified_at.map(|t| t.to_rfc3339()),
        "lastCheckedAt": d.ssl_checked_at.map(|t| t.to_rfc3339()),
        "lastError": d.ssl_last_error,
    })
}

/// Look up a domain and confirm its owning deployment belongs to the project.
async fn require_domain_in_project(
    state: &Arc<AppState>,
    project_id: &str,
    domain_id: &str,
) -> Result<cms_entity::domain::Domain, AppError> {
    let domain = cms_db::domain::DomainQueries::get_by_id(&state.biz_context.pool, domain_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Domain not found".to_string()))?;
    let deployment = cms_db::deployment::DeploymentQueries::get_by_id(
        &state.biz_context.pool,
        &domain.deployment_id,
    )
    .await?
    .ok_or_else(|| AppError::NotFound("Deployment not found".to_string()))?;
    if deployment.project_id != project_id {
        return Err(AppError::Forbidden);
    }
    Ok(domain)
}

/// List domains for a project
pub async fn list_project_domains_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Auth: confirm the caller can access the project, then gather domains across
    // all of the project's deployments (the domain model is deployment-scoped).
    let _org_id = project_org_id(&state, &auth, &project_id).await?;
    let deployments = project_deployments(&state, &project_id).await?;

    let mut items = Vec::new();
    for d in deployments {
        let domains =
            cms_db::domain::DomainQueries::get_by_deployment(&state.biz_context.pool, &d.id)
                .await?;
        items.extend(domains.iter().map(domain_to_spa));
    }

    Ok(Json(serde_json::json!({ "data": items })))
}

/// Add a domain to a project
///
/// Attaches a hostname to the project's newest deployment, creating the primary
/// domain when the deployment has none yet.
pub async fn add_project_domain_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
    let _org_id = project_org_id(&state, &auth, &project_id).await?;

    let hostname = body
        .get("domain")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .trim_end_matches('.')
        .to_lowercase();
    if hostname.is_empty() {
        return Err(AppError::InvalidInput("domain is required".to_string()));
    }

    let deployments = project_deployments(&state, &project_id).await?;
    let deployment = deployments
        .first()
        .ok_or_else(|| AppError::NotFound("No deployment exists for this project".to_string()))?;

    let has_primary = cms_db::domain::DomainQueries::get_primary_by_deployment(
        &state.biz_context.pool,
        &deployment.id,
    )
    .await?
    .is_some();
    let is_primary = !has_primary;

    let domain = cms_db::domain::DomainQueries::create(
        &state.biz_context.pool,
        &deployment.id,
        &hostname,
        is_primary,
    )
    .await?;
    state.invalidate_host_resolution_cache();

    Ok(Json(serde_json::json!({ "data": domain_to_spa(&domain) })))
}

/// Delete a domain from a project
pub async fn delete_project_domain_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, id)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, AppError> {
    let _org_id = project_org_id(&state, &auth, &project_id).await?;
    let _domain = require_domain_in_project(&state, &project_id, &id).await?;
    cms_db::domain::DomainQueries::delete(&state.biz_context.pool, &id).await?;
    state.invalidate_host_resolution_cache();
    Ok(Json(
        serde_json::json!({ "data": { "success": true, "id": id } }),
    ))
}

/// Verify the domain's persisted TXT challenge and keep routing disabled until
/// the DNS proof is visible to the configured resolver.
pub async fn verify_project_domain_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, id)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, AppError> {
    let _org_id = project_org_id(&state, &auth, &project_id).await?;
    let domain = require_domain_in_project(&state, &project_id, &id).await?;
    let is_verified = cms_biz::domain::DomainService::verify_domain_ownership(
        &state.biz_context,
        &auth.user.id,
        &id,
        &domain.verification_token,
        &state.config.domain_verification.resolver_url,
        state.config.domain_verification.timeout_seconds,
    )
    .await?;
    state.invalidate_host_resolution_cache();
    let updated = require_domain_in_project(&state, &project_id, &id).await?;
    let mut response = domain_to_spa(&updated);
    if !is_verified {
        response["lastError"] = serde_json::json!("TXT ownership record was not found yet");
    }
    Ok(Json(serde_json::json!({ "data": response })))
}

/// Set the primary domain for a project
pub async fn set_primary_project_domain_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path((project_id, id)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, AppError> {
    let _org_id = project_org_id(&state, &auth, &project_id).await?;
    let domain = require_domain_in_project(&state, &project_id, &id).await?;

    let updated = cms_db::domain::DomainQueries::set_primary_for_deployment(
        &state.biz_context.pool,
        &domain.deployment_id,
        &domain.id,
    )
    .await?;
    state.invalidate_host_resolution_cache();

    Ok(Json(serde_json::json!({ "data": domain_to_spa(&updated) })))
}
