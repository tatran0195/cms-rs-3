#![forbid(unsafe_code)]

//! Password hashing and verification using Argon2id.

use argon2::{
    password_hash::{phc::PasswordHash, PasswordHasher, PasswordVerifier},
    Argon2,
};
use cms_error::AppError;

/// Hash a password using Argon2id.
pub fn hash_password(password: &str) -> Result<String, AppError> {
    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(password.as_bytes())
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Password hashing failed: {e}")))?;
    Ok(hash.to_string())
}

/// Verify a password against an Argon2id hash string.
pub fn verify_password(password: &str, hash: &str) -> Result<bool, AppError> {
    let parsed_hash = PasswordHash::new(hash)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Invalid password hash: {e}")))?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_password_hashing_and_verification() {
        let password = "CorrectHorseBatteryStaple!2026";
        let hash = hash_password(password).expect("Hashing should succeed");

        assert!(hash.starts_with("$argon2id$"));
        assert!(verify_password(password, &hash).unwrap());
        assert!(!verify_password("WrongPassword!", &hash).unwrap());
    }
}
