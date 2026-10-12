//! `cms-mailer` — localised transactional email: composition, templating, delivery.
//!
//! ```text
//!  packages/i18n/messages/{locale}.json   (shared with the web UI, Paraglide format)
//!        │  build.rs keeps the `email_*` keys and embeds them
//!        ▼
//!  i18n::Catalog ──audit at boot──► EmailRenderer::render(&Email, &Locale)
//!                                        │ compose: which keys + arguments
//!                                        ▼
//!                                   templates::TemplateEngine (layout only)
//!                                        ▼
//!                                   RenderedEmail ──► transport::Mailer
//! ```
//!
//! * **One source of truth** for strings: no translation lives in Rust.
//! * **Fail at boot, not at send time**: missing keys / bad placeholders abort startup.
//! * **Open locale set**: adding a language = adding `{locale}.json`, no code change.

pub mod email;
pub mod error;
pub mod i18n;
pub mod keys;
pub mod render;
pub mod templates;
pub mod transport;
pub mod types;

mod embedded {
    include!(concat!(env!("OUT_DIR"), "/embedded_messages.rs"));
}

pub use email::Email;
pub use error::RenderError;
pub use i18n::{accept_language_tags, Catalog, Locale};
pub use render::{embedded_catalog_builder, EmailRenderer};
pub use templates::TemplateEngine;
pub use transport::{
    create_mailer, create_mailer_with_noop_fallback, Mailer, MockMailer, NoopMailer, SentEmail,
    SmtpMailer, UnconfiguredMailer,
};
pub use types::*;
