use std::sync::LazyLock;

use crate::i18n::translate;
use crate::templates::TemplateEngine;
use crate::types::{
    DeploymentOutcome, EmailAction, EmailLanguage, RenderedEmail, TransactionalEmailProps,
    VerificationPurpose,
};

static GLOBAL_ENGINE: LazyLock<TemplateEngine> =
    LazyLock::new(|| TemplateEngine::new().expect("Failed to initialize template engine"));

/// Render a verification code email for sign-in, email verification, password reset, or email change.
pub fn render_verification_code_email(
    code: &str,
    purpose: VerificationPurpose,
    language: Option<EmailLanguage>,
) -> Result<RenderedEmail, minijinja::Error> {
    let lang = language.unwrap_or_default();
    let prefix = match purpose {
        VerificationPurpose::SignIn => "otp.signIn",
        VerificationPurpose::ChangeEmail => "otp.changeEmail",
        VerificationPurpose::ForgetPassword => "otp.forgotPassword",
        VerificationPurpose::EmailVerification => "otp.verifyEmail",
    };

    let subject_key = format!("email.{}.subject", prefix);
    let preview_key = format!("email.{}.preview", prefix);
    let message_key = format!("email.{}.message", prefix);

    let subject = translate(&lang, &subject_key, &[]);
    let preview = translate(&lang, &preview_key, &[]);
    let message = translate(&lang, &message_key, &[]);
    let title = translate(&lang, "email.otp.title", &[]);
    let detail = translate(&lang, "email.otp.expiry", &[("minutes", "10")]);

    GLOBAL_ENGINE.render_transactional(&TransactionalEmailProps {
        title,
        message,
        preview,
        language: lang,
        subject: Some(subject),
        code: Some(code.to_string()),
        action: None,
        detail: Some(detail),
    })
}

/// Render an email verification link email.
pub fn render_email_verification_email(
    url: &str,
    language: Option<EmailLanguage>,
) -> Result<RenderedEmail, minijinja::Error> {
    let lang = language.unwrap_or_default();
    let subject = translate(&lang, "email.verifyEmail.subject", &[]);
    let preview = translate(&lang, "email.verifyEmail.preview", &[]);
    let title = translate(&lang, "email.verifyEmail.title", &[]);
    let message = translate(&lang, "email.verifyEmail.message", &[]);
    let action_label = translate(&lang, "email.verifyEmail.action", &[]);
    let detail = translate(&lang, "email.verifyEmail.detail", &[]);

    GLOBAL_ENGINE.render_transactional(&TransactionalEmailProps {
        title,
        message,
        preview,
        language: lang,
        subject: Some(subject),
        code: None,
        action: Some(EmailAction {
            label: action_label,
            url: url.to_string(),
        }),
        detail: Some(detail),
    })
}

/// Render a notification email sent when a new member joins an organization.
pub fn render_member_joined_email(
    member_name: &str,
    organization_name: &str,
    language: Option<EmailLanguage>,
) -> Result<RenderedEmail, minijinja::Error> {
    let lang = language.unwrap_or_default();
    let vars = &[
        ("memberName", member_name),
        ("organizationName", organization_name),
    ];

    let subject = translate(&lang, "email.memberJoined.subject", vars);
    let preview = translate(&lang, "email.memberJoined.preview", vars);
    let title = translate(&lang, "email.memberJoined.title", vars);
    let message = translate(&lang, "email.memberJoined.message", vars);

    GLOBAL_ENGINE.render_transactional(&TransactionalEmailProps {
        title,
        message,
        preview,
        language: lang,
        subject: Some(subject),
        code: None,
        action: None,
        detail: None,
    })
}

/// Render a security alert email for new sign-ins (optionally displaying the client IP address).
pub fn render_new_sign_in_email(
    ip_address: Option<&str>,
    language: Option<EmailLanguage>,
) -> Result<RenderedEmail, minijinja::Error> {
    let lang = language.unwrap_or_default();
    let subject = translate(&lang, "email.newSignIn.subject", &[]);
    let preview = translate(&lang, "email.newSignIn.preview", &[]);
    let title = translate(&lang, "email.newSignIn.title", &[]);
    let message = match ip_address {
        Some(ip) => translate(&lang, "email.newSignIn.withIp", &[("ipAddress", ip)]),
        None => translate(&lang, "email.newSignIn.withoutIp", &[]),
    };
    let detail = translate(&lang, "email.newSignIn.detail", &[]);

    GLOBAL_ENGINE.render_transactional(&TransactionalEmailProps {
        title,
        message,
        preview,
        language: lang,
        subject: Some(subject),
        code: None,
        action: None,
        detail: Some(detail),
    })
}

/// Render an organization member invitation email.
pub fn render_member_invitation_email(
    inviter_name: &str,
    organization_name: &str,
    role: &str,
    accept_url: &str,
    days: u32,
    language: Option<EmailLanguage>,
) -> Result<RenderedEmail, minijinja::Error> {
    let lang = language.unwrap_or_default();
    let days_str = days.to_string();
    let vars = &[
        ("inviterName", inviter_name),
        ("organizationName", organization_name),
        ("role", role),
        ("days", days_str.as_str()),
    ];

    let subject = translate(&lang, "email.invite.subject", vars);
    let preview = translate(&lang, "email.invite.preview", vars);
    let title = translate(&lang, "email.invite.title", vars);
    let message = translate(&lang, "email.invite.message", vars);
    let action_label = translate(&lang, "email.invite.action", vars);
    let detail = translate(&lang, "email.invite.expiry", vars);

    GLOBAL_ENGINE.render_transactional(&TransactionalEmailProps {
        title,
        message,
        preview,
        language: lang,
        subject: Some(subject),
        code: None,
        action: Some(EmailAction {
            label: action_label,
            url: accept_url.to_string(),
        }),
        detail: Some(detail),
    })
}

/// Render a project reader invitation email.
pub fn render_reader_invitation_email(
    project_name: &str,
    activation_url: &str,
    days: u32,
    language: Option<EmailLanguage>,
) -> Result<RenderedEmail, minijinja::Error> {
    let lang = language.unwrap_or_default();
    let days_str = days.to_string();
    let vars = &[("projectName", project_name), ("days", days_str.as_str())];

    let subject = translate(&lang, "email.readerInvite.subject", vars);
    let preview = translate(&lang, "email.readerInvite.preview", vars);
    let title = translate(&lang, "email.readerInvite.title", vars);
    let message = translate(&lang, "email.readerInvite.message", vars);
    let action_label = translate(&lang, "email.readerInvite.action", vars);
    let detail = translate(&lang, "email.readerInvite.expiry", vars);

    GLOBAL_ENGINE.render_transactional(&TransactionalEmailProps {
        title,
        message,
        preview,
        language: lang,
        subject: Some(subject),
        code: None,
        action: Some(EmailAction {
            label: action_label,
            url: activation_url.to_string(),
        }),
        detail: Some(detail),
    })
}

/// Render a deployment build/publish status email (ready or failed).
pub fn render_deployment_email(
    project_name: &str,
    version: u32,
    outcome: DeploymentOutcome,
    site_url: Option<&str>,
    error: Option<&str>,
    language: Option<EmailLanguage>,
) -> Result<RenderedEmail, minijinja::Error> {
    let lang = language.unwrap_or_default();
    let version_str = version.to_string();
    let err_str = error.unwrap_or("");
    let vars = &[
        ("projectName", project_name),
        ("version", version_str.as_str()),
        ("error", err_str),
    ];

    let prefix = match outcome {
        DeploymentOutcome::Ready => "deployment.ready",
        DeploymentOutcome::Failed => "deployment.failed",
    };

    let subject_key = format!("email.{}.subject", prefix);
    let preview_key = format!("email.{}.preview", prefix);
    let title_key = format!("email.{}.title", prefix);
    let message_key = format!("email.{}.message", prefix);

    let subject = translate(&lang, &subject_key, vars);
    let preview = translate(&lang, &preview_key, vars);
    let title = translate(&lang, &title_key, vars);
    let message = translate(&lang, &message_key, vars);

    let action = if outcome == DeploymentOutcome::Ready && site_url.is_some() {
        let action_label = translate(&lang, "email.deployment.ready.action", vars);
        Some(EmailAction {
            label: action_label,
            url: site_url.unwrap().to_string(),
        })
    } else {
        None
    };

    let detail = if outcome == DeploymentOutcome::Failed && error.is_some() {
        Some(translate(&lang, "email.deployment.failed.detail", vars))
    } else {
        None
    };

    GLOBAL_ENGINE.render_transactional(&TransactionalEmailProps {
        title,
        message,
        preview,
        language: lang,
        subject: Some(subject),
        code: None,
        action,
        detail,
    })
}
