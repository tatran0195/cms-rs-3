//! CI gate for the shared translation files.
//!
//! Runs against the messages embedded by `build.rs` (= `packages/i18n/messages/*.json`),
//! so adding a locale or editing a string anywhere in the monorepo is validated here.

use cms_mailer::{
    keys, DeploymentOutcome, Email, EmailRenderer, Locale, VerificationPurpose,
};

fn samples() -> Vec<Email> {
    let mut v: Vec<Email> = [
        VerificationPurpose::SignIn,
        VerificationPurpose::EmailVerification,
        VerificationPurpose::ForgetPassword,
        VerificationPurpose::ChangeEmail,
    ]
    .into_iter()
    .flat_map(|purpose| {
        [1, 10].map(|ttl_minutes| Email::VerificationCode { code: "123456".into(), purpose, ttl_minutes })
    })
    .collect();

    v.push(Email::VerifyEmail { url: "https://example.com/v".into() });
    v.push(Email::MemberJoined { member_name: "Alice".into(), workspace_name: "Acme".into() });
    v.push(Email::NewSignIn { ip_address: Some("203.0.113.9".into()) });
    v.push(Email::NewSignIn { ip_address: None });
    for days in [1, 7] {
        v.push(Email::MemberInvitation {
            inviter_name: "Bob".into(), workspace_name: "Acme".into(), role: "Admin".into(),
            accept_url: "https://example.com/i".into(), expires_in_days: days,
        });
        v.push(Email::ReaderInvitation {
            project_name: "Docs".into(), activation_url: "https://example.com/r".into(),
            expires_in_days: days,
        });
    }
    v.push(Email::Deployment {
        project_name: "Docs".into(), version: 7, outcome: DeploymentOutcome::Ready,
        site_url: Some("https://docs.example.com".into()), error: None,
    });
    v.push(Email::Deployment {
        project_name: "Docs".into(), version: 7, outcome: DeploymentOutcome::Failed,
        site_url: None, error: Some("boom".into()),
    });
    v
}

#[test]
fn audit_is_completely_clean() {
    let r = EmailRenderer::embedded().unwrap();
    let audit = r.catalog().audit(keys::ALL, keys::PLURAL);
    assert!(
        audit.is_clean(),
        "i18n audit failed\nerrors:\n  {}\nwarnings:\n  {}",
        audit.errors.join("\n  "),
        audit.warnings.join("\n  ")
    );
}

#[test]
fn every_locale_renders_every_email_with_no_leftover_placeholders() {
    let r = EmailRenderer::embedded().unwrap();
    let locales: Vec<Locale> = r.catalog().locales().cloned().collect();
    assert!(locales.len() >= 2, "expected at least en + ja, got {locales:?}");

    for locale in &locales {
        for email in samples() {
            let out = r
                .render(&email, locale)
                .unwrap_or_else(|e| panic!("[{locale}] {email:?}: {e}"));
            for (what, s) in [("subject", &out.subject), ("text", &out.text)] {
                assert!(
                    !s.contains('{') && !s.contains('}'),
                    "[{locale}] leftover brace in {what} of {email:?}: {s}"
                );
            }
            assert!(out.html.contains(&format!("lang=\"{locale}\"")), "[{locale}] html lang");
            assert!(!out.subject.trim().is_empty(), "[{locale}] empty subject for {email:?}");
        }
    }
}
