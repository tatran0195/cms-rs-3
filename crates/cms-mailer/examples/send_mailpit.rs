use std::fs;
use std::path::Path;

use cms_config::MailerConfig;
use cms_mailer::{
    render_deployment_email, render_email_verification_email, render_member_invitation_email,
    render_member_joined_email, render_new_sign_in_email, render_reader_invitation_email,
    render_verification_code_email, DeploymentOutcome, EmailLanguage, Mailer, RenderedEmail,
    SmtpMailer, VerificationPurpose,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("==================================================");
    println!("  CMS Mailer: Render & Mailpit Test Runner (Japanese)");
    println!("==================================================\n");

    // 1. Prepare emails in English and Japanese
    let emails: Vec<(&'static str, &'static str, RenderedEmail)> = vec![
        (
            "01_verification_code_en",
            "user@example.com",
            render_verification_code_email("849201", VerificationPurpose::SignIn, Some(EmailLanguage::En))?,
        ),
        (
            "02_verification_code_ja",
            "japanese-user@example.com",
            render_verification_code_email("930124", VerificationPurpose::SignIn, Some(EmailLanguage::Ja))?,
        ),
        (
            "03_email_verification_ja",
            "tanaka@example.com",
            render_email_verification_email("http://localhost:3000/verify-email?token=sec_abc123&next=/dashboard", Some(EmailLanguage::Ja))?,
        ),
        (
            "04_member_joined_ja",
            "admin@example.com",
            render_member_joined_email("佐藤 健", "Acme Industries", Some(EmailLanguage::Ja))?,
        ),
        (
            "05_new_sign_in_alert_ja",
            "security@example.com",
            render_new_sign_in_email(Some("198.51.100.42"), Some(EmailLanguage::Ja))?,
        ),
        (
            "06_member_invitation_ja",
            "developer@example.com",
            render_member_invitation_email("田中 太郎", "OpenSource Org", "Editor", "http://localhost:3000/invitations/accept?token=inv_9988", 7, Some(EmailLanguage::Ja))?,
        ),
        (
            "07_reader_invitation_ja",
            "reader@example.com",
            render_reader_invitation_email("API リファレンスガイド", "http://localhost:3000/reader/activate?key=rd_5521", 14, Some(EmailLanguage::Ja))?,
        ),
        (
            "08_deployment_ready_ja",
            "team@example.com",
            render_deployment_email("開発者ポータル", 12, DeploymentOutcome::Ready, Some("https://docs.mycompany.com"), None, Some(EmailLanguage::Ja))?,
        ),
        (
            "09_deployment_failed_ja",
            "devops@example.com",
            render_deployment_email("開発者ポータル", 13, DeploymentOutcome::Failed, None, Some("ビルド失敗: doc/intro.md の 42 行目で構文エラー"), Some(EmailLanguage::Ja))?,
        ),
    ];

    // 2. Save preview files
    let preview_dir = Path::new("previews");
    fs::create_dir_all(preview_dir)?;

    println!("-> Rendering and saving {} email templates to `{}` folder...", emails.len(), preview_dir.display());
    for (name, _, email) in &emails {
        let html_file = preview_dir.join(format!("{}.html", name));
        let txt_file = preview_dir.join(format!("{}.txt", name));
        fs::write(&html_file, &email.html)?;
        fs::write(&txt_file, &email.text)?;
        println!("   [SAVED] {} -> {}", name, html_file.display());
    }
    println!("\nAll HTML and plain-text preview files saved successfully.\n");

    // Check if Mailpit is running, if not start it from target/tools/mailpit.exe
    if tokio::net::TcpStream::connect("127.0.0.1:1025").await.is_err() {
        let exe_path = Path::new("target/tools/mailpit.exe");
        if exe_path.exists() {
            println!("-> Mailpit not detected on localhost:1025. Spawning detached target/tools/mailpit.exe...");
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                const DETACHED_PROCESS: u32 = 0x00000008;
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                let _ = std::process::Command::new(exe_path)
                    .creation_flags(DETACHED_PROCESS | CREATE_NO_WINDOW)
                    .spawn();
            }
            #[cfg(not(windows))]
            {
                let _ = std::process::Command::new(exe_path).spawn();
            }
            tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
        }
    }

    // 3. Connect to Mailpit on localhost:1025
    let mailer_config = MailerConfig {
        smtp_host: Some("localhost".to_string()),
        smtp_port: 1025,
        smtp_username: None,
        smtp_password: None,
        smtp_use_tls: false,
        smtp_plain_no_tls: true,
        from_email: Some("noreply@cms.local".to_string()),
        from_name: Some("CMS Platform".to_string()),
    };

    println!("-> Connecting to Mailpit SMTP server at localhost:1025...");
    let mailer = SmtpMailer::new(mailer_config)?;

    for (name, recipient, email) in &emails {
        print!("   Sending `{}` to <{}>... ", name, recipient);
        match mailer.send_rendered_email(recipient, email).await {
            Ok(_) => println!("[OK]"),
            Err(e) => {
                println!("[FAILED]");
                eprintln!("   Error: {}\n", e);
                eprintln!("   Note: Make sure Mailpit is running on localhost:1025.");
                eprintln!("   You can start Mailpit via: target/tools/mailpit.exe");
                return Err(e.into());
            }
        }
    }

    println!("\n==================================================");
    println!("  All emails sent successfully to Mailpit!");
    println!("  View them in the Mailpit Web UI at:");
    println!("  http://localhost:8025");
    println!("==================================================");

    Ok(())
}
