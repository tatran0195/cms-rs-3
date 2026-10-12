//! Integration tests for Multi-Factor Authentication (MFA) & Login Challenge

use cms_entity::auth::{
    MfaChallengePayload, MfaDisablePayload, MfaSetupResponse, MfaVerifyPayload,
};

#[test]
fn test_mfa_payload_serialization_camel_case() {
    let setup_resp = MfaSetupResponse {
        secret: "JBSWY3DPEHPK3PXP".to_string(),
        otpauth_uri: "otpauth://totp/Company%20CMS:test%40example.com?secret=JBSWY3DPEHPK3PXP".to_string(),
        qr_png_base64: "iVBORw0KGgoAAAANSUhEUgAA...".to_string(),
        recovery_codes: vec!["abcd-1234".to_string(), "ef01-5678".to_string()],
    };

    let json = serde_json::to_value(&setup_resp).expect("serialize setup response");
    assert_eq!(json["otpauthUri"], "otpauth://totp/Company%20CMS:test%40example.com?secret=JBSWY3DPEHPK3PXP");
    assert_eq!(json["qrPngBase64"], "iVBORw0KGgoAAAANSUhEUgAA...");
    assert_eq!(json["recoveryCodes"].as_array().unwrap().len(), 2);

    let verify_payload: MfaVerifyPayload = serde_json::from_str(
        r#"{ "code": "123456", "secret": "JBSWY3DPEHPK3PXP", "recoveryCodes": ["abcd-1234"] }"#,
    )
    .expect("deserialize verify payload");
    assert_eq!(verify_payload.code, "123456");
    assert_eq!(verify_payload.recovery_codes.len(), 1);

    let disable_payload: MfaDisablePayload =
        serde_json::from_str(r#"{ "code": "123456" }"#).expect("deserialize disable payload");
    assert_eq!(disable_payload.code, "123456");

    let challenge_payload: MfaChallengePayload = serde_json::from_str(
        r#"{ "email": "admin@company.internal", "code": "abcd-1234", "isRecoveryCode": true }"#,
    )
    .expect("deserialize challenge payload");
    assert_eq!(challenge_payload.email, "admin@company.internal");
    assert_eq!(challenge_payload.code, "abcd-1234");
    assert!(challenge_payload.is_recovery_code);
}

#[test]
fn test_mfa_totp_and_recovery_verification_logic() {
    let enrollment = cms_mfa::generate_enrollment("user@company.internal", "Company CMS")
        .expect("enrollment should succeed");

    assert!(!enrollment.secret.is_empty());
    assert!(enrollment.otpauth_uri.starts_with("otpauth://totp/"));

    // Build TOTP to generate current code
    let totp = cms_mfa::build_totp(&enrollment.secret, "user@company.internal", "Company CMS")
        .expect("totp build");
    let current_code = totp.generate_current().expect("generate code");

    // Verification check
    assert!(cms_mfa::verify_totp(&enrollment.secret, &current_code));
    assert!(!cms_mfa::verify_totp(&enrollment.secret, "999999"));
    assert!(!cms_mfa::verify_totp(&enrollment.secret, "abc"));

    // Recovery code generation & single-use verification
    let (plain_codes, hashed_codes) = cms_mfa::generate_recovery_codes(8);
    assert_eq!(plain_codes.len(), 8);
    assert_eq!(hashed_codes.len(), 8);

    // Verify first recovery code
    let first_code = &plain_codes[0];
    let match_idx = cms_mfa::verify_recovery_code(first_code, &hashed_codes);
    assert_eq!(match_idx, Some(0));

    // Consuming the code: remove from hashes
    let mut remaining_hashes = hashed_codes.clone();
    remaining_hashes.remove(0);

    // Now first code fails
    assert_eq!(cms_mfa::verify_recovery_code(first_code, &remaining_hashes), None);

    // Next code still succeeds
    let second_code = &plain_codes[1];
    let second_match_idx = cms_mfa::verify_recovery_code(second_code, &remaining_hashes);
    assert_eq!(second_match_idx, Some(0)); // Now index 0 in the remaining list
}
