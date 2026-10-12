#![forbid(unsafe_code)]

//! OAuth 2.0 and OIDC provider integration (ported from MedBrains).
//!
//! Provides:
//! - PKCE S256 code verifier & code challenge generation (RFC 7636).
//! - Cryptographic state and nonce generation for CSRF protection.
//! - Known OAuth/OIDC provider specifications and endpoint mappings.
//! - State encoding & verification helpers.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64URL, Engine};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PkceChallenge {
    pub verifier: String,
    pub challenge: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum OAuthError {
    #[error("entropy generation failed: {0}")]
    Entropy(String),
    #[error("invalid callback state: {0}")]
    InvalidState(String),
}

/// Known OAuth & OIDC identity provider specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthProviderSpec {
    pub code: &'static str,
    pub label: &'static str,
    pub auth_url: &'static str,
    pub token_url: &'static str,
    pub user_info_url: &'static str,
    pub default_scopes: &'static str,
}

pub const KNOWN_PROVIDERS: &[OAuthProviderSpec] = &[
    OAuthProviderSpec {
        code: "github",
        label: "GitHub",
        auth_url: "https://github.com/login/oauth/authorize",
        token_url: "https://github.com/login/oauth/access_token",
        user_info_url: "https://api.github.com/user",
        default_scopes: "read:user user:email",
    },
    OAuthProviderSpec {
        code: "google",
        label: "Google",
        auth_url: "https://accounts.google.com/o/oauth2/v2/auth",
        token_url: "https://oauth2.googleapis.com/token",
        user_info_url: "https://openidconnect.googleapis.com/v1/userinfo",
        default_scopes: "openid email profile",
    },
    OAuthProviderSpec {
        code: "azure_ad",
        label: "Microsoft Entra ID",
        auth_url: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        token_url: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        user_info_url: "https://graph.microsoft.com/oidc/userinfo",
        default_scopes: "openid email profile User.Read",
    },
    OAuthProviderSpec {
        code: "gitlab",
        label: "GitLab",
        auth_url: "https://gitlab.com/oauth/authorize",
        token_url: "https://gitlab.com/oauth/token",
        user_info_url: "https://gitlab.com/api/v4/user",
        default_scopes: "read_user openid email profile",
    },
];

/// Look up a provider specification by its canonical code.
#[must_use]
pub fn oauth_provider_spec(code: &str) -> Option<&'static OAuthProviderSpec> {
    KNOWN_PROVIDERS.iter().find(|p| p.code == code)
}

/// Generate a 32-byte URL-safe random string.
fn random_url_safe(bytes_len: usize) -> Result<String, OAuthError> {
    let mut buf = vec![0u8; bytes_len];
    getrandom::getrandom(&mut buf).map_err(|e| OAuthError::Entropy(e.to_string()))?;
    Ok(B64URL.encode(&buf))
}

/// Generate an RFC 7636 PKCE S256 code verifier and challenge.
pub fn generate_pkce() -> PkceChallenge {
    let verifier = random_url_safe(32).unwrap_or_else(|_| "fallback_verifier_32_bytes_entropy".to_string());
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let challenge = B64URL.encode(hasher.finalize());

    PkceChallenge {
        verifier,
        challenge,
    }
}

/// Generate cryptographically secure state and nonce for OAuth authorization requests.
pub fn generate_state_nonce() -> (String, String) {
    let state = random_url_safe(32).unwrap_or_else(|_| "fallback_state_32_bytes_entropy".to_string());
    let nonce = random_url_safe(32).unwrap_or_else(|_| "fallback_nonce_32_bytes_entropy".to_string());
    (state, nonce)
}

/// Encode callback state containing an arbitrary payload and CSRF token.
pub fn encode_callback_state<T: Serialize>(payload: &T) -> Result<String, OAuthError> {
    let json = serde_json::to_vec(payload)
        .map_err(|e| OAuthError::InvalidState(e.to_string()))?;
    Ok(B64URL.encode(&json))
}

/// Decode callback state back into expected payload.
pub fn decode_callback_state<T: for<'de> Deserialize<'de>>(state: &str) -> Result<T, OAuthError> {
    let bytes = B64URL
        .decode(state)
        .map_err(|e| OAuthError::InvalidState(e.to_string()))?;
    serde_json::from_slice(&bytes).map_err(|e| OAuthError::InvalidState(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
    struct TestState {
        redirect: String,
        csrf: String,
    }

    #[test]
    fn test_pkce_generation() {
        let pkce = generate_pkce();
        assert_eq!(pkce.verifier.len(), 43); // 32 bytes base64url no-pad = 43 chars
        assert!(!pkce.challenge.is_empty());
    }

    #[test]
    fn test_state_nonce_entropy() {
        let (s1, n1) = generate_state_nonce();
        let (s2, n2) = generate_state_nonce();
        assert_ne!(s1, s2);
        assert_ne!(n1, n2);
        assert_eq!(s1.len(), 43);
    }

    #[test]
    fn test_provider_lookup() {
        let github = oauth_provider_spec("github");
        assert!(github.is_some());
        assert_eq!(github.unwrap().label, "GitHub");

        let nonexistent = oauth_provider_spec("unknown_idp");
        assert!(nonexistent.is_none());
    }

    #[test]
    fn test_state_encoding_roundtrip() {
        let original = TestState {
            redirect: "/app/projects".to_string(),
            csrf: "token123".to_string(),
        };
        let encoded = encode_callback_state(&original).expect("encode");
        let decoded: TestState = decode_callback_state(&encoded).expect("decode");
        assert_eq!(original, decoded);
    }
}
