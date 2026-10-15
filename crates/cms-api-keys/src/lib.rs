#![forbid(unsafe_code)]

//! Machine credentials for the API.
//!
//! A key is not a user. It carries an explicit list of permissions and no
//! role, so it cannot widen when a role does, and a leaked key exposes exactly
//! what it was granted rather than everything its creator could do.
//!
//! The minting and verification logic lives here, pure, with no database and
//! no web framework — so the properties that matter are settled by tests
//! rather than by reading a handler.

use std::fmt;

use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use thiserror::Error;

/// Marks a key as belonging to this system, and which environment it is for.
pub const LIVE_PREFIX: &str = "cms_live_";
pub const TEST_PREFIX: &str = "cms_test_";

/// 32 bytes of cryptographically secure random entropy.
const SECRET_BYTES: usize = 32;

/// How much of the key is stored in the clear so a console can identify it.
const VISIBLE_CHARS: usize = 12;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Environment {
    Live,
    Test,
}

impl Environment {
    #[must_use]
    pub const fn prefix(self) -> &'static str {
        match self {
            Self::Live => LIVE_PREFIX,
            Self::Test => TEST_PREFIX,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum KeyError {
    #[error("an API key must carry at least one permission")]
    NoPermissions,

    /// A key that can do anything is a key that should not exist.
    #[error("'{0}' cannot be granted to an API key — it bypasses permission checks entirely")]
    BypassPermission(String),

    #[error("this does not look like an API key")]
    Malformed,

    #[error("could not generate a key: {0}")]
    Random(String),
}

/// Permission codes that must never appear on a key.
const NEVER_ON_A_KEY: &[&str] = &[
    "*",
    "admin.*",
    "super_admin",
    "workspace.owner",
    "workspace.admin",
];

/// A freshly minted key. The secret exists only here and is never stored.
#[derive(Clone)]
pub struct MintedKey {
    /// Shown to the creator once.
    pub secret: String,
    /// Stored in the clear, for display.
    pub prefix: String,
    /// Stored SHA-256 fingerprint hash.
    pub hash: String,
}

impl fmt::Debug for MintedKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("MintedKey")
            .field("prefix", &self.prefix)
            .field("secret", &"<redacted>")
            .field("hash", &"<redacted>")
            .finish()
    }
}

/// Mint a key for a set of permissions.
pub fn mint(environment: Environment, permissions: &[String]) -> Result<MintedKey, KeyError> {
    if permissions.is_empty() {
        return Err(KeyError::NoPermissions);
    }
    for permission in permissions {
        let code = permission.trim();
        if NEVER_ON_A_KEY.contains(&code) || code.ends_with(".*") {
            return Err(KeyError::BypassPermission(code.to_owned()));
        }
    }

    let mut bytes = [0_u8; SECRET_BYTES];
    getrandom::fill(&mut bytes).map_err(|error| KeyError::Random(error.to_string()))?;

    let secret = format!("{}{}", environment.prefix(), hex::encode(bytes));
    let prefix: String = secret.chars().take(VISIBLE_CHARS).collect();
    let hash = fingerprint(&secret);

    Ok(MintedKey {
        secret,
        prefix,
        hash,
    })
}

/// The stored form of a key (SHA-256 fingerprint).
#[must_use]
pub fn fingerprint(secret: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(secret.as_bytes());
    hex::encode(hasher.finalize())
}

/// Whether a presented key matches a stored fingerprint in constant time.
#[must_use]
pub fn verify(presented: &str, stored_hash: &str) -> bool {
    if !looks_like_key(presented) {
        return false;
    }
    let computed = fingerprint(presented);
    computed.as_bytes().ct_eq(stored_hash.as_bytes()).into()
}

/// Fast syntactic shape check before computing hash.
#[must_use]
pub fn looks_like_key(candidate: &str) -> bool {
    let Some(body) = candidate
        .strip_prefix(LIVE_PREFIX)
        .or_else(|| candidate.strip_prefix(TEST_PREFIX))
    else {
        return false;
    };
    body.len() == SECRET_BYTES * 2 && body.chars().all(|c| c.is_ascii_hexdigit())
}

/// The visible prefix of a key for display.
pub fn prefix_of(secret: &str) -> Result<String, KeyError> {
    if !looks_like_key(secret) {
        return Err(KeyError::Malformed);
    }
    Ok(secret.chars().take(VISIBLE_CHARS).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mint_and_verify_key() {
        let perms = vec!["project.view".to_string()];
        let key = mint(Environment::Live, &perms).expect("mint should succeed");
        assert!(key.secret.starts_with(LIVE_PREFIX));
        assert_eq!(key.prefix.len(), 12);
        assert!(verify(&key.secret, &key.hash));
        assert!(!verify("invalid_secret", &key.hash));
    }

    #[test]
    fn test_rejects_empty_and_bypass_permissions() {
        assert!(matches!(
            mint(Environment::Live, &[]),
            Err(KeyError::NoPermissions)
        ));
        assert!(matches!(
            mint(Environment::Live, &["*".to_string()]),
            Err(KeyError::BypassPermission(_))
        ));
        assert!(matches!(
            mint(Environment::Live, &["project.*".to_string()]),
            Err(KeyError::BypassPermission(_))
        ));
    }

    #[test]
    fn test_test_environment_prefix() {
        let key = mint(Environment::Test, &["docs.read".to_string()]).unwrap();
        assert!(key.secret.starts_with(TEST_PREFIX));
        assert!(verify(&key.secret, &key.hash));
    }
}
