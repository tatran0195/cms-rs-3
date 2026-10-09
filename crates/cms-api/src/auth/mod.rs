use std::sync::Arc;

use axum::{
    routing::{delete, get, post},
    Router,
};
use cms_middleware::app_state::AppState;

pub mod handlers;
mod middleware;
pub(crate) mod oauth;

use handlers::*;

/// Create the auth router
pub fn router(state: Arc<AppState>) -> Router {
    let admin_origin_config =
        cms_middleware::admin_origin::AdminOriginConfig::from(&state.config.admin_origin);
    let admin_origin_layer =
        cms_middleware::admin_origin::AdminOriginLayer::new(admin_origin_config)
            .expect("Invalid admin origin configuration");

    let admin_routes = Router::new()
        .route(
            "/admin/stop-impersonating",
            post(stop_impersonating_handler),
        )
        .layer(admin_origin_layer);

    Router::new()
        .merge(oauth::router())
        .merge(admin_routes)
        .route("/login", post(login_handler))
        .route("/register", post(register_handler))
        .route("/logout", post(logout_handler))
        .route("/me", get(get_current_user_handler))
        .route("/get-session", get(get_session_handler))
        .route(
            "/email-otp/send-verification-otp",
            post(send_verification_otp_handler),
        )
        .route("/sign-in/email-otp", post(sign_in_email_otp_handler))
        .route("/email-otp/verify-email", post(verify_email_otp_handler))
        .route(
            "/email-otp/request-email-change",
            post(request_email_change_handler),
        )
        .route("/email-otp/change-email", post(change_email_handler))
        .route("/sign-in/social", post(sign_in_social_handler))
        .route("/verify-email", post(verify_email_handler))
        .route("/update-user", post(update_user_handler))
        .route(
            "/invitations/accept",
            post(accept_invitation_handler),
        )
        .route("/sign-out", post(sign_out_better_auth_handler))
        .route("/refresh", post(refresh_session_handler))
        .route("/api-keys", get(list_api_keys_handler))
        .route("/api-keys", post(create_api_key_handler))
        .route("/api-keys/{id}", delete(delete_api_key_handler))
        .with_state(state)
}

// Re-export middleware types
pub use middleware::{
    AuthExtractor, AuthMethod, AuthRejection, OptionalAuthExtractor, RequireAuthMiddleware,
    RequireRoleMiddleware, RoleRejection,
};
