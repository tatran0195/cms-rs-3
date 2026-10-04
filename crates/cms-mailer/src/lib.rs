//! `cms-mailer` provides rich, localized transactional email templating and delivery.
//!
//! Features:
//! - MiniJinja template rendering mirroring `@cms/email` design and structure.
//! - Responsive HTML email container with brand header, divider, and muted footer.
//! - Support for OTP verification codes, action CTA buttons with fallback links, and RTL layouts.
//! - Dual HTML and plain-text output with automatic entity escaping and header sanitization.
//! - Pluggable `Mailer` trait with real SMTP (via `lettre`), `NoopMailer`, `UnconfiguredMailer`, and `MockMailer`.

pub mod i18n;
pub mod render;
pub mod templates;
pub mod transport;
pub mod types;

// Re-exports
pub use i18n::translate;
pub use render::*;
pub use templates::TemplateEngine;
pub use transport::{
    create_mailer, create_mailer_with_noop_fallback, Mailer, MockMailer, NoopMailer, SentEmail,
    SmtpMailer, UnconfiguredMailer,
};
pub use types::*;
