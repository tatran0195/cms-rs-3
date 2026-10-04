//! OAuth provider integration and callback state helpers.

use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::json;

/// Base64-URL without padding — used for the state round-trip.
pub fn b64url_encode(data: &[u8]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(data)
}

/// Base64-URL decoding without padding.
pub fn b64url_decode(s: &str) -> Option<Vec<u8>> {
    base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(s)
        .ok()
}

/// Encode the SPA `callbackURL` into the OAuth `state` parameter so the callback
/// can recover it after provider roundtrip.
pub fn encode_callback_state(callback_url: &str) -> String {
    let payload = json!({ "cb": callback_url });
    b64url_encode(payload.to_string().as_bytes())
}

/// Recover the SPA `callbackURL` from the OAuth `state` parameter.
pub fn decode_callback_state(state: &str) -> Option<String> {
    let bytes = b64url_decode(state)?;
    let s = String::from_utf8(bytes).ok()?;
    let v: serde_json::Value = serde_json::from_str(&s).ok()?;
    v.get("cb").and_then(|c| c.as_str()).map(String::from)
}

/// Supported OAuth providers
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OAuthProvider {
    Google,
    GitHub,
}

impl OAuthProvider {
    pub fn parse(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "google" => Some(Self::Google),
            "github" => Some(Self::GitHub),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Google => "google",
            Self::GitHub => "github",
        }
    }

    pub fn authorization_url(&self, client_id: &str, redirect_uri: &str, state: &str) -> String {
        match self {
            Self::Google => format!(
                "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope=openid%20email%20profile&state={}",
                client_id, redirect_uri, state
            ),
            Self::GitHub => format!(
                "https://github.com/login/oauth/authorize?client_id={}&redirect_uri={}&scope=read:user%20user:email&state={}",
                client_id, redirect_uri, state
            ),
        }
    }

    pub fn token_url(&self) -> &'static str {
        match self {
            Self::Google => "https://oauth2.googleapis.com/token",
            Self::GitHub => "https://github.com/login/oauth/access_token",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_callback_state_roundtrip() {
        let original = "/app/projects/test-proj/editor";
        let state = encode_callback_state(original);
        assert!(!state.is_empty());
        let recovered = decode_callback_state(&state).expect("state should decode");
        assert_eq!(recovered, original);
    }

    #[test]
    fn test_invalid_callback_state() {
        assert!(decode_callback_state("invalid-base64-!@#$%").is_none());
        assert!(decode_callback_state("").is_none());
    }

    #[test]
    fn test_provider_authorization_urls() {
        let google = OAuthProvider::Google;
        let url = google.authorization_url("client123", "https://example.com/callback", "stateXYZ");
        assert!(url.contains("client_id=client123"));
        assert!(url.contains("state=stateXYZ"));
        assert!(url.contains("accounts.google.com"));

        let github = OAuthProvider::GitHub;
        let gh_url = github.authorization_url("gh123", "https://example.com/callback", "stateXYZ");
        assert!(gh_url.contains("client_id=gh123"));
        assert!(gh_url.contains("github.com/login/oauth/authorize"));
    }
}
