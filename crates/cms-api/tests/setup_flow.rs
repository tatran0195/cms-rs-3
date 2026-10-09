mod common;

use axum::http::{Method, StatusCode};
use common::*;
use serde_json::json;

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_setup_status_and_completion_flow() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;

    // 1. Check setup status endpoint
    let (status, body) = request(
        &ctx.app,
        Method::GET,
        "/api/public/setup/status",
        None,
        None,
    )
    .await?;

    assert_eq!(status, StatusCode::OK);
    assert!(body.get("isInitialized").is_some());
    assert!(body.get("requiresSetup").is_some());

    // 2. Repeat setup should conflict if already initialized
    // When test context initializes, seed data already created users.
    // So attempting to run setup/complete on an already populated database must return CONFLICT.
    let setup_payload = json!({
        "adminName": "Initial Admin",
        "adminEmail": "setup-admin@example.com",
        "adminPassword": "SuperSecretPassword123!",
        "workspaceName": "Acme Portal",
        "workspaceSlug": "acme-portal",
        "allowPublicSignup": false,
        "requireEmailVerification": true,
        "enabledOauthProviders": ["google"],
        "defaultTheme": "dark",
        "defaultLocale": "en"
    });

    let (complete_status, _) = request(
        &ctx.app,
        Method::POST,
        "/api/public/setup/complete",
        None,
        Some(setup_payload),
    )
    .await?;

    // Must be CONFLICT (409) since users already exist in seeded test database
    assert_eq!(complete_status, StatusCode::CONFLICT);

    // 3. Check public meta endpoint reflects requiresSetup and signupDisabled
    let (meta_status, meta_body) = request(
        &ctx.app,
        Method::GET,
        "/api/public/meta",
        None,
        None,
    )
    .await?;

    assert_eq!(meta_status, StatusCode::OK);
    assert!(meta_body.get("providers").is_some());
    assert!(meta_body.get("signupDisabled").is_some());
    assert!(meta_body.get("isInitialized").is_some());

    Ok(())
}
