#![forbid(unsafe_code)]

//! Brute-force account lockout protection ported from MedBrains.
//!
//! Provides:
//! - 5 maximum failed login attempts threshold.
//! - 15-minute temporary lockout duration.
//! - SQL-level atomic increment and lock check.

use cms_error::AppError;
use sqlx::PgPool;

pub const MAX_FAILED_LOGINS: i32 = 5;
pub const LOCKOUT_MINUTES: i32 = 15;

/// Increment the failed login counter for a user.
/// If `failed_login_attempts + 1 >= 5`, sets `locked_until = now() + 15 minutes`
/// and returns `Ok(true)` (account is now locked).
pub async fn record_failed_login(pool: &PgPool, user_id: &str) -> Result<bool, AppError> {
    let now_locked: bool = sqlx::query_scalar(
        r#"UPDATE "User" SET
             failed_login_attempts = failed_login_attempts + 1,
             locked_until = CASE
               WHEN failed_login_attempts + 1 >= $2
               THEN now() + make_interval(mins => $3)
               ELSE locked_until END
           WHERE id = $1
           RETURNING failed_login_attempts >= $2"#,
    )
    .bind(user_id)
    .bind(MAX_FAILED_LOGINS)
    .bind(LOCKOUT_MINUTES)
    .fetch_one(pool)
    .await
    .map_err(AppError::Database)?;

    if now_locked {
        tracing::warn!(user_id = %user_id, "Account locked after repeated failed logins");
    }

    Ok(now_locked)
}

/// Reset the failed login counter and clear the lockout on successful authentication.
pub async fn reset_failed_logins(pool: &PgPool, user_id: &str) -> Result<(), AppError> {
    sqlx::query(
        r#"UPDATE "User" SET
             failed_login_attempts = 0,
             locked_until = NULL
           WHERE id = $1 AND (failed_login_attempts > 0 OR locked_until IS NOT NULL)"#,
    )
    .bind(user_id)
    .execute(pool)
    .await
    .map_err(AppError::Database)?;

    Ok(())
}

/// Check if account is currently locked out.
pub async fn is_account_locked(pool: &PgPool, user_id: &str) -> Result<bool, AppError> {
    let locked: Option<bool> = sqlx::query_scalar(
        r#"SELECT locked_until IS NOT NULL AND locked_until > now()
           FROM "User" WHERE id = $1"#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(AppError::Database)?;

    Ok(locked.unwrap_or(false))
}
