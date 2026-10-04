use cms_mailer::{
    render_deployment_email, render_email_verification_email, render_member_invitation_email,
    render_member_joined_email, render_new_sign_in_email, render_reader_invitation_email,
    render_verification_code_email, DeploymentOutcome, EmailLanguage, VerificationPurpose,
};

#[test]
fn test_renders_english_verification_code_with_plain_text() {
    let email = render_verification_code_email(
        "123456",
        VerificationPurpose::SignIn,
        Some(EmailLanguage::En),
    )
    .unwrap();

    assert_eq!(email.subject, "Your cms sign-in code");
    assert!(email.html.contains("lang=\"en\""));
    assert!(email.html.contains("123456"));
    assert!(email.text.contains("123456"));
    assert!(email.text.contains("Your cms code"));
}

#[test]
fn test_renders_japanese_email() {
    let email = render_new_sign_in_email(None, Some(EmailLanguage::Ja)).unwrap();

    assert_eq!(email.subject, "CMS アカウントへの新しいサインイン");
    assert!(email.html.contains("lang=\"ja\""));
    assert!(email
        .text
        .contains("新しいデバイスからのアカウントへのサインインを検出しました。"));
}

#[test]
fn test_escapes_dynamic_action_url_in_html_while_preserving_in_text() {
    let email = render_email_verification_email(
        "https://example.com/verify?token=abc&next=<home>",
        Some(EmailLanguage::En),
    )
    .unwrap();

    assert!(email.html.contains("token=abc&amp;next=&lt;home&gt;"));
    assert!(!email.html.contains("next=<home>"));
    assert!(email
        .text
        .contains("https://example.com/verify?token=abc&next=<home>"));
}

#[test]
fn test_renders_member_joined_email() {
    let email = render_member_joined_email("Alice", "Acme Corp", None).unwrap();

    assert_eq!(email.subject, "Alice joined Acme Corp");
    assert!(email.html.contains("Alice"));
    assert!(email.html.contains("Acme Corp"));
    assert!(email.text.contains("Alice just joined Acme Corp"));
}

#[test]
fn test_renders_member_invitation_email() {
    let email = render_member_invitation_email(
        "Bob",
        "Acme Corp",
        "Admin",
        "https://example.com/invite/accept?id=123",
        7,
        None,
    )
    .unwrap();

    assert_eq!(email.subject, "Bob invited you to Acme Corp on cms");
    assert!(email.html.contains("Bob"));
    assert!(email.html.contains("Acme Corp"));
    assert!(email.html.contains("Admin"));
    assert!(email.html.contains("Accept invitation"));
    assert!(email.text.contains("7 days"));
}

#[test]
fn test_renders_reader_invitation_email() {
    let email = render_reader_invitation_email(
        "My Docs Project",
        "https://example.com/reader/activate?key=xyz",
        14,
        None,
    )
    .unwrap();

    assert_eq!(email.subject, "Your access to My Docs Project");
    assert!(email.html.contains("My Docs Project"));
    assert!(email.html.contains("Activate reader access"));
    assert!(email.text.contains("14 days"));
}

#[test]
fn test_renders_deployment_ready_email() {
    let email = render_deployment_email(
        "Docs Site",
        42,
        DeploymentOutcome::Ready,
        Some("https://docs.example.com"),
        None,
        None,
    )
    .unwrap();

    assert_eq!(email.subject, "Docs Site published — v42 is live");
    assert!(email.html.contains("v42 of Docs Site published"));
    assert!(email.html.contains("View site"));
    assert!(email.text.contains("https://docs.example.com"));
}

#[test]
fn test_renders_deployment_failed_email() {
    let email = render_deployment_email(
        "Docs Site",
        42,
        DeploymentOutcome::Failed,
        None,
        Some("Build timeout exceeded"),
        None,
    )
    .unwrap();

    assert_eq!(email.subject, "Docs Site publish failed (v42)");
    assert!(email.html.contains("Publishing version v42"));
    assert!(email.html.contains("Error: Build timeout exceeded"));
    assert!(email.text.contains("Error: Build timeout exceeded"));
}
