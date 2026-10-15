#![forbid(unsafe_code)]

//! TOTP multi-factor authentication (ported from MedBrains).
//!
//! Provides:
//! - TOTP enrollment: secret generation, otpauth URI, and QR PNG in base64.
//! - Code verification: checking current 6-digit TOTP code.
//! - Single-use recovery codes: SHA-256 hashed storage, constant-time verification.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use thiserror::Error;
use totp_rs::{Algorithm, Secret, Totp};

pub const DEFAULT_RECOVERY_CODE_COUNT: usize = 8;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MfaEnrollment {
    pub secret: String,
    pub otpauth_uri: String,
    pub qr_png_base64: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum MfaError {
    #[error("failed to generate random secret: {0}")]
    Entropy(String),
    #[error("failed to construct TOTP: {0}")]
    Build(String),
}

/// Construct a TOTP generator for an account and issuer.
pub fn build_totp(secret_b32: &str, account: &str, issuer: &str) -> Result<Totp, MfaError> {
    let secret = Secret::try_from_base32(secret_b32)
        .map_err(|e| MfaError::Build(format!("secret decode: {e:?}")))?;
    totp_rs::Builder::new()
        .with_algorithm(Algorithm::SHA1)
        .with_digits(6)
        .with_skew(1)
        .with_step_duration(30)
        .with_secret(secret)
        .with_issuer(Some(issuer.to_owned()))
        .with_account_name(account.to_owned())
        .build()
        .map_err(|e| MfaError::Build(e.to_string()))
}

/// Generate a new MFA enrollment bundle (base32 secret, otpauth URI, QR PNG base64).
pub fn generate_enrollment(account: &str, issuer: &str) -> Result<MfaEnrollment, MfaError> {
    let mut raw_bytes = [0u8; 20];
    getrandom::fill(&mut raw_bytes).map_err(|e| MfaError::Entropy(e.to_string()))?;
    let secret_b32 = Secret::new_stack(raw_bytes).to_base32();

    let totp = build_totp(&secret_b32, account, issuer)?;
    let otpauth_uri = totp.to_url().map_err(|e| MfaError::Build(e.to_string()))?;
    let qr_png_base64 = totp
        .to_qr_base64()
        .map_err(|e| MfaError::Build(format!("qr generate: {e:?}")))?;

    Ok(MfaEnrollment {
        secret: secret_b32,
        otpauth_uri,
        qr_png_base64,
    })
}

/// Verify a 6-digit TOTP code against a base32 secret.
#[must_use]
pub fn verify_totp(secret_b32: &str, code: &str) -> bool {
    if code.len() != 6 || !code.chars().all(|c| c.is_ascii_digit()) {
        return false;
    }
    let Ok(totp) = build_totp(secret_b32, "verify", "verify") else {
        return false;
    };
    totp.check_current(code).is_some()
}

/// SHA-256 hash of a single recovery code.
#[must_use]
pub fn hash_recovery_code(code: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(code.trim().as_bytes());
    hex::encode(hasher.finalize())
}

/// Generate `count` plaintext recovery codes and their stored SHA-256 hashes.
pub fn generate_recovery_codes(count: usize) -> (Vec<String>, Vec<String>) {
    let mut plain = Vec::with_capacity(count);
    let mut hashes = Vec::with_capacity(count);

    for _ in 0..count {
        let mut buf = [0u8; 8];
        let _ = getrandom::fill(&mut buf);
        let code = format!("{}-{}", hex::encode(&buf[..4]), hex::encode(&buf[4..]));
        hashes.push(hash_recovery_code(&code));
        plain.push(code);
    }

    (plain, hashes)
}

/// Verify a presented recovery code against a list of stored hashes in constant time.
/// Returns the index of the matching hash if found (so it can be consumed/removed).
#[must_use]
pub fn verify_recovery_code(code: &str, stored_hashes: &[String]) -> Option<usize> {
    let computed_hash = hash_recovery_code(code);
    let mut matched_idx = None;

    for (idx, stored) in stored_hashes.iter().enumerate() {
        if computed_hash.as_bytes().ct_eq(stored.as_bytes()).into() {
            matched_idx = Some(idx);
            break;
        }
    }

    matched_idx
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mfa_enrollment_and_totp_generation() {
        let enrollment = generate_enrollment("admin@company.internal", "CMS").expect("enrollment");
        assert!(!enrollment.secret.is_empty());
        assert!(enrollment.otpauth_uri.contains("secret="));
        assert!(enrollment.otpauth_uri.contains("issuer=CMS"));
        assert!(!enrollment.qr_png_base64.is_empty());

        let totp = build_totp(&enrollment.secret, "admin@company.internal", "CMS").unwrap();
        let current_code = totp.generate_current().to_string();
        assert!(verify_totp(&enrollment.secret, &current_code));
        assert!(!verify_totp(&enrollment.secret, "000000"));
    }

    #[test]
    fn test_recovery_codes() {
        let (plain, hashes) = generate_recovery_codes(8);
        assert_eq!(plain.len(), 8);
        assert_eq!(hashes.len(), 8);

        // Verify matches exact index
        assert_eq!(verify_recovery_code(&plain[3], &hashes), Some(3));
        assert_eq!(verify_recovery_code("invalid-code", &hashes), None);
    }
}
