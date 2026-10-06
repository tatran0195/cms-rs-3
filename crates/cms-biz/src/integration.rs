//! Integration Business Logic
//!
//! This module contains business logic for project integrations.

use cms_db::integration::{
    IntegrationAuditEventQueries,
    IntegrationIdempotencyRecordQueries,
    ProjectIntegrationQueries,
};
use cms_entity::integration::{
    CreateProjectIntegrationRequest, IntegrationProvider,
    ProjectIntegrationResponse, UpdateProjectIntegrationRequest,
};

use crate::{AppError, BizContext};

/// Integration service
pub struct IntegrationService;

impl IntegrationService {
    /// Create a new project integration
    pub async fn create_integration(
        ctx: &BizContext,
        user_id: &str,
        request: CreateProjectIntegrationRequest,
    ) -> Result<ProjectIntegrationResponse, AppError> {
        // Check if user has access to the project
        ctx.authz
            .require_project_access(user_id, &request.project_id)
            .await?;

        let integration = ProjectIntegrationQueries::create(
            &ctx.pool,
            &request.project_id,
            request.provider,
            &request.name,
            request.config,
            request.webhook_url.as_deref(),
        )
        .await?;

        // Log the creation
        IntegrationAuditEventQueries::create(
            &ctx.pool,
            &integration.id,
            "integration.created",
            serde_json::json!({
                "user_id": user_id,
                "provider": integration.provider,
            }),
            "COMPLETED",
            None,
        )
        .await?;

        Ok(integration.into())
    }

    /// Get integration by ID
    pub async fn get_integration(
        ctx: &BizContext,
        user_id: &str,
        integration_id: &str,
    ) -> Result<ProjectIntegrationResponse, AppError> {
        let integration = ProjectIntegrationQueries::get_by_id(&ctx.pool, integration_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Integration not found".to_string()))?;

        // Check if user has access to the project
        ctx.authz
            .require_project_access(user_id, &integration.project_id)
            .await?;

        Ok(integration.into())
    }

    /// List integrations for a project
    pub async fn list_integrations(
        ctx: &BizContext,
        user_id: &str,
        project_id: &str,
    ) -> Result<Vec<ProjectIntegrationResponse>, AppError> {
        // Check if user has access to the project
        ctx.authz
            .require_project_access(user_id, project_id)
            .await?;

        let integrations = ProjectIntegrationQueries::get_by_project(&ctx.pool, project_id).await?;

        Ok(integrations.into_iter().map(|i| i.into()).collect())
    }

    /// Update an integration
    pub async fn update_integration(
        ctx: &BizContext,
        user_id: &str,
        integration_id: &str,
        request: UpdateProjectIntegrationRequest,
    ) -> Result<ProjectIntegrationResponse, AppError> {
        let integration = ProjectIntegrationQueries::get_by_id(&ctx.pool, integration_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Integration not found".to_string()))?;

        // Check if user has access to the project
        ctx.authz
            .require_project_access(user_id, &integration.project_id)
            .await?;

        let changes_json = serde_json::to_value(&request).unwrap_or_default();
        let updated = ProjectIntegrationQueries::update(
            &ctx.pool,
            integration_id,
            request.name.as_deref(),
            request.config,
            request.webhook_url.as_deref(),
            request.is_active,
        )
        .await?;

        // Log the update
        IntegrationAuditEventQueries::create(
            &ctx.pool,
            integration_id,
            "integration.updated",
            serde_json::json!({
                "user_id": user_id,
                "changes": changes_json,
            }),
            "COMPLETED",
            None,
        )
        .await?;

        Ok(updated.into())
    }

    /// Delete an integration
    pub async fn delete_integration(
        ctx: &BizContext,
        user_id: &str,
        integration_id: &str,
    ) -> Result<bool, AppError> {
        let integration = ProjectIntegrationQueries::get_by_id(&ctx.pool, integration_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Integration not found".to_string()))?;

        // Check if user has access to the project
        ctx.authz
            .require_project_access(user_id, &integration.project_id)
            .await?;

        let deleted = ProjectIntegrationQueries::delete(&ctx.pool, integration_id).await?;

        if deleted {
            // Log the deletion
            IntegrationAuditEventQueries::create(
                &ctx.pool,
                integration_id,
                "integration.deleted",
                serde_json::json!({
                    "user_id": user_id,
                }),
                "COMPLETED",
                None,
            )
            .await?;
        }

        Ok(deleted)
    }

    /// Get integration by project and provider
    pub async fn get_integration_by_provider(
        ctx: &BizContext,
        user_id: &str,
        project_id: &str,
        provider: IntegrationProvider,
    ) -> Result<Vec<ProjectIntegrationResponse>, AppError> {
        // Check if user has access to the project
        ctx.authz
            .require_project_access(user_id, project_id)
            .await?;

        let integrations =
            ProjectIntegrationQueries::get_by_project_and_provider(&ctx.pool, project_id, provider)
                .await?;

        Ok(integrations.into_iter().map(|i| i.into()).collect())
    }

    /// Check if idempotency key has been processed
    pub async fn is_idempotent(
        ctx: &BizContext,
        integration_id: &str,
        request_id: &str,
    ) -> Result<bool, AppError> {
        let exists = IntegrationIdempotencyRecordQueries::get_by_request_id(
            &ctx.pool,
            integration_id,
            request_id,
        )
        .await?;

        Ok(exists.is_some())
    }

    /// Mark a request as processed (idempotency)
    pub async fn mark_processed(
        ctx: &BizContext,
        integration_id: &str,
        request_id: &str,
    ) -> Result<(), AppError> {
        IntegrationIdempotencyRecordQueries::create(&ctx.pool, integration_id, request_id).await?;

        Ok(())
    }

    /// Enable an integration
    pub async fn enable_integration(
        ctx: &BizContext,
        user_id: &str,
        integration_id: &str,
    ) -> Result<ProjectIntegrationResponse, AppError> {
        Self::update_integration(
            ctx,
            user_id,
            integration_id,
            UpdateProjectIntegrationRequest {
                name: None,
                config: None,
                webhook_url: None,
                is_active: Some(true),
            },
        )
        .await
    }

    /// Disable an integration
    pub async fn disable_integration(
        ctx: &BizContext,
        user_id: &str,
        integration_id: &str,
    ) -> Result<ProjectIntegrationResponse, AppError> {
        Self::update_integration(
            ctx,
            user_id,
            integration_id,
            UpdateProjectIntegrationRequest {
                name: None,
                config: None,
                webhook_url: None,
                is_active: Some(false),
            },
        )
        .await
    }

    /// Test an integration by pinging its configured webhook endpoint with SSRF protection
    pub async fn test_integration(
        ctx: &BizContext,
        user_id: &str,
        integration_id: &str,
    ) -> Result<serde_json::Value, AppError> {
        let integration = Self::get_integration(ctx, user_id, integration_id).await?;

        // Extract candidate webhook target URL
        let target_url = integration
            .webhook_url
            .as_deref()
            .or_else(|| integration.config.get("url").and_then(|v| v.as_str()))
            .or_else(|| integration.config.get("webhook_url").and_then(|v| v.as_str()));

        let target_url = match target_url {
            Some(u) if !u.trim().is_empty() => u.trim(),
            _ => {
                return Ok(serde_json::json!({
                    "success": true,
                    "message": "Integration configuration validated (no webhook endpoint configured to test)"
                }));
            }
        };

        // Parse and validate URL
        let parsed_url = reqwest::Url::parse(target_url)
            .map_err(|e| AppError::InvalidInput(format!("Invalid webhook URL '{target_url}': {e}")))?;

        let scheme = parsed_url.scheme();
        if scheme != "http" && scheme != "https" {
            return Err(AppError::InvalidInput(
                "Only HTTP and HTTPS URLs are allowed for webhook integrations".to_string(),
            ));
        }

        let host = parsed_url
            .host_str()
            .ok_or_else(|| AppError::InvalidInput("Webhook URL has no valid host".to_string()))?;
        let port = parsed_url.port_or_known_default().unwrap_or(80);

        // Resolve DNS and perform SSRF validation
        let addrs = tokio::net::lookup_host((host, port))
            .await
            .map_err(|e| AppError::InvalidInput(format!("DNS resolution failed for '{host}': {e}")))?;

        let mut resolved_any = false;
        for addr in addrs {
            resolved_any = true;
            if crate::openapi::is_private_or_restricted_ip(addr.ip()) {
                return Err(AppError::InvalidInput(format!(
                    "Integration webhook URL targets a private or restricted network address ({})",
                    addr.ip()
                )));
            }
        }

        if !resolved_any {
            return Err(AppError::InvalidInput(format!(
                "Host '{host}' could not be resolved to any network address"
            )));
        }

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to build HTTP client: {e}")))?;

        let ping_payload = serde_json::json!({
            "event": "test.ping",
            "integration_id": &integration.id,
            "project_id": &integration.project_id,
            "provider": &integration.provider,
            "timestamp": chrono::Utc::now().to_rfc3339(),
        });

        let send_res = client
            .post(parsed_url)
            .header("User-Agent", "cms-CMS-Integration/1.0")
            .json(&ping_payload)
            .send()
            .await;

        let (success, status_code, message) = match send_res {
            Ok(resp) => {
                let status = resp.status().as_u16();
                if resp.status().is_success() {
                    (true, Some(status), "Integration test webhook delivered successfully".to_string())
                } else {
                    (false, Some(status), format!("Webhook endpoint returned HTTP error status {}", status))
                }
            }
            Err(e) => (false, None, format!("Failed to reach webhook endpoint: {e}")),
        };

        // Audit log test execution
        let _ = IntegrationAuditEventQueries::create(
            &ctx.pool,
            integration_id,
            "integration.tested",
            serde_json::json!({
                "user_id": user_id,
                "url": target_url,
                "success": success,
                "status_code": status_code,
                "message": &message,
            }),
            if success { "COMPLETED" } else { "FAILED" },
            None,
        )
        .await;

        Ok(serde_json::json!({
            "success": success,
            "status_code": status_code,
            "message": message,
        }))
    }
}
