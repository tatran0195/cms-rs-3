//! Setup business service

use cms_db::SetupQueries;
use cms_entity::setup::{CompleteSetupRequest, CompleteSetupResponse, SetupStatusResponse};
use cms_error::AppError;
use crate::BizContext;

pub struct SetupService;

impl SetupService {
    /// Get current platform setup status
    pub async fn get_status(
        ctx: &BizContext,
        configured_oauth: Vec<String>,
    ) -> Result<SetupStatusResponse, AppError> {
        let (is_initialized, requires_setup) = SetupQueries::get_setup_status(&ctx.pool).await?;
        Ok(SetupStatusResponse {
            is_initialized,
            requires_setup,
            configured_oauth_providers: configured_oauth,
        })
    }

    /// Complete initial setup
    pub async fn complete_setup(
        ctx: &BizContext,
        req: CompleteSetupRequest,
        session_token: &str,
    ) -> Result<CompleteSetupResponse, AppError> {
        let hashed_password = cms_auth::password::hash_password(&req.admin_password)?;
        let user = SetupQueries::complete_setup(&ctx.pool, &req, &hashed_password, session_token).await?;
        Ok(CompleteSetupResponse {
            success: true,
            user: user.into(),
            redirect_url: "/app".to_string(),
        })
    }
}
