use crate::i18n::{CatalogError, I18nError, LocaleError};

/// Everything that can go wrong while building or using an [`EmailRenderer`](crate::EmailRenderer).
#[derive(Debug, thiserror::Error)]
pub enum RenderError {
    /// Translations could not be loaded or parsed (boot-time).
    #[error(transparent)]
    Catalog(#[from] CatalogError),
    /// Translations loaded but do not satisfy what the code needs (boot-time).
    #[error("invalid email translations:\n{0}")]
    InvalidCatalog(String),
    /// A message could not be formatted (missing key/argument).
    #[error(transparent)]
    I18n(#[from] I18nError),
    #[error("email template error: {0}")]
    Template(#[from] minijinja::Error),
    #[error(transparent)]
    Locale(#[from] LocaleError),
}
