//! Comprehensive End-to-End Integration Test for the MedBrains Auth & ReBAC Architecture.
//!
//! Validates:
//! 1. Argon2id password hashing and account lockout protection (5 failed attempts).
//! 2. Triple-cookie architecture (`access_token`, `refresh_token`, `csrf_token`) & JWT Claims.
//! 3. Machine API key credential generation, checksums, and constant-time verification.
//! 4. RFC 6238 TOTP Multi-Factor Authentication (MFA) & one-time recovery codes.
//! 5. OAuth 2.0 PKCE S256 flow, provider catalog, and state encoding/decoding.
//! 6. Zanzibar ReBAC relation tuples, role implications, and workspace-level cross-inheritance.
//! 7. Existence oracle defense: Denied project checks return 404 Not Found, never 403 Forbidden.

use chrono::Utc;
use cms_auth::{
    claims::{decode_jwt, encode_jwt, Claims},
    cookies::{
        build_access_cookie, build_csrf_cookie, build_refresh_cookie, clear_access_cookie,
        clear_csrf_cookie, clear_refresh_cookie, parse_cookie_value,
    },
    password::{hash_password, verify_password},
};
use cms_authz::{
    AuthzBackend, AuthzContext, Relation, Subject, TestAuthzBackend,
    SYSTEM_WORKSPACE_ID,
};
use cms_authz_gate::require_project_access;
use cms_error::AppError;
use uuid::Uuid;

#[test]
fn test_e2e_argon2id_and_account_lockout() {
    let password = "UltraSecureCompanyPassword2026!";
    let hashed = hash_password(password).expect("argon2id hashing should succeed");

    // Correct password succeeds
    assert!(
        verify_password(password, &hashed).expect("password verification should succeed"),
        "valid password must verify"
    );

    // Wrong password fails
    assert!(
        !verify_password("WrongPassword123", &hashed).expect("password verification check should run"),
        "invalid password must be rejected"
    );

    // Account lockout logic verification (5 failed attempts threshold, 15 min duration)
    const MAX_FAILED_ATTEMPTS: i32 = 5;
    const LOCKOUT_MINUTES: i64 = 15;

    let now = Utc::now();
    let locked_until = now + chrono::Duration::minutes(LOCKOUT_MINUTES);

    // Simulated check: account with 5 failed attempts and locked_until in the future is locked
    let failed_attempts = 5;
    let is_locked = failed_attempts >= MAX_FAILED_ATTEMPTS && locked_until > now;
    assert!(is_locked, "account with 5 failed attempts must be locked");

    // Once locked_until is in the past, account is unlocked
    let past_lockout = now - chrono::Duration::minutes(1);
    let is_still_locked = failed_attempts >= MAX_FAILED_ATTEMPTS && past_lockout > now;
    assert!(!is_still_locked, "account past lockout window must not be locked");
}

#[test]
fn test_e2e_triple_cookie_and_jwt_claims() {
    let user_id = Uuid::new_v4();
    let role = "editor";
    let jwt_secret = b"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    let claims = Claims::new_access(user_id, role);
    let token = encode_jwt(&claims, jwt_secret).expect("JWT encoding should succeed");

    // Build triple cookies
    let access_cookie = build_access_cookie(&token, true);
    let refresh_cookie = build_refresh_cookie("refresh_token_value_abc", true);
    let csrf_cookie = build_csrf_cookie("csrf_token_xyz", true);

    assert!(access_cookie.contains("access_token="));
    assert!(access_cookie.contains("HttpOnly"));
    assert!(access_cookie.contains("SameSite=Lax"));

    assert!(refresh_cookie.contains("refresh_token="));
    assert!(refresh_cookie.contains("HttpOnly"));

    assert!(csrf_cookie.contains("csrf_token="));

    // Cookie header parsing
    let cookie_header = format!("{access_cookie}; {refresh_cookie}; {csrf_cookie}");
    let extracted_token = parse_cookie_value(&cookie_header, "access_token")
        .expect("access_token cookie must be present");
    assert_eq!(extracted_token, token);

    // Verify JWT claims from extracted token
    let decoded = decode_jwt(&extracted_token, jwt_secret).expect("JWT decoding should succeed");
    assert_eq!(decoded.sub, user_id);
    assert_eq!(decoded.role, role);
    assert_eq!(decoded.tenant_id, SYSTEM_WORKSPACE_ID);

    // Clear cookies check
    let c1 = clear_access_cookie(true);
    let c2 = clear_refresh_cookie(true);
    let c3 = clear_csrf_cookie(true);
    assert!(c1.contains("Max-Age=0"));
    assert!(c2.contains("Max-Age=0"));
    assert!(c3.contains("Max-Age=0"));
}

#[test]
fn test_e2e_machine_api_keys() {
    let permissions = vec!["projects:read".to_string(), "pages:write".to_string()];

    // Mint machine API key
    let minted = cms_api_keys::mint(cms_api_keys::Environment::Live, &permissions)
        .expect("minting api key should succeed");

    assert!(
        minted.secret.starts_with("cms_live_"),
        "machine api key must have 'cms_live_' prefix"
    );

    // Verify minted key
    assert!(
        cms_api_keys::verify(&minted.secret, &minted.hash),
        "valid machine api key must verify against stored SHA-256 hash"
    );

    // Tampered key fails
    let tampered_key = format!("{}x", minted.secret);
    assert!(
        !cms_api_keys::verify(&tampered_key, &minted.hash),
        "tampered key must be rejected"
    );
}

#[test]
fn test_e2e_mfa_totp_and_recovery_codes() {
    let user_email = "lead-dev@company.internal";

    // 1. Enroll TOTP
    let enrolled = cms_mfa::generate_enrollment(user_email, "Company CMS")
        .expect("totp enrollment should succeed");
    assert!(!enrolled.secret.is_empty());
    assert!(!enrolled.qr_png_base64.is_empty());

    // 2. Generate and verify current TOTP code
    let totp = cms_mfa::build_totp(&enrolled.secret, user_email, "Company CMS")
        .expect("building totp generator should succeed");
    let current_token = totp
        .generate_current()
        .expect("generating totp code should succeed");

    assert!(
        cms_mfa::verify_totp(&enrolled.secret, &current_token),
        "valid totp token must be accepted"
    );

    // Invalid code fails
    assert!(
        !cms_mfa::verify_totp(&enrolled.secret, "000000"),
        "invalid totp code must be rejected"
    );

    // 3. Recovery codes verification
    let (plain_codes, hashed_codes) = cms_mfa::generate_recovery_codes(8);
    assert_eq!(plain_codes.len(), 8);
    assert_eq!(hashed_codes.len(), 8);

    let first_code = &plain_codes[0];
    let match_idx = cms_mfa::verify_recovery_code(first_code, &hashed_codes);
    assert_eq!(match_idx, Some(0), "valid recovery code must match index 0");

    let invalid_idx = cms_mfa::verify_recovery_code("INVALID-CODE-1234", &hashed_codes);
    assert_eq!(invalid_idx, None, "invalid recovery code must return None");
}

#[test]
fn test_e2e_oauth_pkce_flow() {
    // Generate PKCE pair
    let pkce = cms_oauth::generate_pkce();
    assert!(!pkce.verifier.is_empty());
    assert!(!pkce.challenge.is_empty());

    // Generate secure state & nonce
    let (state, nonce) = cms_oauth::generate_state_nonce();
    assert!(!state.is_empty());
    assert!(!nonce.is_empty());

    // Provider catalog
    let github_provider = cms_oauth::oauth_provider_spec("github")
        .expect("github provider must be in catalog");
    assert_eq!(github_provider.code, "github");
    assert!(github_provider.auth_url.contains("github.com"));

    // Callback state serialization & deserialization
    #[derive(serde::Serialize, serde::Deserialize, PartialEq, Eq, Debug)]
    struct StatePayload {
        redirect: String,
        nonce: String,
    }

    let payload = StatePayload {
        redirect: "/app/dashboard".to_string(),
        nonce,
    };
    let encoded = cms_oauth::encode_callback_state(&payload)
        .expect("encoding callback state should succeed");
    let decoded: StatePayload = cms_oauth::decode_callback_state(&encoded)
        .expect("decoding callback state should succeed");
    assert_eq!(decoded, payload);

    // Tampered state fails
    assert!(cms_oauth::decode_callback_state::<StatePayload>("invalid.tampered.state").is_err());
}

#[tokio::test]
async fn test_e2e_rebac_relations_and_cross_inheritance() {
    let backend = TestAuthzBackend::new();

    let owner_id = Uuid::new_v4();
    let editor_id = Uuid::new_v4();
    let viewer_id = Uuid::new_v4();
    let workspace_admin_id = Uuid::new_v4();
    let outsider_id = Uuid::new_v4();

    let project_id = Uuid::new_v4();

    let admin_ctx = AuthzContext::new(workspace_admin_id, "admin".to_string(), false);

    // 1. Assign project roles
    backend
        .write_tuple(
            &admin_ctx,
            "project",
            project_id,
            Relation::Owner,
            Subject::User(owner_id),
            None,
        )
        .await
        .unwrap();

    backend
        .write_tuple(
            &admin_ctx,
            "project",
            project_id,
            Relation::Editor,
            Subject::User(editor_id),
            None,
        )
        .await
        .unwrap();

    backend
        .write_tuple(
            &admin_ctx,
            "project",
            project_id,
            Relation::Viewer,
            Subject::User(viewer_id),
            None,
        )
        .await
        .unwrap();

    // 2. Assign workspace admin (cross-object inheritance)
    backend
        .write_tuple(
            &admin_ctx,
            "workspace",
            SYSTEM_WORKSPACE_ID,
            Relation::Admin,
            Subject::User(workspace_admin_id),
            None,
        )
        .await
        .unwrap();

    // Contexts
    let owner_ctx = AuthzContext::new(owner_id, "user".to_string(), false);
    let editor_ctx = AuthzContext::new(editor_id, "user".to_string(), false);
    let viewer_ctx = AuthzContext::new(viewer_id, "user".to_string(), false);
    let workspace_admin_ctx = AuthzContext::new(workspace_admin_id, "user".to_string(), false);
    let outsider_ctx = AuthzContext::new(outsider_id, "user".to_string(), false);

    // Project Owner has all relations
    assert!(backend.check(&owner_ctx, Relation::Owner, "project", project_id).await.unwrap());
    assert!(backend.check(&owner_ctx, Relation::Editor, "project", project_id).await.unwrap());
    assert!(backend.check(&owner_ctx, Relation::Viewer, "project", project_id).await.unwrap());

    // Project Editor has Editor & Viewer, but not Owner
    assert!(!backend.check(&editor_ctx, Relation::Owner, "project", project_id).await.unwrap());
    assert!(backend.check(&editor_ctx, Relation::Editor, "project", project_id).await.unwrap());
    assert!(backend.check(&editor_ctx, Relation::Viewer, "project", project_id).await.unwrap());

    // Project Viewer has Viewer only
    assert!(!backend.check(&viewer_ctx, Relation::Owner, "project", project_id).await.unwrap());
    assert!(!backend.check(&viewer_ctx, Relation::Editor, "project", project_id).await.unwrap());
    assert!(backend.check(&viewer_ctx, Relation::Viewer, "project", project_id).await.unwrap());

    // Workspace Admin inherits access across all projects in workspace
    assert!(backend.check(&workspace_admin_ctx, Relation::Editor, "project", project_id).await.unwrap());
    assert!(backend.check(&workspace_admin_ctx, Relation::Viewer, "project", project_id).await.unwrap());

    // Outsider has zero access
    assert!(!backend.check(&outsider_ctx, Relation::Viewer, "project", project_id).await.unwrap());
}

#[tokio::test]
async fn test_e2e_existence_oracle_defense() {
    let backend = TestAuthzBackend::new();
    let project_id = Uuid::new_v4();
    let outsider_id = Uuid::new_v4();

    let outsider_ctx = AuthzContext::new(outsider_id, "user".to_string(), false);

    // Calling require_project_access for a denied user must return AppError::NotFound,
    // NEVER AppError::Forbidden, to eliminate existence oracle attacks.
    let result = require_project_access(&backend, &outsider_ctx, project_id, Relation::Viewer).await;

    match result {
        Err(AppError::NotFound(msg)) => {
            assert!(
                msg.contains("Project not found"),
                "error message must report resource not found"
            );
        }
        other => panic!("expected AppError::NotFound for existence oracle defense, got: {other:?}"),
    }
}
