use serde::{Deserialize, Serialize};

/// Supported email languages matching `@cms/i18n`.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
pub enum EmailLanguage {
    #[default]
    En,
    Ar,
    Ja,
    ZhCn,
    Custom(String),
}

impl EmailLanguage {
    pub fn as_str(&self) -> &str {
        match self {
            Self::En => "en",
            Self::Ar => "ar",
            Self::Ja => "ja",
            Self::ZhCn => "zh-CN",
            Self::Custom(s) => s.as_str(),
        }
    }

    pub fn parse_locale(s: &str) -> Self {
        let normalized = s.trim().to_lowercase();
        if normalized == "ar" || normalized.starts_with("ar-") {
            Self::Ar
        } else if normalized == "ja" || normalized.starts_with("ja-") {
            Self::Ja
        } else if normalized == "zh-cn" || normalized == "zh" || normalized.starts_with("zh-") {
            Self::ZhCn
        } else if normalized == "en" || normalized.starts_with("en-") {
            Self::En
        } else {
            Self::Custom(s.to_string())
        }
    }

    pub fn direction(&self) -> Direction {
        match self {
            Self::Ar => Direction::Rtl,
            Self::Custom(s)
                if s.to_lowercase().starts_with("ar")
                    || s.to_lowercase().starts_with("he")
                    || s.to_lowercase().starts_with("fa") =>
            {
                Direction::Rtl
            }
            _ => Direction::Ltr,
        }
    }
}

impl From<&str> for EmailLanguage {
    fn from(s: &str) -> Self {
        Self::parse_locale(s)
    }
}

impl From<String> for EmailLanguage {
    fn from(s: String) -> Self {
        Self::parse_locale(&s)
    }
}

impl std::fmt::Display for EmailLanguage {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Text direction for email layouts (LTR or RTL).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
pub enum Direction {
    #[default]
    Ltr,
    Rtl,
}

impl Direction {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Ltr => "ltr",
            Self::Rtl => "rtl",
        }
    }
}

impl std::fmt::Display for Direction {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// A rendered email containing subject line, HTML body, and plain-text fallback.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RenderedEmail {
    pub subject: String,
    pub html: String,
    pub text: String,
}

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

    pub fn from_str_loose(s: &str) -> Self {
        let norm = s.trim().to_lowercase().replace('_', "-");
        match norm.as_str() {
            "sign-in" | "signin" | "login" => Self::SignIn,
            "change-email" | "changeemail" => Self::ChangeEmail,
            "forget-password" | "forgot-password" | "password-reset" | "reset-password" => {
                Self::ForgetPassword
            }
            _ => Self::EmailVerification,
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

/// Low-level properties passed to render transactional templates.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TransactionalEmailProps {
    pub title: String,
    pub message: String,
    pub preview: String,
    pub language: EmailLanguage,
    #[serde(default)]
    pub subject: Option<String>,
    pub code: Option<String>,
    pub action: Option<EmailAction>,
    pub detail: Option<String>,
    #[serde(default)]
    pub logo_url: Option<String>,
}
