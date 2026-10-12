//! The message catalog: load, resolve, format, audit.
//!
//! Source format = the flat Paraglide / inlang file shared with the web UI
//! (`packages/i18n/messages/{locale}.json`): `{ "$schema": "...", "key": "text {var}" }`.
//! This module knows nothing about email: callers choose which key *namespace*
//! (prefix) they need, so the same code can later serve API error messages, etc.

use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs,
    path::Path,
};

use serde_json::{Map, Value};

use super::{
    locale::{Locale, LocaleError},
    message::{Args, Message, MissingArg, ParseError},
};

type Bundle = HashMap<Box<str>, Message>;

/// Failure while building a catalog (boot-time).
#[derive(Debug, thiserror::Error)]
pub enum CatalogError {
    #[error("[{locale}] invalid JSON: {source}")]
    Json { locale: String, source: serde_json::Error },
    #[error("[{locale}] `{key}` must be a plain string (message variants are not supported inside the loaded namespace)")]
    UnsupportedValue { locale: String, key: String },
    #[error("[{locale}] `{key}`: {source}")]
    Message { locale: String, key: String, source: ParseError },
    #[error(transparent)]
    Locale(#[from] LocaleError),
    #[error("cannot read `{path}`: {source}")]
    Io { path: String, source: std::io::Error },
    #[error("default locale `{0}` has no messages")]
    MissingDefault(String),
}

/// Failure while formatting a message (runtime).
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum I18nError {
    #[error("no message `{key}` for locale `{locale}` or any fallback")]
    MissingKey { key: String, locale: String },
    #[error("message `{key}` needs argument `{var}`")]
    MissingArg { key: String, var: String },
}

/// Result of [`Catalog::audit`]. `errors` must fail the boot; `warnings` belong in CI.
#[derive(Debug, Default, Clone)]
pub struct Audit {
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

impl Audit {
    pub fn is_ok(&self) -> bool {
        self.errors.is_empty()
    }
    pub fn is_clean(&self) -> bool {
        self.errors.is_empty() && self.warnings.is_empty()
    }
}

/// Collects JSON sources, then freezes them into an immutable [`Catalog`].
///
/// Sources are merged per locale; **later additions win**, so
/// `embedded → add_dir(override_dir)` gives operators a hot-fix path without a rebuild.
#[derive(Debug)]
pub struct CatalogBuilder {
    default: Locale,
    namespaces: Vec<String>,
    bundles: BTreeMap<Locale, Bundle>,
}

impl CatalogBuilder {
    pub fn new(default: Locale) -> Self {
        Self { default, namespaces: Vec::new(), bundles: BTreeMap::new() }
    }

    /// Keep only keys starting with `prefix` (repeatable). With no namespace everything is kept.
    /// Filtered-out entries are skipped *before* inspection, so unrelated UI messages
    /// (including Paraglide variant arrays) cannot break the server.
    #[must_use]
    pub fn namespace(mut self, prefix: impl Into<String>) -> Self {
        self.namespaces.push(prefix.into());
        self
    }

    /// Add one locale's JSON document using mutable reference.
    pub fn append_json(&mut self, locale: &str, json: &str) -> Result<(), CatalogError> {
        let locale = Locale::parse(locale)?;
        let map: Map<String, Value> = serde_json::from_str(json)
            .map_err(|source| CatalogError::Json { locale: locale.to_string(), source })?;

        let namespaces = &self.namespaces;
        let bundle = self.bundles.entry(locale.clone()).or_default();
        for (key, value) in map {
            let wanted = !key.starts_with('$')
                && (namespaces.is_empty() || namespaces.iter().any(|ns| key.starts_with(ns.as_str())));
            if !wanted {
                continue;
            }
            let Value::String(text) = value else {
                return Err(CatalogError::UnsupportedValue { locale: locale.to_string(), key });
            };
            let message = Message::parse(&text).map_err(|source| CatalogError::Message {
                locale: locale.to_string(),
                key: key.clone(),
                source,
            })?;
            bundle.insert(key.into_boxed_str(), message);
        }
        Ok(())
    }

    /// Add one locale's JSON document.
    pub fn add_json(mut self, locale: &str, json: &str) -> Result<Self, CatalogError> {
        self.append_json(locale, json)?;
        Ok(self)
    }

    /// Add every `{locale}.json` in `dir` (file stem = locale tag, e.g. `zh-CN.json`).
    pub fn add_dir(mut self, dir: &Path) -> Result<Self, CatalogError> {
        let io = |path: &Path| {
            let path = path.display().to_string();
            move |source| CatalogError::Io { path, source }
        };
        let mut files: Vec<_> = fs::read_dir(dir)
            .map_err(io(dir))?
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|p| p.extension().is_some_and(|e| e == "json"))
            .collect();
        files.sort(); // deterministic merge order
        for path in files {
            let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else { continue };
            let json = fs::read_to_string(&path).map_err(io(&path))?;
            self = self.add_json(stem, &json)?;
        }
        Ok(self)
    }

    pub fn build(self) -> Result<Catalog, CatalogError> {
        if self.bundles.get(&self.default).is_none_or(HashMap::is_empty) {
            return Err(CatalogError::MissingDefault(self.default.to_string()));
        }
        Ok(Catalog { default: self.default, bundles: self.bundles })
    }
}

/// Immutable, `Send + Sync` message store. Share it behind an `Arc`.
#[derive(Debug)]
pub struct Catalog {
    default: Locale,
    bundles: BTreeMap<Locale, Bundle>,
}

impl Catalog {
    pub fn builder(default: Locale) -> CatalogBuilder {
        CatalogBuilder::new(default)
    }

    pub fn default_locale(&self) -> &Locale {
        &self.default
    }

    /// Locales that have a bundle, sorted.
    pub fn locales(&self) -> impl Iterator<Item = &Locale> {
        self.bundles.keys()
    }

    /// Bundles usable for `locale`, best first, **without** the default fallback:
    /// exact → parents (`zh-Hant-TW` → `zh-Hant` → `zh`) → other regions of the same
    /// language (`zh-TW` → `zh-CN` if that is all we have).
    fn candidates(&self, locale: &Locale) -> Vec<(&Locale, &Bundle)> {
        let mut out: Vec<(&Locale, &Bundle)> = Vec::new();
        let mut cur = Some(locale.clone());
        while let Some(l) = cur {
            if let Some(entry) = self.bundles.get_key_value(&l) {
                out.push(entry);
            }
            cur = l.parent();
        }
        for entry in &self.bundles {
            if entry.0.language() == locale.language() && !out.iter().any(|(l, _)| *l == entry.0) {
                out.push((entry.0, entry.1));
            }
        }
        out
    }

    /// `candidates` + the default locale as the final safety net.
    fn chain(&self, locale: &Locale) -> Vec<(&Locale, &Bundle)> {
        let mut out = self.candidates(locale);
        if !out.iter().any(|(l, _)| **l == self.default) {
            if let Some(entry) = self.bundles.get_key_value(&self.default) {
                out.push(entry);
            }
        }
        out
    }

    /// Pick the best available locale for a priority-ordered list of requested tags
    /// (user preference first, then `Accept-Language` entries, …). Unparsable tags are
    /// skipped; falls back to the default locale.
    pub fn negotiate<'a>(&self, requested: impl IntoIterator<Item = &'a str>) -> Locale {
        for tag in requested {
            if let Ok(locale) = Locale::parse(tag) {
                if let Some((best, _)) = self.candidates(&locale).first() {
                    return (*best).clone();
                }
            }
        }
        self.default.clone()
    }

    /// Format `key` for `locale`, falling back per key through the locale chain.
    pub fn format(&self, locale: &Locale, key: &str, args: &Args) -> Result<String, I18nError> {
        self.format_first_of(locale, &[key], key, args)
    }

    /// Format a plural group: tries `<key>_<category>`, then `<key>_other`, then the bare
    /// `<key>` (legacy single form) — in each bundle of the chain before moving to the next,
    /// so a half-translated locale never leaks the default language when it has *a* form.
    /// `count` is also exposed to the template as `{count_var}`.
    ///
    /// Plural categories for integers are built in for the common languages; for Slavic,
    /// Arabic, … swap [`plural_category`] for `icu_plurals` (see its docs).
    pub fn format_plural(
        &self,
        locale: &Locale,
        key: &str,
        count_var: &'static str,
        count: u64,
        args: &Args,
    ) -> Result<String, I18nError> {
        let specific = format!("{key}_{}", plural_category(locale.language(), count));
        let other = format!("{key}_other");
        let args = args.clone().with(count_var, count);
        self.format_first_of(locale, &[&specific, &other, key], key, &args)
    }

    fn format_first_of(
        &self,
        locale: &Locale,
        keys: &[&str],
        display_key: &str,
        args: &Args,
    ) -> Result<String, I18nError> {
        let chain = self.chain(locale);
        let (found_in, message) = chain
            .iter()
            .find_map(|(l, bundle)| keys.iter().find_map(|k| bundle.get(*k)).map(|m| (*l, m)))
            .ok_or_else(|| I18nError::MissingKey {
                key: display_key.to_owned(),
                locale: locale.to_string(),
            })?;

        // Only a *translation gap* is worth a warning; "no bundle for this locale at all"
        // is an expected, silent fallback.
        if chain.first().is_some_and(|(l, _)| *l == locale) && found_in != locale {
            tracing::warn!(%locale, key = display_key, fallback = %found_in, "translation missing, using fallback");
        }

        message
            .render(args)
            .map_err(|MissingArg(var)| I18nError::MissingArg { key: display_key.to_owned(), var })
    }

    /// Verify the catalog against what the code needs. Run once at boot (errors) and in CI
    /// (errors **and** warnings).
    ///
    /// * `required` — keys the default locale must contain verbatim.
    /// * `plural_bases` — plural groups; the default locale needs `<base>_other` (or bare `<base>`).
    ///
    /// Errors: missing required keys in the default locale; a translation using a placeholder
    /// the default does not have (the code could never supply it).
    /// Warnings: keys missing from other locales; keys nothing uses (typos/orphans).
    pub fn audit(&self, required: &[&str], plural_bases: &[&str]) -> Audit {
        let mut audit = Audit::default();
        let Some(base) = self.bundles.get(&self.default) else { return audit };
        let known: HashSet<&str> = required.iter().copied().collect();

        for key in required {
            if !base.contains_key(*key) {
                audit.errors.push(format!("[{}] missing required key `{key}`", self.default));
            }
        }
        for b in plural_bases {
            if !base.contains_key(format!("{b}_other").as_str()) && !base.contains_key(*b) {
                audit.errors.push(format!(
                    "[{}] missing plural group `{b}` (provide `{b}_other`)",
                    self.default
                ));
            }
        }

        let reference = |key: &str| -> Option<&Message> {
            match plural_base(key, plural_bases) {
                Some(b) => base.get(format!("{b}_other").as_str()).or_else(|| base.get(b)),
                None => base.get(key),
            }
        };

        for (locale, bundle) in &self.bundles {
            let mut entries: Vec<(&Box<str>, &Message)> = bundle.iter().collect();
            entries.sort_by(|a, b| a.0.cmp(b.0));

            for (key, message) in entries {
                if !known.contains(&**key) && plural_base(key, plural_bases).is_none() {
                    audit.warnings.push(format!("[{locale}] `{key}` is not used by this crate (orphan or typo?)"));
                    continue;
                }
                let Some(expected) = reference(key) else { continue };
                for var in message.vars() {
                    if !expected.vars().any(|v| v == var) {
                        audit.errors.push(format!(
                            "[{locale}] `{key}` uses {{{var}}}, which the `{}` text does not provide",
                            self.default
                        ));
                    }
                }
            }

            if *locale != self.default {
                for key in required {
                    if !bundle.contains_key(*key) {
                        audit.warnings.push(format!("[{locale}] missing `{key}` (falls back to `{}`)", self.default));
                    }
                }
                for b in plural_bases {
                    if !bundle.keys().any(|k| plural_base(k, std::slice::from_ref(b)).is_some()) {
                        audit.warnings.push(format!("[{locale}] missing plural group `{b}` (falls back to `{}`)", self.default));
                    }
                }
            }
        }
        audit
    }
}

const PLURAL_SUFFIXES: [&str; 6] = ["zero", "one", "two", "few", "many", "other"];

/// `Some(base)` when `key` is `base` itself or `base_<category>`.
fn plural_base<'b>(key: &str, bases: &[&'b str]) -> Option<&'b str> {
    bases.iter().copied().find(|b| {
        key == *b
            || key
                .strip_prefix(b)
                .and_then(|rest| rest.strip_prefix('_'))
                .is_some_and(|suffix| PLURAL_SUFFIXES.contains(&suffix))
    })
}

/// CLDR plural category for a non-negative integer.
///
/// Covers the languages this product ships or is likely to (no plural distinction in
/// `ja`/`zh`/`ko`/`vi`/`th`/`id`/`ms`; `one` = 1 elsewhere, 0–1 in `fr`). Languages with
/// richer rules (ru, pl, cs, ar, …) need `icu_plurals::PluralRules` here — a drop-in
/// replacement for this one function.
fn plural_category(language: &str, n: u64) -> &'static str {
    match language {
        "ja" | "zh" | "ko" | "vi" | "th" | "id" | "ms" | "lo" | "my" | "km" => "other",
        "fr" => if n <= 1 { "one" } else { "other" },
        _ => if n == 1 { "one" } else { "other" },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn loc(s: &str) -> Locale {
        Locale::parse(s).unwrap()
    }

    fn catalog(sources: &[(&str, &str)]) -> Catalog {
        let mut b = Catalog::builder(loc("en")).namespace("t_");
        for (l, json) in sources {
            b = b.add_json(l, json).unwrap();
        }
        b.build().unwrap()
    }

    const EN: &str = r#"{
        "$schema": "https://inlang.com/schema/inlang-message-format",
        "ui_ignored": ["not", "a", "string"],
        "t_hello": "Hello {name}",
        "t_only_en": "English only",
        "t_days_one": "{days} day",
        "t_days_other": "{days} days",
        "t_legacy": "{n} items"
    }"#;
    const JA: &str = r#"{ "t_hello": "こんにちは {name}", "t_days_other": "{days} 日間" }"#;

    #[test]
    fn namespace_filters_and_skips_schema_and_foreign_variants() {
        let c = catalog(&[("en", EN)]);
        assert_eq!(c.format(&loc("en"), "t_hello", &Args::new().with("name", "Ta")).unwrap(), "Hello Ta");
        assert!(matches!(c.format(&loc("en"), "ui_ignored", &Args::new()), Err(I18nError::MissingKey { .. })));
    }

    #[test]
    fn variants_inside_the_namespace_fail_loudly() {
        let err = Catalog::builder(loc("en"))
            .namespace("t_")
            .add_json("en", r#"{ "t_x": [{ "match": {} }] }"#)
            .unwrap_err();
        assert!(matches!(err, CatalogError::UnsupportedValue { .. }));
    }

    #[test]
    fn malformed_message_reports_locale_and_key() {
        let err = Catalog::builder(loc("en")).add_json("en", r#"{ "t_bad": "oops {name" }"#).unwrap_err();
        let text = err.to_string();
        assert!(text.contains("[en]") && text.contains("t_bad"), "{text}");
    }

    #[test]
    fn per_key_fallback_to_default() {
        let c = catalog(&[("en", EN), ("ja", JA)]);
        let ja = loc("ja");
        assert_eq!(c.format(&ja, "t_hello", &Args::new().with("name", "Ta")).unwrap(), "こんにちは Ta");
        assert_eq!(c.format(&ja, "t_only_en", &Args::new()).unwrap(), "English only");
    }

    #[test]
    fn region_and_sibling_fallback() {
        let c = catalog(&[("en", EN), ("ja", JA), ("zh-CN", r#"{ "t_hello": "你好 {name}" }"#)]);
        let args = Args::new().with("name", "Ta");
        assert_eq!(c.format(&loc("ja-JP"), "t_hello", &args).unwrap(), "こんにちは Ta"); // drop region
        assert_eq!(c.format(&loc("zh-TW"), "t_hello", &args).unwrap(), "你好 Ta"); // sibling
        assert_eq!(c.format(&loc("fr"), "t_hello", &args).unwrap(), "Hello Ta"); // default
    }

    #[test]
    fn negotiation_respects_priority_and_skips_junk() {
        let c = catalog(&[("en", EN), ("ja", JA)]);
        assert_eq!(c.negotiate(["fr-FR", "ja-JP", "en"]), loc("ja"));
        assert_eq!(c.negotiate(["???", "de"]), loc("en"));
        assert_eq!(c.negotiate([]), loc("en"));
        assert_eq!(c.negotiate(["en-GB"]), loc("en"));
    }

    #[test]
    fn plural_forms() {
        let c = catalog(&[("en", EN), ("ja", JA)]);
        let f = |l: &str, n| c.format_plural(&loc(l), "t_days", "days", n, &Args::new()).unwrap();
        assert_eq!(f("en", 1), "1 day");
        assert_eq!(f("en", 7), "7 days");
        assert_eq!(f("en", 0), "0 days");
        assert_eq!(f("ja", 1), "1 日間"); // ja has only `other`
        // `de` has no bundle → default text, still correct for the count.
        assert_eq!(f("de", 1), "1 day");
    }

    #[test]
    fn plural_falls_back_to_bare_legacy_key() {
        let c = catalog(&[("en", EN)]);
        let out = c.format_plural(&loc("en"), "t_legacy", "n", 1, &Args::new()).unwrap();
        assert_eq!(out, "1 items");
    }

    #[test]
    fn half_translated_locale_keeps_its_own_language() {
        // `de` provides only the `other` form; n = 1 must not jump to English `_one`.
        let c = catalog(&[("en", EN), ("de", r#"{ "t_days_other": "{days} Tage" }"#)]);
        let out = c.format_plural(&loc("de"), "t_days", "days", 1, &Args::new()).unwrap();
        assert_eq!(out, "1 Tage");
    }

    #[test]
    fn errors_are_specific() {
        let c = catalog(&[("en", EN)]);
        assert_eq!(
            c.format(&loc("en"), "t_hello", &Args::new()),
            Err(I18nError::MissingArg { key: "t_hello".into(), var: "name".into() })
        );
        assert!(matches!(c.format(&loc("en"), "t_nope", &Args::new()), Err(I18nError::MissingKey { .. })));
    }

    #[test]
    fn later_sources_override_earlier_ones() {
        let c = Catalog::builder(loc("en"))
            .add_json("en", r#"{ "t_a": "old", "t_b": "kept" }"#).unwrap()
            .add_json("en", r#"{ "t_a": "new" }"#).unwrap()
            .build().unwrap();
        assert_eq!(c.format(&loc("en"), "t_a", &Args::new()).unwrap(), "new");
        assert_eq!(c.format(&loc("en"), "t_b", &Args::new()).unwrap(), "kept");
    }

    #[test]
    fn build_requires_default_locale() {
        let err = Catalog::builder(loc("en")).add_json("ja", JA).unwrap().build().unwrap_err();
        assert!(matches!(err, CatalogError::MissingDefault(_)));
    }

    #[test]
    fn audit_flags_what_matters() {
        let c = catalog(&[
            ("en", EN),
            (
                "ja",
                r#"{ "t_hello": "{name} {extra}", "t_typo_key": "x", "t_days_other": "{days} 日間" }"#,
            ),
        ]);
        let a = c.audit(&["t_hello", "t_only_en", "t_absent"], &["t_days", "t_legacy"]);
        // errors: default lacks a required key; ja invents a placeholder
        assert!(a.errors.iter().any(|e| e.contains("missing required key `t_absent`")), "{:?}", a.errors);
        assert!(a.errors.iter().any(|e| e.contains("[ja]") && e.contains("{extra}")), "{:?}", a.errors);
        // warnings: ja lacks t_only_en; ja has an unused key
        assert!(a.warnings.iter().any(|w| w.contains("[ja] missing `t_only_en`")), "{:?}", a.warnings);
        assert!(a.warnings.iter().any(|w| w.contains("t_typo_key")), "{:?}", a.warnings);
        assert!(!a.is_ok());
    }

    #[test]
    fn audit_is_clean_for_a_consistent_catalog() {
        let c = catalog(&[("en", EN), ("ja", r#"{ "t_hello": "{name}", "t_only_en": "x", "t_days_other": "{days}" }"#)]);
        let a = c.audit(&["t_hello", "t_only_en"], &["t_days", "t_legacy"]);
        assert!(a.errors.is_empty(), "{:?}", a.errors);
        // ja lacks the `t_legacy` group → one warning only
        assert_eq!(a.warnings.len(), 1, "{:?}", a.warnings);
    }
}
