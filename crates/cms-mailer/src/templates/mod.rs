use minijinja::Environment;

use crate::i18n::translate;
use crate::types::{RenderedEmail, TransactionalEmailProps};

pub const BASE_HTML: &str = include_str!("base.html");
pub const TRANSACTIONAL_HTML: &str = include_str!("transactional.html");
pub const TRANSACTIONAL_TXT: &str = include_str!("transactional.txt");

/// MiniJinja-based template engine for localized transactional and system emails.
#[derive(Clone)]
pub struct TemplateEngine {
    env: Environment<'static>,
}

impl TemplateEngine {
    /// Create a new template engine with embedded templates.
    pub fn new() -> Result<Self, minijinja::Error> {
        let mut env = Environment::new();
        env.add_template("base.html", BASE_HTML)?;
        env.add_template("transactional.html", TRANSACTIONAL_HTML)?;
        env.add_template("transactional.txt", TRANSACTIONAL_TXT)?;
        Ok(Self { env })
    }

    /// Render a transactional email with both HTML and plain-text output.
    pub fn render_transactional(
        &self,
        props: &TransactionalEmailProps,
    ) -> Result<RenderedEmail, minijinja::Error> {
        let lang = &props.language;
        let dir = lang.direction();
        let brand_name = translate(lang, "email.brand.name", &[]);
        let brand_footer = translate(lang, "email.brand.footer", &[]);
        let fallback_link_label = translate(lang, "email.brand.fallbackLink", &[]);

        let (action_label, action_url) = match &props.action {
            Some(action) => (Some(action.label.as_str()), Some(action.url.as_str())),
            None => (None, None),
        };

        let default_logo = "/brand/technostar-logo.png";
        let logo_url = props.logo_url.as_deref().unwrap_or(default_logo);

        let ctx = minijinja::context! {
            title => props.title,
            message => props.message,
            preview => props.preview,
            language => lang.as_str(),
            direction => dir.as_str(),
            brand_name => brand_name,
            brand_footer => brand_footer,
            fallback_link_label => fallback_link_label,
            code => props.code,
            action_label => action_label,
            action_url => action_url,
            detail => props.detail,
            logo_url => logo_url,
        };

        let html = self.env.get_template("transactional.html")?.render(&ctx)?;
        let text = self.env.get_template("transactional.txt")?.render(&ctx)?;

        let subject = props
            .subject
            .clone()
            .unwrap_or_else(|| props.title.clone())
            .replace(['\r', '\n'], " ")
            .trim()
            .to_string();

        Ok(RenderedEmail {
            subject,
            html,
            text,
        })
    }
}

impl Default for TemplateEngine {
    fn default() -> Self {
        Self::new().expect("Failed to initialize default email template engine")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{EmailAction, EmailLanguage};

    #[test]
    fn test_render_transactional_email() {
        let engine = TemplateEngine::new().unwrap();
        let props = TransactionalEmailProps {
            title: "Your verification code".to_string(),
            message: "Use this code to sign in.".to_string(),
            preview: "Use this code to sign in.".to_string(),
            language: EmailLanguage::En,
            subject: Some("Your cms sign-in code".to_string()),
            code: Some("123456".to_string()),
            action: None,
            detail: Some("The code expires in 10 minutes.".to_string()),
            logo_url: None,
        };

        let rendered = engine.render_transactional(&props).unwrap();
        assert_eq!(rendered.subject, "Your cms sign-in code");
        assert!(rendered.html.contains("123456"));
        assert!(rendered.html.contains("lang=\"en\""));
        assert!(rendered.html.contains("dir=\"ltr\""));
        assert!(rendered.html.contains("src=\"/brand/technostar-logo.png\""));
        assert!(rendered.text.contains("123456"));
        assert!(rendered.text.contains("Your verification code"));
    }

    #[test]
    fn test_render_action_button_and_fallback_link() {
        let engine = TemplateEngine::new().unwrap();
        let props = TransactionalEmailProps {
            title: "Verify your email".to_string(),
            message: "Click the button below to verify.".to_string(),
            preview: "Verify your email address.".to_string(),
            language: EmailLanguage::En,
            subject: Some("Verify your email".to_string()),
            code: None,
            action: Some(EmailAction {
                label: "Verify email".to_string(),
                url: "https://example.com/verify?token=abc&next=<home>".to_string(),
            }),
            detail: None,
            logo_url: Some("https://cdn.example.com/custom-logo.png".to_string()),
        };

        let rendered = engine.render_transactional(&props).unwrap();
        // MiniJinja auto-escapes HTML entities in href and text
        assert!(rendered.html.contains("token=abc&amp;next=&lt;home&gt;"));
        assert!(!rendered.html.contains("next=<home>"));
        assert!(rendered
            .html
            .contains("src=\"https://cdn.example.com/custom-logo.png\""));
        // Text should contain unescaped URL
        assert!(rendered
            .text
            .contains("https://example.com/verify?token=abc&next=<home>"));
    }

    #[test]
    fn test_render_japanese() {
        let engine = TemplateEngine::new().unwrap();
        let props = TransactionalEmailProps {
            title: "新しいサインインを検出しました".to_string(),
            message: "新しいデバイスからのアカウントへのサインインを検出しました。".to_string(),
            preview: "新しいデバイスまたは場所からのサインインを検出しました。".to_string(),
            language: EmailLanguage::Ja,
            subject: Some("CMS アカウントへの新しいサインイン".to_string()),
            code: None,
            action: None,
            detail: None,
            logo_url: None,
        };

        let rendered = engine.render_transactional(&props).unwrap();
        assert!(rendered.html.contains("dir=\"ltr\""));
        assert!(rendered.html.contains("lang=\"ja\""));
        assert!(rendered.html.contains("src=\"/brand/technostar-logo.png\""));
        assert!(rendered
            .text
            .contains("新しいデバイスからのアカウントへのサインインを検出しました。"));
    }
}
