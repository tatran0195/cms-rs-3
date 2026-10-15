#![forbid(unsafe_code)]

//! Triple-cookie architecture ported from MedBrains.
//!
//! Provides:
//! - `access_token`: 15-minute HttpOnly cookie scoped to `/api`.
//! - `refresh_token`: 7-day HttpOnly cookie scoped to `/api/auth`.
//! - `csrf_token`: 15-minute non-HttpOnly cookie for double-submit CSRF protection.

use cms_error::AppError;

/// Build the `access_token` Set-Cookie header value.
#[must_use]
pub fn build_access_cookie(token: &str, secure: bool) -> String {
    let secure_flag = if secure { "; Secure" } else { "" };
    format!("access_token={token}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=900{secure_flag}")
}

/// Build the `refresh_token` Set-Cookie header value.
#[must_use]
pub fn build_refresh_cookie(token: &str, secure: bool) -> String {
    let secure_flag = if secure { "; Secure" } else { "" };
    format!(
        "refresh_token={token}; Path=/api/auth; HttpOnly; SameSite=Lax; \
         Max-Age=604800{secure_flag}"
    )
}

/// Build the `csrf_token` Set-Cookie header value (readable by JavaScript).
#[must_use]
pub fn build_csrf_cookie(token: &str, secure: bool) -> String {
    let secure_flag = if secure { "; Secure" } else { "" };
    format!("csrf_token={token}; Path=/; SameSite=Lax; Max-Age=900{secure_flag}")
}

/// Build Set-Cookie header value to clear the `access_token`.
#[must_use]
pub fn clear_access_cookie(secure: bool) -> String {
    let secure_flag = if secure { "; Secure" } else { "" };
    format!("access_token=; Path=/api; HttpOnly; SameSite=Lax; Max-Age=0{secure_flag}")
}

/// Build Set-Cookie header value to clear the `refresh_token`.
#[must_use]
pub fn clear_refresh_cookie(secure: bool) -> String {
    let secure_flag = if secure { "; Secure" } else { "" };
    format!("refresh_token=; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=0{secure_flag}")
}

/// Build Set-Cookie header value to clear the `csrf_token`.
#[must_use]
pub fn clear_csrf_cookie(secure: bool) -> String {
    let secure_flag = if secure { "; Secure" } else { "" };
    format!("csrf_token=; Path=/; SameSite=Lax; Max-Age=0{secure_flag}")
}

/// Parse a specific cookie value from a raw `Cookie` header string.
#[must_use]
pub fn parse_cookie_value<'a>(header: &'a str, name: &str) -> Option<&'a str> {
    for pair in header.split(';') {
        let trimmed = pair.trim();
        if let Some(val) = trimmed.strip_prefix(name) {
            if let Some(val) = val.strip_prefix('=') {
                return Some(val.trim());
            }
        }
    }
    None
}

/// Generate a cryptographically secure random CSRF token (32 bytes → 64 hex chars).
pub fn generate_csrf_token() -> Result<String, AppError> {
    let mut buf = [0u8; 32];
    getrandom::fill(&mut buf)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("CSRF token generation failed: {e}")))?;
    Ok(hex::encode(buf))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cookie_building_and_clearing() {
        let access = build_access_cookie("act_123", true);
        assert!(access.contains("access_token=act_123"));
        assert!(access.contains("Path=/api"));
        assert!(access.contains("HttpOnly"));
        assert!(access.contains("Secure"));

        let refresh = build_refresh_cookie("ref_456", false);
        assert!(refresh.contains("refresh_token=ref_456"));
        assert!(refresh.contains("Path=/api/auth"));
        assert!(refresh.contains("HttpOnly"));
        assert!(!refresh.contains("Secure"));

        let csrf = build_csrf_cookie("csrf_789", true);
        assert!(csrf.contains("csrf_token=csrf_789"));
        assert!(csrf.contains("Path=/"));
        assert!(!csrf.contains("HttpOnly"));
        assert!(csrf.contains("Secure"));

        let clear_act = clear_access_cookie(true);
        assert!(clear_act.contains("Max-Age=0"));
    }

    #[test]
    fn test_parse_cookie_value() {
        let header = "sessionId=abc; access_token=tok_xyz; csrf_token=csrf_123";
        assert_eq!(parse_cookie_value(header, "access_token"), Some("tok_xyz"));
        assert_eq!(parse_cookie_value(header, "csrf_token"), Some("csrf_123"));
        assert_eq!(parse_cookie_value(header, "missing"), None);
    }

    #[test]
    fn test_generate_csrf_token() {
        let t1 = generate_csrf_token().unwrap();
        let t2 = generate_csrf_token().unwrap();
        assert_eq!(t1.len(), 64);
        assert_ne!(t1, t2);
    }
}
