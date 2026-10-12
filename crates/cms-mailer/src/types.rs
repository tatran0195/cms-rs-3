use std::str::FromStr;

use serde::{Deserialize, Serialize};

pub use crate::i18n::Direction;
use crate::i18n::Locale;

/// A rendered email containing subject line, HTML body, and plain-text fallback.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RenderedEmail {
    pub subject: String,
    pub html: String,
    pub text: String,
}

/// Unknown [`VerificationPurpose`] string.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("unknown verification purpose `{0}`")]
pub struct UnknownPurpose(pub String);

/// One-time verification code purpose.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum VerificationPurpose {
    SignIn,
    EmailVerification,
    ForgetPassword,
    ChangeEmail,
}

impl VerificationPurpose {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::SignIn => "sign-in",
            Self::EmailVerification => "email-verification",
            Self::ForgetPassword => "forget-password",
            Self::ChangeEmail => "change-email",
        }
    }

    /// Lenient parser that silently maps *unknown* input to `EmailVerification`.
    /// A typo then sends the wrong email; use `str::parse` and handle the error.
    #[deprecated(note = "use `str::parse::<VerificationPurpose>()`; unknown values are an error")]
    pub fn from_str_loose(s: &str) -> Self {
        s.parse().unwrap_or(Self::EmailVerification)
    }
}

impl FromStr for VerificationPurpose {
    type Err = UnknownPurpose;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let norm = s.trim().to_lowercase().replace('_', "-");
        match norm.as_str() {
            "sign-in" | "signin" | "login" => Ok(Self::SignIn),
            "email-verification" | "verify-email" | "verification" => Ok(Self::EmailVerification),
            "change-email" | "changeemail" => Ok(Self::ChangeEmail),
            "forget-password" | "forgot-password" | "password-reset" | "reset-password" => {
                Ok(Self::ForgetPassword)
            }
            _ => Err(UnknownPurpose(s.to_owned())),
        }
    }
}

/// Deployment outcome for build/publish notifications.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeploymentOutcome {
    Ready,
    Failed,
}

/// Call-to-action button or link inside an email.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EmailAction {
    pub label: String,
    pub url: String,
}

/// Already-localised brand strings used by the layout (header/footer/fallback link).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Brand {
    pub name: String,
    pub footer: String,
    pub fallback_link_label: String,
}

/// Fully-resolved input of the presentation layer. Every string is already translated;
/// the template engine does layout only.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TransactionalEmailProps {
    pub title: String,
    pub message: String,
    pub preview: String,
    pub language: Locale,
    #[serde(default)]
    pub subject: Option<String>,
    pub code: Option<String>,
    pub action: Option<EmailAction>,
    pub detail: Option<String>,
    #[serde(default)]
    pub logo_url: Option<String>,
    pub brand: Brand,
}
