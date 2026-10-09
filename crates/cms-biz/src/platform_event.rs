//! Platform Event Business Logic
//!
//! This module contains business logic for platform events (funnel tracking, etc.).

use chrono::Utc;
use cms_db::platform_event::PlatformEventQueries;
use cms_entity::{
    common::PaginatedResponse,
    platform_event::{CreatePlatformEventRequest, PlatformEventResponse},
};

use crate::{AppError, BizContext};

/// Product funnel events are emitted only by trusted server-side workflows.
/// Client-supplied event ingestion rejects these names so a user cannot inflate
/// acquisition, activation, or publish-conversion metrics.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FunnelEventType {
    SignupCompleted,
    PageEdited,
    PublishClicked,
    PublishReady,
}

impl FunnelEventType {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::SignupCompleted => "signup_completed",
            Self::PageEdited => "page_edited",
            Self::PublishClicked => "publish_clicked",
            Self::PublishReady => "publish_ready",
        }
    }

    pub fn is_reserved_event_type(event_type: &str) -> bool {
        matches!(
            event_type,
            "signup_completed" | "page_edited" | "publish_clicked" | "publish_ready"
        )
    }
}

/// Platform event service
pub struct PlatformEventService;

impl PlatformEventService {
    /// Create a platform event
    pub async fn create_event(
        ctx: &BizContext,
        user_id: Option<&str>,
        request: CreatePlatformEventRequest,
    ) -> Result<PlatformEventResponse, AppError> {
        let event = PlatformEventQueries::create(
            &ctx.pool,
            user_id,
            &request.event_type,
            request.metadata,
        )
        .await?;

        Ok(event.into())
    }

    /// Record a trusted funnel event without making core product actions fail if
    /// analytics persistence is temporarily unavailable. Failures are logged so
    /// operators can distinguish a tracking gap from a healthy zero count.
    pub async fn record_funnel_event_best_effort(
        ctx: &BizContext,
        user_id: &str,
        event_type: FunnelEventType,
        metadata: serde_json::Value,
    ) {
        if let Err(error) = PlatformEventQueries::create(
            &ctx.pool,
            Some(user_id),
            event_type.as_str(),
            metadata,
        )
        .await
        {
            tracing::warn!(
                user_id,
                event_type = event_type.as_str(),
                error = %error,
                "could not persist trusted platform funnel event"
            );
        }
    }

    /// List platform events
    pub async fn list_events(
        ctx: &BizContext,
        _user_id: &str,
        event_type: Option<&str>,
        page: u64,
        page_size: u64,
    ) -> Result<PaginatedResponse<PlatformEventResponse>, AppError> {
        let limit = page_size.max(1) as i64;
        let offset = page.saturating_sub(1) as i64 * limit;
        let events = PlatformEventQueries::list(
            &ctx.pool,
            None,
            event_type,
            Some(limit),
            Some(offset),
        )
        .await?;

        let total =
            PlatformEventQueries::count(&ctx.pool, None, event_type)
                .await?;

        Ok(PaginatedResponse::new(
            events.into_iter().map(|e| e.into()).collect(),
            total as u64,
            page,
            page_size,
        ))
    }

    /// Get a platform event by ID
    pub async fn get_event(
        ctx: &BizContext,
        _user_id: &str,
        event_id: &str,
    ) -> Result<PlatformEventResponse, AppError> {
        let event = PlatformEventQueries::get_by_id(&ctx.pool, event_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Event not found".to_string()))?;
        Ok(event.into())
    }

    /// Get system health
    pub async fn get_system_health(ctx: &BizContext) -> Result<serde_json::Value, AppError> {
        let start = std::time::Instant::now();
        let db_status = match cms_db::sqlx::query("SELECT 1").execute(&ctx.pool).await {
            Ok(_) => "connected",
            Err(e) => {
                tracing::error!("Database health check failed: {}", e);
                "disconnected"
            }
        };
        let latency_ms = start.elapsed().as_millis();
        let status = if db_status == "connected" {
            "healthy"
        } else {
            "degraded"
        };

        Ok(serde_json::json!({
            "status": status,
            "database": db_status,
            "database_latency_ms": latency_ms,
            "timestamp": Utc::now().to_rfc3339()
        }))
    }
}
