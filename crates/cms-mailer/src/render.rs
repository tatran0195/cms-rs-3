//! Composition: [`Email`] + [`Locale`] → localised strings → presentation layer.

use std::sync::Arc;

use crate::{
    email::Email,
    embedded,
    error::RenderError,
    i18n::{Args, Catalog, CatalogBuilder, CatalogError, Locale},
    keys as k,
    templates::TemplateEngine,
    types::{
        Brand, DeploymentOutcome, EmailAction, RenderedEmail, TransactionalEmailProps,
        VerificationPurpose,
    },
};

/// Key namespace this crate reads from the shared message files.
pub const NAMESPACE: &str = "email_";
/// Base locale (Paraglide `baseLocale`); must contain every key in [`keys::ALL`](crate::keys::ALL).
pub const DEFAULT_LOCALE: &str = "en";

/// A builder pre-loaded with the messages embedded at compile time.
/// Chain `.add_dir(..)` on it for runtime overrides before `.build()`.
pub fn embedded_catalog_builder() -> Result<CatalogBuilder, CatalogError> {
    let mut builder = Catalog::builder(Locale::parse(DEFAULT_LOCALE)?).namespace(NAMESPACE);
    for (locale, json) in embedded::MESSAGES {
        builder = builder.add_json(locale, json)?;
    }
    Ok(builder)
}

/// Renders every [`Email`] in any locale. Build it **once at startup** and share it
/// (`Clone` is cheap: the catalog is behind an `Arc`). Construction audits the catalog,
/// so a missing/broken translation is a boot failure, not a runtime surprise.
#[derive(Clone)]
pub struct EmailRenderer {
    catalog: Arc<Catalog>,
    engine: TemplateEngine,
}

impl EmailRenderer {
    /// Renderer over the compile-time embedded messages.
    pub fn embedded() -> Result<Self, RenderError> {
        Self::new(Arc::new(embedded_catalog_builder()?.build()?))
    }

    /// Renderer over a custom catalog (tests, runtime overrides).
    pub fn new(catalog: Arc<Catalog>) -> Result<Self, RenderError> {
        let audit = catalog.audit(k::ALL, k::PLURAL);
        for warning in &audit.warnings {
            tracing::warn!("email i18n: {warning}");
        }
        if !audit.is_ok() {
            return Err(RenderError::InvalidCatalog(audit.errors.join("\n")));
        }
        Ok(Self { catalog, engine: TemplateEngine::new()? })
    }

    pub fn catalog(&self) -> &Catalog {
        &self.catalog
    }

    /// Best available locale for a priority-ordered list of requested tags
    /// (e.g. `[user.locale, ..accept_language_tags(header)]`).
    pub fn negotiate<'a>(&self, requested: impl IntoIterator<Item = &'a str>) -> Locale {
        self.catalog.negotiate(requested)
    }

    /// Render `email` for `requested`.
    ///
    /// The requested locale is first resolved to the locale actually *served*
    /// (`ja-JP` → `ja`, `ar` without a bundle → default). Text **and** layout
    /// (`lang`, `dir`) follow the served locale, so an Arabic user who falls back to
    /// English gets a coherent LTR English email, not English text in an RTL shell.
    pub fn render(&self, email: &Email, requested: &Locale) -> Result<RenderedEmail, RenderError> {
        let locale = &self.catalog.negotiate([requested.as_str()]);
        let c = compose(email);
        let t = |key: &str| self.catalog.format(locale, key, &c.args);

        let subject = t(c.subject)?;
        let preview = t(c.preview)?;
        let title = t(c.title)?;
        let message = t(c.message)?;

        let action = match c.action {
            Some((label_key, url)) => Some(EmailAction { label: t(label_key)?, url }),
            None => None,
        };
        let detail = match c.detail {
            None => None,
            Some(Detail::Plain(key)) => Some(t(key)?),
            Some(Detail::Plural { key, var, n }) => {
                Some(self.catalog.format_plural(locale, key, var, n, &c.args)?)
            }
        };
        let brand = Brand {
            name: t(k::BRAND_NAME)?,
            footer: t(k::BRAND_FOOTER)?,
            fallback_link_label: t(k::BRAND_FALLBACKLINK)?,
        };

        Ok(self.engine.render_transactional(&TransactionalEmailProps {
            title,
            message,
            preview,
            language: locale.clone(),
            subject: Some(subject),
            code: c.code,
            action,
            detail,
            logo_url: None,
            brand,
        })?)
    }
}

/// Which message goes where, plus the shared arguments. Pure data: no catalog access.
struct Composition {
    subject: &'static str,
    preview: &'static str,
    title: &'static str,
    message: &'static str,
    code: Option<String>,
    /// `(label key, url)`
    action: Option<(&'static str, String)>,
    detail: Option<Detail>,
    args: Args,
}

enum Detail {
    Plain(&'static str),
    Plural { key: &'static str, var: &'static str, n: u64 },
}

fn compose(email: &Email) -> Composition {
    match email {
        Email::VerificationCode { code, purpose, ttl_minutes } => {
            let (subject, preview, message) = match purpose {
                VerificationPurpose::SignIn => {
                    (k::OTP_SIGNIN_SUBJECT, k::OTP_SIGNIN_PREVIEW, k::OTP_SIGNIN_MESSAGE)
                }
                VerificationPurpose::ChangeEmail => (
                    k::OTP_CHANGEEMAIL_SUBJECT,
                    k::OTP_CHANGEEMAIL_PREVIEW,
                    k::OTP_CHANGEEMAIL_MESSAGE,
                ),
                VerificationPurpose::ForgetPassword => (
                    k::OTP_FORGOTPASSWORD_SUBJECT,
                    k::OTP_FORGOTPASSWORD_PREVIEW,
                    k::OTP_FORGOTPASSWORD_MESSAGE,
                ),
                VerificationPurpose::EmailVerification => (
                    k::OTP_VERIFYEMAIL_SUBJECT,
                    k::OTP_VERIFYEMAIL_PREVIEW,
                    k::OTP_VERIFYEMAIL_MESSAGE,
                ),
            };
            Composition {
                subject,
                preview,
                title: k::OTP_TITLE,
                message,
                code: Some(code.clone()),
                action: None,
                detail: Some(Detail::Plural {
                    key: k::OTP_EXPIRY,
                    var: "minutes",
                    n: u64::from(*ttl_minutes),
                }),
                args: Args::new().with("minutes", ttl_minutes),
            }
        }

        Email::VerifyEmail { url } => Composition {
            subject: k::VERIFYEMAIL_SUBJECT,
            preview: k::VERIFYEMAIL_PREVIEW,
            title: k::VERIFYEMAIL_TITLE,
            message: k::VERIFYEMAIL_MESSAGE,
            code: None,
            action: Some((k::VERIFYEMAIL_ACTION, url.clone())),
            detail: Some(Detail::Plain(k::VERIFYEMAIL_DETAIL)),
            args: Args::new(),
        },

        Email::MemberJoined { member_name, workspace_name } => Composition {
            subject: k::MEMBERJOINED_SUBJECT,
            preview: k::MEMBERJOINED_PREVIEW,
            title: k::MEMBERJOINED_TITLE,
            message: k::MEMBERJOINED_MESSAGE,
            code: None,
            action: None,
            detail: None,
            args: Args::new().with("memberName", member_name).with("workspaceName", workspace_name),
        },

        Email::NewSignIn { ip_address } => {
            let mut args = Args::new();
            let message = match ip_address {
                Some(ip) => {
                    args.set("ipAddress", ip);
                    k::NEWSIGNIN_WITHIP
                }
                None => k::NEWSIGNIN_WITHOUTIP,
            };
            Composition {
                subject: k::NEWSIGNIN_SUBJECT,
                preview: k::NEWSIGNIN_PREVIEW,
                title: k::NEWSIGNIN_TITLE,
                message,
                code: None,
                action: None,
                detail: Some(Detail::Plain(k::NEWSIGNIN_DETAIL)),
                args,
            }
        }

        Email::MemberInvitation { inviter_name, workspace_name, role, accept_url, expires_in_days } => {
            Composition {
                subject: k::INVITE_SUBJECT,
                preview: k::INVITE_PREVIEW,
                title: k::INVITE_TITLE,
                message: k::INVITE_MESSAGE,
                code: None,
                action: Some((k::INVITE_ACTION, accept_url.clone())),
                detail: Some(Detail::Plural {
                    key: k::INVITE_EXPIRY,
                    var: "days",
                    n: u64::from(*expires_in_days),
                }),
                args: Args::new()
                    .with("inviterName", inviter_name)
                    .with("workspaceName", workspace_name)
                    .with("role", role)
                    .with("days", expires_in_days),
            }
        }

        Email::ReaderInvitation { project_name, activation_url, expires_in_days } => Composition {
            subject: k::READERINVITE_SUBJECT,
            preview: k::READERINVITE_PREVIEW,
            title: k::READERINVITE_TITLE,
            message: k::READERINVITE_MESSAGE,
            code: None,
            action: Some((k::READERINVITE_ACTION, activation_url.clone())),
            detail: Some(Detail::Plural {
                key: k::READERINVITE_EXPIRY,
                var: "days",
                n: u64::from(*expires_in_days),
            }),
            args: Args::new().with("projectName", project_name).with("days", expires_in_days),
        },

        Email::Deployment { project_name, version, outcome, site_url, error } => {
            let mut args = Args::new().with("projectName", project_name).with("version", version);
            match outcome {
                DeploymentOutcome::Ready => Composition {
                    subject: k::DEPLOYMENT_READY_SUBJECT,
                    preview: k::DEPLOYMENT_READY_PREVIEW,
                    title: k::DEPLOYMENT_READY_TITLE,
                    message: k::DEPLOYMENT_READY_MESSAGE,
                    code: None,
                    action: site_url.clone().map(|url| (k::DEPLOYMENT_READY_ACTION, url)),
                    detail: None,
                    args,
                },
                DeploymentOutcome::Failed => {
                    if let Some(error) = error {
                        args.set("error", error);
                    }
                    Composition {
                        subject: k::DEPLOYMENT_FAILED_SUBJECT,
                        preview: k::DEPLOYMENT_FAILED_PREVIEW,
                        title: k::DEPLOYMENT_FAILED_TITLE,
                        message: k::DEPLOYMENT_FAILED_MESSAGE,
                        code: None,
                        action: None,
                        detail: error.is_some().then_some(Detail::Plain(k::DEPLOYMENT_FAILED_DETAIL)),
                        args,
                    }
                }
            }
        }
    }
}
