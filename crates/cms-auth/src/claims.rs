#![forbid(unsafe_code)]

//! JWT `Claims` and encoding/decoding utilities ported from MedBrains.

use chrono::Utc;
use cms_authz::SYSTEM_WORKSPACE_ID;
use cms_error::AppError;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// JWT claims embedded in every authenticated request.
///
/// Follows the MedBrains pattern:
/// - `permissions` is serialized by default as empty or populated post-decode.
///   (skip_serializing keeps the cookie size small, <4KB).
/// - `sub` identifies the user ID.
/// - `tenant_id` identifies the company workspace (`SYSTEM_WORKSPACE_ID`).
/// - `role` is the system or workspace role.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct Claims {
    pub sub: Uuid,
    pub tenant_id: Uuid,
    pub role: String,
    #[serde(skip_serializing, default)]
    pub permissions: Vec<String>,
    pub exp: usize,
}

impl Claims {
    #[must_use]
    pub fn new(sub: Uuid, role: impl Into<String>, exp: usize) -> Self {
        Self {
            sub,
            tenant_id: SYSTEM_WORKSPACE_ID,
            role: role.into(),
            permissions: Vec::new(),
            exp,
        }
    }

    /// Convenience helper to create a 15-minute access token claim.
    #[must_use]
    pub fn new_access(sub: Uuid, role: impl Into<String>) -> Self {
        let exp = (Utc::now() + chrono::Duration::minutes(15)).timestamp() as usize;
        Self::new(sub, role, exp)
    }

    /// Return user ID as string for compatibility.
    #[must_use]
    pub fn user_id_string(&self) -> String {
        self.sub.to_string()
    }
}

/// Encode `Claims` using HS256 and the provided secret.
pub fn encode_jwt(claims: &Claims, secret: &[u8]) -> Result<String, AppError> {
    let header = Header::default();
    let encoding_key = EncodingKey::from_secret(secret);
    encode(&header, claims, &encoding_key)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("JWT encode error: {e}")))
}

/// Decode and validate `Claims` using HS256 and the provided secret.
pub fn decode_jwt(token: &str, secret: &[u8]) -> Result<Claims, AppError> {
    let mut validation = Validation::default();
    validation.validate_exp = true;
    let decoding_key = DecodingKey::from_secret(secret);
    let token_data = decode::<Claims>(token, &decoding_key, &validation)
        .map_err(|e| {
            tracing::debug!("JWT decode error: {e}");
            AppError::Unauthorized
        })?;
    Ok(token_data.claims)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_claims_jwt_roundtrip() {
        let secret = b"super_secret_signing_key_at_least_32_bytes_long!!";
        let sub = Uuid::new_v4();
        let claims = Claims::new_access(sub, "admin");

        let token = encode_jwt(&claims, secret).expect("Encoding should succeed");
        let decoded = decode_jwt(&token, secret).expect("Decoding should succeed");

        assert_eq!(decoded.sub, sub);
        assert_eq!(decoded.role, "admin");
        assert_eq!(decoded.tenant_id, SYSTEM_WORKSPACE_ID);
        // permissions are skipped during serialization
        assert!(decoded.permissions.is_empty());
    }

    #[test]
    fn test_claims_expired_token_fails() {
        let secret = b"super_secret_signing_key_at_least_32_bytes_long!!";
        let sub = Uuid::new_v4();
        let past_exp = (Utc::now() - chrono::Duration::hours(1)).timestamp() as usize;
        let claims = Claims::new(sub, "viewer", past_exp);

        let token = encode_jwt(&claims, secret).expect("Encoding should succeed");
        let decoded = decode_jwt(&token, secret);

        assert!(matches!(decoded, Err(AppError::Unauthorized)));
    }
}
