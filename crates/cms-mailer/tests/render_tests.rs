use cms_mailer::{DeploymentOutcome, Email, EmailRenderer, Locale, VerificationPurpose};

fn renderer() -> EmailRenderer {
    EmailRenderer::embedded().expect("embedded email translations must be valid")
}

fn loc(tag: &str) -> Locale {
    Locale::parse(tag).unwrap()
}

fn otp(purpose: VerificationPurpose, ttl_minutes: u32) -> Email {
    Email::VerificationCode { code: "123456".into(), purpose, ttl_minutes }
}

// ---- ported from the original suite (same assertions) ------------------------------------

#[test]
fn test_renders_english_verification_code_with_plain_text() {
    let email = renderer().render(&otp(VerificationPurpose::SignIn, 10), &loc("en")).unwrap();

    assert_eq!(email.subject, "Your cms sign-in code");
    assert!(email.html.contains("lang=\"en\""));
    assert!(email.html.contains("123456"));
    assert!(email.text.contains("123456"));
    assert!(email.text.contains("Your cms code"));
}

#[test]
fn test_renders_japanese_email() {
    let email = renderer().render(&Email::NewSignIn { ip_address: None }, &loc("ja")).unwrap();

    assert_eq!(email.subject, "CMS アカウントへの新しいサインイン");
    assert!(email.html.contains("lang=\"ja\""));
    assert!(email.text.contains("新しいデバイスからのアカウントへのサインインを検出しました。"));
}

#[test]
fn test_escapes_dynamic_action_url_in_html_while_preserving_in_text() {
    let email = renderer()
        .render(
            &Email::VerifyEmail { url: "https://example.com/verify?token=abc&next=<home>".into() },
            &loc("en"),
        )
        .unwrap();

    assert!(email.html.contains("token=abc&amp;next=&lt;home&gt;"));
    assert!(!email.html.contains("next=<home>"));
    assert!(email.text.contains("https://example.com/verify?token=abc&next=<home>"));
}

#[test]
fn test_renders_member_joined_email() {
    let email = renderer()
        .render(
            &Email::MemberJoined { member_name: "Alice".into(), workspace_name: "Acme Corp".into() },
            &loc("en"),
        )
        .unwrap();

    assert_eq!(email.subject, "Alice joined Acme Corp");
    assert!(email.html.contains("Alice") && email.html.contains("Acme Corp"));
    assert!(email.text.contains("Alice just joined Acme Corp"));
}

#[test]
fn test_renders_member_invitation_email() {
    let email = renderer()
        .render(
            &Email::MemberInvitation {
                inviter_name: "Bob".into(),
                workspace_name: "Acme Corp".into(),
                role: "Admin".into(),
                accept_url: "https://example.com/invite/accept?id=123".into(),
                expires_in_days: 7,
            },
            &loc("en"),
        )
        .unwrap();

    assert_eq!(email.subject, "Bob invited you to Acme Corp on cms");
    assert!(email.html.contains("Admin") && email.html.contains("Accept invitation"));
    assert!(email.text.contains("7 days"));
}

#[test]
fn test_renders_reader_invitation_email() {
    let email = renderer()
        .render(
            &Email::ReaderInvitation {
                project_name: "My Docs Project".into(),
                activation_url: "https://example.com/reader/activate?key=xyz".into(),
                expires_in_days: 14,
            },
            &loc("en"),
        )
        .unwrap();

    assert_eq!(email.subject, "Your access to My Docs Project");
    assert!(email.html.contains("Activate reader access"));
    assert!(email.text.contains("14 days"));
}

#[test]
fn test_renders_deployment_ready_email() {
    let email = renderer()
        .render(
            &Email::Deployment {
                project_name: "Docs Site".into(),
                version: 42,
                outcome: DeploymentOutcome::Ready,
                site_url: Some("https://docs.example.com".into()),
                error: None,
            },
            &loc("en"),
        )
        .unwrap();

    assert_eq!(email.subject, "Docs Site published — v42 is live");
    assert!(email.html.contains("v42 of Docs Site published"));
    assert!(email.html.contains("View site"));
    assert!(email.text.contains("https://docs.example.com"));
}

#[test]
fn test_renders_deployment_failed_email() {
    let email = renderer()
        .render(
            &Email::Deployment {
                project_name: "Docs Site".into(),
                version: 42,
                outcome: DeploymentOutcome::Failed,
                site_url: None,
                error: Some("Build timeout exceeded".into()),
            },
            &loc("en"),
        )
        .unwrap();

    assert_eq!(email.subject, "Docs Site publish failed (v42)");
    assert!(email.html.contains("Publishing version v42"));
    assert!(email.html.contains("Error: Build timeout exceeded"));
    assert!(email.text.contains("Error: Build timeout exceeded"));
}

// ---- behaviour the redesign adds / fixes -------------------------------------------------

#[test]
fn otp_lifetime_comes_from_the_caller_not_a_hardcoded_10() {
    let r = renderer();
    assert!(r.render(&otp(VerificationPurpose::SignIn, 5), &loc("en")).unwrap().text.contains("5 minutes"));
    assert!(r.render(&otp(VerificationPurpose::SignIn, 15), &loc("en")).unwrap().text.contains("15 minutes"));
}

#[test]
fn singular_plural_forms_are_grammatical() {
    let r = renderer();
    let one_minute = r.render(&otp(VerificationPurpose::SignIn, 1), &loc("en")).unwrap();
    assert!(one_minute.text.contains("expires in 1 minute and"), "{}", one_minute.text);

    let invite = |days| Email::MemberInvitation {
        inviter_name: "Bob".into(),
        workspace_name: "Acme".into(),
        role: "Admin".into(),
        accept_url: "https://example.com/i".into(),
        expires_in_days: days,
    };
    assert!(r.render(&invite(1), &loc("en")).unwrap().text.contains("expires in 1 day."));
    assert!(r.render(&invite(2), &loc("en")).unwrap().text.contains("expires in 2 days."));
    assert!(r.render(&invite(1), &loc("ja")).unwrap().text.contains("1 日間"));
}

#[test]
fn user_controlled_values_are_never_reinterpreted_as_placeholders() {
    let email = renderer()
        .render(
            &Email::MemberJoined { member_name: "{workspaceName}".into(), workspace_name: "Acme".into() },
            &loc("en"),
        )
        .unwrap();
    assert_eq!(email.subject, "{workspaceName} joined Acme");
}

#[test]
fn user_controlled_values_are_html_escaped_but_plain_in_text() {
    let email = renderer()
        .render(
            &Email::MemberJoined { member_name: "<img src=x>".into(), workspace_name: "Acme".into() },
            &loc("en"),
        )
        .unwrap();
    assert!(!email.html.contains("<img src=x>"));
    assert!(email.html.contains("&lt;img src=x&gt;"));
    assert!(email.text.contains("<img src=x>"));
}

#[test]
fn layout_follows_the_locale_that_was_actually_served() {
    let r = renderer();
    let e = Email::NewSignIn { ip_address: None };

    // Region is dropped: ja-JP is served by `ja`.
    assert!(r.render(&e, &loc("ja-JP")).unwrap().html.contains("lang=\"ja\""));

    // No Arabic bundle: English text must come with an LTR English shell, not dir="rtl".
    let ar = r.render(&e, &loc("ar")).unwrap();
    assert!(ar.html.contains("lang=\"en\"") && ar.html.contains("dir=\"ltr\""));
}

#[test]
fn negotiation_prefers_user_locale_then_accept_language() {
    let r = renderer();
    let header = cms_mailer::accept_language_tags("fr-FR,fr;q=0.9,ja;q=0.8,en;q=0.5");
    assert_eq!(r.negotiate(header), loc("ja"));
    assert_eq!(r.negotiate(["vi", "en-GB"]), loc("en"));
    assert_eq!(r.negotiate(["definitely not a tag"]), loc("en"));
}

#[test]
fn optional_parts_are_omitted_cleanly() {
    let r = renderer();
    let ready = r
        .render(
            &Email::Deployment {
                project_name: "D".into(), version: 1, outcome: DeploymentOutcome::Ready,
                site_url: None, error: None,
            },
            &loc("en"),
        )
        .unwrap();
    assert!(!ready.html.contains("View site"));

    let failed = r
        .render(
            &Email::Deployment {
                project_name: "D".into(), version: 1, outcome: DeploymentOutcome::Failed,
                site_url: None, error: None,
            },
            &loc("en"),
        )
        .unwrap();
    assert!(!failed.text.contains("Error:"));
}

#[test]
fn emails_round_trip_through_serde_for_a_job_queue() {
    let e = Email::Deployment {
        project_name: "D".into(), version: 3, outcome: DeploymentOutcome::Failed,
        site_url: None, error: Some("boom".into()),
    };
    let json = serde_json::to_string(&e).unwrap();
    assert!(json.contains("\"kind\":\"deployment\"") && json.contains("\"outcome\":\"failed\""), "{json}");
    assert_eq!(serde_json::from_str::<Email>(&json).unwrap(), e);
}
