use std::future::Future;
use crate::locale::Locale;

tokio::task_local! {
    static CURRENT_LOCALE: Locale;
}

/// Retrieve the current task's active locale, falling back to default "en".
pub fn current_locale() -> Locale {
    CURRENT_LOCALE
        .try_with(|loc| loc.clone())
        .unwrap_or_else(|_| Locale::default())
}

/// Run a future scoped to a specific requested locale.
pub async fn with_locale<F>(locale: Locale, future: F) -> F::Output
where
    F: Future,
{
    CURRENT_LOCALE.scope(locale, future).await
}
