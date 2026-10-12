//! Generic, dependency-light i18n core: [`Locale`] → [`Catalog`] → formatted text.

pub mod catalog;
pub mod locale;
pub mod message;

pub use catalog::{Audit, Catalog, CatalogBuilder, CatalogError, I18nError};
pub use locale::{accept_language_tags, Direction, Locale, LocaleError};
pub use message::{Args, Message, ParseError};
