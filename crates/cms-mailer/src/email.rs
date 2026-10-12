use serde::{Deserialize, Serialize};

use crate::types::{DeploymentOutcome, VerificationPurpose};

/// Every transactional email this service can send, as data.
///
/// Why an enum instead of seven `render_*` functions:
/// * adding an email forces every `match` (composer, tests, outbox) to handle it;
/// * it is `Serialize`, so a job queue can store *what to send* and render at send time
///   in the recipient's current locale. **Caveat:** `VerificationCode` carries a secret —
///   encrypt or short-TTL anything that persists it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Email {
    /// One-time code. `ttl_minutes` must be the **real** code lifetime — it is printed in the email.
    VerificationCode { code: String, purpose: VerificationPurpose, ttl_minutes: u32 },
    VerifyEmail { url: String },
    MemberJoined { member_name: String, workspace_name: String },
    NewSignIn { ip_address: Option<String> },
    MemberInvitation {
        inviter_name: String,
        workspace_name: String,
        role: String,
        accept_url: String,
        expires_in_days: u32,
    },
    ReaderInvitation { project_name: String, activation_url: String, expires_in_days: u32 },
    Deployment {
        project_name: String,
        version: u32,
        outcome: DeploymentOutcome,
        site_url: Option<String>,
        error: Option<String>,
    },
}
