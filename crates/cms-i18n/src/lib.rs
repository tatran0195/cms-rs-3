//! Generic, dependency-light i18n core: [`Locale`] → [`Catalog`] → formatted text.

pub mod catalog;
pub mod context;
pub mod errors;
pub mod locale;
pub mod message;

pub use catalog::{Audit, Catalog, CatalogBuilder, CatalogError, I18nError};
pub use context::{current_locale, with_locale};
pub use errors::{embedded_catalog, error_code_to_key, localize_error};
pub use locale::{accept_language_tags, Direction, Locale, LocaleError};
pub use message::{Args, Message, ParseError};
