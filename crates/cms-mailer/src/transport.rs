use std::sync::Arc;

use async_trait::async_trait;
use cms_error::AppError;
use lettre::{
    message::{header::ContentType, Attachment, Mailbox, MultiPart, SinglePart},
    transport::smtp::authentication::Credentials,
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
};
use tokio::sync::Mutex;

use crate::types::RenderedEmail;

/// Email sender trait — implementations can be SMTP, SES, SendGrid, in-memory mock, etc.
#[async_trait]
pub trait Mailer: Send + Sync {
    /// Send a plain-text email.
    async fn send_email(&self, to: &str, subject: &str, body: &str) -> Result<(), AppError>;

    /// Send a rich email containing both HTML and plain-text versions.
    async fn send_rendered_email(&self, to: &str, email: &RenderedEmail) -> Result<(), AppError> {
        self.send_email(to, &email.subject, &email.text).await
    }
}

/// Build the configured mail adapter. Missing SMTP is represented explicitly and
/// fails closed on a send request; it never silently discards security mail.
pub fn create_mailer(
    config: Option<&cms_config::MailerConfig>,
) -> Result<Arc<dyn Mailer>, AppError> {
    match config.and_then(|cfg| cfg.smtp_host.as_deref().map(|_| cfg)) {
        Some(cfg) => Ok(Arc::new(SmtpMailer::new(cfg.clone())?)),
        None => Ok(Arc::new(UnconfiguredMailer)),
    }
}

/// Create a mailer that falls back to a NoopMailer with a warning instead of failing closed.
pub fn create_mailer_with_noop_fallback(
    config: Option<&cms_config::MailerConfig>,
) -> Result<Arc<dyn Mailer>, AppError> {
    if let Some(cfg) = config {
        if let Some(ref host) = cfg.smtp_host {
            tracing::info!("Using SMTP mailer: {}:{}", host, cfg.smtp_port);
            return Ok(Arc::new(SmtpMailer::new(cfg.clone())?));
        }
    }

    tracing::warn!(
        "No SMTP host configured — emails will be silently discarded. Set CMS_MAILER__SMTP_HOST \
         to enable email delivery."
    );
    Ok(Arc::new(NoopMailer))
}

/// Embedded default email header logo (TechnoStar logo, optimized for email clients).
pub const TECHNOSTAR_LOGO_EMAIL_BYTES: &[u8] =
    include_bytes!("../assets/technostar-logo-email.png");

/// Real SMTP mailer using `lettre`.
pub struct SmtpMailer {
    transport: AsyncSmtpTransport<Tokio1Executor>,
    from: Mailbox,
    logo_url: Option<String>,
}

impl SmtpMailer {
    pub fn new(config: cms_config::MailerConfig) -> Result<Self, AppError> {
        let host = config
            .smtp_host
            .as_deref()
            .ok_or_else(|| AppError::InvalidInput("smtp_host is required".to_string()))?;
        let from_email = config
            .from_email
            .as_deref()
            .unwrap_or("noreply@example.com");
        let from_name = config.from_name.as_deref().unwrap_or("CMS");
        let from: Mailbox = format!("{} <{}>", from_name, from_email)
            .parse()
            .map_err(|error| AppError::InvalidInput(format!("Invalid from_email: {error}")))?;
        let logo_url = config.logo_url.clone();

        let builder = if config.smtp_use_tls {
            AsyncSmtpTransport::<Tokio1Executor>::relay(host)
        } else if config.smtp_plain_no_tls {
            // Plain unencrypted SMTP — used for local dev tools like Mailpit.
            Ok(AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(
                host,
            ))
        } else {
            AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(host)
        }
        .map_err(|error| AppError::ProviderError(format!("SMTP configuration error: {error}")))?;

        let builder = match (&config.smtp_username, &config.smtp_password) {
            (Some(username), Some(password)) => {
                builder.credentials(Credentials::new(username.clone(), password.clone()))
            }
            (None, None) => builder,
            _ => {
                return Err(AppError::InvalidInput(
                    "smtp_username and smtp_password must be configured together".to_string(),
                ));
            }
        };

        Ok(Self {
            transport: builder.port(config.smtp_port).build(),
            from,
            logo_url,
        })
    }

    /// Build a lettre `Message` for a rendered email, attaching the brand logo inline as CID
    /// when referenced in the HTML body.
    pub fn build_rendered_message(
        &self,
        to: &str,
        email: &RenderedEmail,
    ) -> Result<Message, AppError> {
        let to_mailbox: Mailbox = to.parse().map_err(|error| {
            AppError::InvalidInput(format!("Invalid recipient address: {error}"))
        })?;

        let mut html = email.html.clone();
        if let Some(ref custom_logo_url) = self.logo_url {
            html = html
                .replace("cid:technostar-logo", custom_logo_url)
                .replace("/brand/technostar-logo.png", custom_logo_url)
                .replace("/brand/technostar-logo-email.png", custom_logo_url);
        } else if html.contains("/brand/technostar-logo.png")
            || html.contains("/brand/technostar-logo-email.png")
        {
            html = html
                .replace("/brand/technostar-logo.png", "cid:technostar-logo")
                .replace("/brand/technostar-logo-email.png", "cid:technostar-logo");
        }

        let alternative = MultiPart::alternative()
            .singlepart(SinglePart::plain(email.text.clone()))
            .singlepart(SinglePart::html(html.clone()));

        let message_builder = Message::builder()
            .from(self.from.clone())
            .to(to_mailbox)
            .subject(&email.subject);

        if html.contains("cid:technostar-logo") {
            let logo_attachment = Attachment::new_inline_with_name(
                "technostar-logo".to_string(),
                "technostar-logo.png".to_string(),
            )
            .body(
                TECHNOSTAR_LOGO_EMAIL_BYTES.to_vec(),
                ContentType::parse("image/png; name=\"technostar-logo.png\"").unwrap(),
            );

            let related = MultiPart::related()
                .multipart(alternative)
                .singlepart(logo_attachment);

            message_builder
                .multipart(related)
                .map_err(|error| AppError::Internal(error.into()))
        } else {
            message_builder
                .multipart(alternative)
                .map_err(|error| AppError::Internal(error.into()))
        }
    }
}

#[async_trait]
impl Mailer for SmtpMailer {
    async fn send_email(&self, to: &str, subject: &str, body: &str) -> Result<(), AppError> {
        let to_mailbox: Mailbox = to.parse().map_err(|error| {
            AppError::InvalidInput(format!("Invalid recipient address: {error}"))
        })?;
        let email = Message::builder()
            .from(self.from.clone())
            .to(to_mailbox)
            .subject(subject)
            .header(ContentType::TEXT_PLAIN)
            .body(body.to_string())
            .map_err(|error| AppError::Internal(error.into()))?;

        self.transport.send(email).await.map_err(|error| {
            tracing::error!("SMTP delivery failed: {error}");
            AppError::ProviderError("Email delivery failed".to_string())
        })?;
        Ok(())
    }

    async fn send_rendered_email(&self, to: &str, email: &RenderedEmail) -> Result<(), AppError> {
        let message = self.build_rendered_message(to, email)?;
        self.transport.send(message).await.map_err(|error| {
            tracing::error!("SMTP delivery failed: {error}");
            AppError::ProviderError("Email delivery failed".to_string())
        })?;
        Ok(())
    }
}

/// Explicit fail-closed adapter used when SMTP is not configured.
pub struct UnconfiguredMailer;

#[async_trait]
impl Mailer for UnconfiguredMailer {
    async fn send_email(&self, _to: &str, _subject: &str, _body: &str) -> Result<(), AppError> {
        Err(AppError::ProviderError(
            "Email delivery is not configured; set CMS_MAILER__SMTP_HOST".to_string(),
        ))
    }
}

/// No-op mailer: drops all emails with a warning/debug log (for local testing).
pub struct NoopMailer;

#[async_trait]
impl Mailer for NoopMailer {
    async fn send_email(&self, to: &str, subject: &str, _body: &str) -> Result<(), AppError> {
        tracing::debug!(
            "[NoopMailer] Email discarded to={} subject={} (no SMTP configured)",
            to,
            subject
        );
        Ok(())
    }
}

/// Recorded email for test assertions.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SentEmail {
    pub to: String,
    pub subject: String,
    pub body: String,
    pub html: Option<String>,
}

/// In-memory mock mailer for tests.
#[derive(Default, Clone)]
pub struct MockMailer {
    pub sent: Arc<Mutex<Vec<SentEmail>>>,
}

impl MockMailer {
    pub fn new() -> Self {
        Self {
            sent: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub async fn get_sent(&self) -> Vec<SentEmail> {
        self.sent.lock().await.clone()
    }
}

#[async_trait]
impl Mailer for MockMailer {
    async fn send_email(&self, to: &str, subject: &str, body: &str) -> Result<(), AppError> {
        self.sent.lock().await.push(SentEmail {
            to: to.to_string(),
            subject: subject.to_string(),
            body: body.to_string(),
            html: None,
        });
        Ok(())
    }

    async fn send_rendered_email(&self, to: &str, email: &RenderedEmail) -> Result<(), AppError> {
        self.sent.lock().await.push(SentEmail {
            to: to.to_string(),
            subject: email.subject.clone(),
            body: email.text.clone(),
            html: Some(email.html.clone()),
        });
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_unconfigured_mailer_fails_closed() {
        let mailer = UnconfiguredMailer;
        let err = mailer
            .send_email("test@example.com", "Test", "Body")
            .await
            .unwrap_err();
        assert!(err.to_string().contains("Email delivery is not configured"));
    }

    #[tokio::test]
    async fn test_mock_mailer() {
        let mailer = MockMailer::new();
        let rendered = RenderedEmail {
            subject: "Welcome".to_string(),
            html: "<h1>Welcome</h1>".to_string(),
            text: "Welcome".to_string(),
        };

        mailer
            .send_rendered_email("user@example.com", &rendered)
            .await
            .unwrap();

        let sent = mailer.get_sent().await;
        assert_eq!(sent.len(), 1);
        assert_eq!(sent[0].to, "user@example.com");
        assert_eq!(sent[0].subject, "Welcome");
        assert_eq!(sent[0].html.as_deref(), Some("<h1>Welcome</h1>"));
    }

    #[tokio::test]
    async fn test_smtp_mailer_builds_inline_logo_cid_attachment() {
        let mailer = SmtpMailer::new(cms_config::MailerConfig {
            smtp_host: Some("localhost".to_string()),
            smtp_port: 1025,
            smtp_username: None,
            smtp_password: None,
            smtp_use_tls: false,
            smtp_plain_no_tls: true,
            from_email: Some("noreply@example.com".to_string()),
            from_name: Some("Test".to_string()),
            logo_url: None,
        })
        .unwrap();

        let email = RenderedEmail {
            subject: "Verification Code".to_string(),
            html: r#"<img src="cid:technostar-logo" alt="TechnoStar" />"#.to_string(),
            text: "Code: 123456".to_string(),
        };

        let message = mailer
            .build_rendered_message("user@example.com", &email)
            .unwrap();
        let raw = String::from_utf8(message.formatted()).unwrap();

        assert!(raw.contains("multipart/related"));
        assert!(raw.contains("cid:technostar-logo") || raw.contains("<technostar-logo>"));
        assert!(raw.contains("image/png"));
        assert!(raw.contains("technostar-logo.png"));
    }

    #[tokio::test]
    async fn test_smtp_mailer_normalizes_relative_logo_path() {
        let mailer = SmtpMailer::new(cms_config::MailerConfig {
            smtp_host: Some("localhost".to_string()),
            smtp_port: 1025,
            smtp_username: None,
            smtp_password: None,
            smtp_use_tls: false,
            smtp_plain_no_tls: true,
            from_email: Some("noreply@example.com".to_string()),
            from_name: Some("Test".to_string()),
            logo_url: None,
        })
        .unwrap();

        let email = RenderedEmail {
            subject: "Verification Code".to_string(),
            html: r#"<img src="/brand/technostar-logo.png" alt="TechnoStar" />"#.to_string(),
            text: "Code: 123456".to_string(),
        };

        let message = mailer
            .build_rendered_message("user@example.com", &email)
            .unwrap();
        let raw = String::from_utf8(message.formatted()).unwrap();

        assert!(raw.contains("multipart/related"));
        assert!(raw.contains("<technostar-logo>"));
        assert!(!raw.contains(r#"src="/brand/technostar-logo.png""#));
    }

    #[tokio::test]
    async fn test_smtp_mailer_respects_custom_logo_url() {
        let mailer = SmtpMailer::new(cms_config::MailerConfig {
            smtp_host: Some("localhost".to_string()),
            smtp_port: 1025,
            smtp_username: None,
            smtp_password: None,
            smtp_use_tls: false,
            smtp_plain_no_tls: true,
            from_email: Some("noreply@example.com".to_string()),
            from_name: Some("Test".to_string()),
            logo_url: Some("https://cdn.example.com/logo.png".to_string()),
        })
        .unwrap();

        let email = RenderedEmail {
            subject: "Verification Code".to_string(),
            html: r#"<img src="cid:technostar-logo" alt="TechnoStar" />"#.to_string(),
            text: "Code: 123456".to_string(),
        };

        let message = mailer
            .build_rendered_message("user@example.com", &email)
            .unwrap();
        let raw = String::from_utf8(message.formatted()).unwrap();

        assert!(raw.contains("multipart/alternative"));
        assert!(raw.contains("https://cdn.example.com/logo.png"));
        assert!(!raw.contains("<technostar-logo>"));
    }
}
