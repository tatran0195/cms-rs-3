use serde::Deserialize;

/// Mailer configuration
#[derive(Debug, Clone, Deserialize)]
pub struct MailerConfig {
    /// SMTP host
    #[serde(default)]
    pub smtp_host: Option<String>,

    /// SMTP port
    #[serde(default = "default_smtp_port")]
    pub smtp_port: u16,

    /// SMTP username
    #[serde(default)]
    pub smtp_username: Option<String>,

    /// SMTP password
    #[serde(default)]
    pub smtp_password: Option<String>,

    /// Whether to use TLS (true = implicit TLS/SMTPS on port 465)
    #[serde(default)]
    pub smtp_use_tls: bool,

    /// Use plain unencrypted SMTP (no TLS, no STARTTLS) — for local dev tools like Mailpit
    #[serde(default)]
    pub smtp_plain_no_tls: bool,

    /// From email address
    #[serde(default)]
    pub from_email: Option<String>,

    /// From name
    #[serde(default)]
    pub from_name: Option<String>,

    /// Optional logo URL to display in email header (defaults to inline CID attachment)
    #[serde(default)]
    pub logo_url: Option<String>,
}

fn default_smtp_port() -> u16 {
    587
}

impl Default for MailerConfig {
    fn default() -> Self {
        Self {
            smtp_host: None,
            smtp_port: default_smtp_port(),
            smtp_username: None,
            smtp_password: None,
            smtp_use_tls: false,
            smtp_plain_no_tls: false,
            from_email: None,
            from_name: None,
            logo_url: None,
        }
    }
}
