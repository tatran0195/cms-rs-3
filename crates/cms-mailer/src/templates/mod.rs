//! Presentation layer: already-translated strings in, HTML + plain text out.
//! No i18n lookups happen here, so layout can be tested (and reused) without a catalog.

use minijinja::Environment;

use crate::{
    i18n::Direction,
    types::{RenderedEmail, TransactionalEmailProps},
};

pub const BASE_HTML: &str = include_str!("base.html");
pub const TRANSACTIONAL_HTML: &str = include_str!("transactional.html");
pub const TRANSACTIONAL_TXT: &str = include_str!("transactional.txt");

/// MiniJinja-based template engine for transactional emails.
#[derive(Clone)]
pub struct TemplateEngine {
    env: Environment<'static>,
}

impl TemplateEngine {
    pub fn new() -> Result<Self, minijinja::Error> {
        let mut env = Environment::new();
        env.add_template("base.html", BASE_HTML)?;
        env.add_template("transactional.html", TRANSACTIONAL_HTML)?;
        env.add_template("transactional.txt", TRANSACTIONAL_TXT)?;
        Ok(Self { env })
    }

    /// Render both the HTML and plain-text bodies.
    pub fn render_transactional(
        &self,
        props: &TransactionalEmailProps,
    ) -> Result<RenderedEmail, minijinja::Error> {
        let lang = &props.language;
        let dir = lang.direction();
        let align = match dir {
            Direction::Ltr => "left",
            Direction::Rtl => "right",
        };

        let (action_label, action_url) = match &props.action {
            Some(action) => (Some(action.label.as_str()), Some(action.url.as_str())),
            None => (None, None),
        };
        let logo_url = props.logo_url.as_deref().unwrap_or("cid:technostar-logo");

        let ctx = minijinja::context! {
            title => &props.title,
            message => &props.message,
            preview => &props.preview,
            language => lang.as_str(),
            direction => dir.as_str(),
            align => align,
            brand_name => &props.brand.name,
            brand_footer => &props.brand.footer,
            fallback_link_label => &props.brand.fallback_link_label,
            code => props.code.as_deref(),
            action_label => action_label,
            action_url => action_url,
            detail => props.detail.as_deref(),
            logo_url => logo_url,
        };

        let html = self.env.get_template("transactional.html")?.render(&ctx)?;
        let text = self.env.get_template("transactional.txt")?.render(&ctx)?;

        // Header-injection guard: a subject can never contain a line break.
        let subject = props
            .subject
            .as_deref()
            .unwrap_or(&props.title)
            .replace(['\r', '\n'], " ")
            .trim()
            .to_owned();

        Ok(RenderedEmail {
            subject,
            html,
            text,
        })
    }
}

impl Default for TemplateEngine {
    fn default() -> Self {
        Self::new().expect("embedded email templates are valid")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        i18n::Locale,
        types::{Brand, EmailAction},
    };

    fn brand() -> Brand {
        Brand {
            name: "TechnoStar".into(),
            footer: "footer".into(),
            fallback_link_label: "copy this link:".into(),
        }
    }

    fn props(lang: &str) -> TransactionalEmailProps {
        TransactionalEmailProps {
            title: "Title".into(),
            message: "Message".into(),
            preview: "Preview".into(),
            language: Locale::parse(lang).unwrap(),
            subject: Some("Subject".into()),
            code: None,
            action: None,
            detail: None,
            logo_url: None,
            brand: brand(),
        }
    }

    #[test]
    fn renders_code_and_default_logo() {
        let engine = TemplateEngine::new().unwrap();
        let mut p = props("en");
        p.code = Some("123456".into());
        p.detail = Some("The code expires in 10 minutes.".into());

        let out = engine.render_transactional(&p).unwrap();
        assert_eq!(out.subject, "Subject");
        assert!(out.html.contains("123456"));
        assert!(out.html.contains("lang=\"en\"") && out.html.contains("dir=\"ltr\""));
        assert!(out.html.contains("src=\"cid:technostar-logo\""));
        assert!(out.text.contains("123456") && out.text.contains("Title"));
    }

    #[test]
    fn escapes_urls_in_html_but_not_in_text() {
        let engine = TemplateEngine::new().unwrap();
        let mut p = props("en");
        p.action = Some(EmailAction {
            label: "Go".into(),
            url: "https://example.com/v?token=abc&next=<home>".into(),
        });
        p.logo_url = Some("https://cdn.example.com/custom-logo.png".into());

        let out = engine.render_transactional(&p).unwrap();
        assert!(out.html.contains("token=abc&amp;next=&lt;home&gt;"));
        assert!(!out.html.contains("next=<home>"));
        assert!(out
            .html
            .contains("src=\"https://cdn.example.com/custom-logo.png\""));
        assert!(out
            .text
            .contains("https://example.com/v?token=abc&next=<home>"));
    }

    #[test]
    fn rtl_locale_flips_dir_and_alignment() {
        let engine = TemplateEngine::new().unwrap();
        let out = engine.render_transactional(&props("ar")).unwrap();
        assert!(out.html.contains("dir=\"rtl\"") && out.html.contains("lang=\"ar\""));
        assert!(out.html.contains("text-align:right"));
        assert!(!out.html.contains("text-align:left"));
    }

    #[test]
    fn preheader_is_inside_body_not_head() {
        let engine = TemplateEngine::new().unwrap();
        let out = engine.render_transactional(&props("en")).unwrap();
        let head_end = out.html.find("</head>").unwrap();
        let preview_at = out.html.find("Preview").unwrap();
        assert!(preview_at > head_end);
    }

    #[test]
    fn subject_cannot_inject_headers() {
        let engine = TemplateEngine::new().unwrap();
        let mut p = props("en");
        p.subject = Some("Hi\r\nBcc: evil@example.com".into());
        let out = engine.render_transactional(&p).unwrap();
        assert!(!out.subject.contains('\n') && !out.subject.contains('\r'));
    }
}
