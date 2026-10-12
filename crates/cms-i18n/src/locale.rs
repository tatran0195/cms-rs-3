//! Locale identifiers.
//!
//! A [`Locale`] is a *validated, canonicalised* BCP-47 tag (`en`, `ja`, `zh-CN`,
//! `zh-Hant-TW`). It replaces the old closed `EmailLanguage` enum: adding a
//! language is now a data change (drop a `{locale}.json` file), not a code change.

use std::{fmt, str::FromStr, sync::Arc};

use serde::{Deserialize, Serialize};

/// Text direction of a locale.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
pub enum Direction {
    #[default]
    Ltr,
    Rtl,
}

impl Direction {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Ltr => "ltr",
            Self::Rtl => "rtl",
        }
    }
}

impl fmt::Display for Direction {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Rejected locale tag.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("invalid locale tag `{0}`")]
pub struct LocaleError(pub String);

/// Languages written right-to-left when no explicit script subtag is present.
const RTL_LANGUAGES: &[&str] = &[
    "ar", "arc", "ckb", "dv", "fa", "he", "ks", "ps", "sd", "ug", "ur", "yi",
];
/// Scripts that are right-to-left.
const RTL_SCRIPTS: &[&str] = &["Arab", "Hebr", "Thaa", "Syrc", "Nkoo", "Adlm", "Rohg"];

/// A canonical BCP-47 language tag. Cheap to clone (`Arc<str>`).
#[derive(Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct Locale(Arc<str>);

impl Default for Locale {
    fn default() -> Self {
        Self("en".into())
    }
}

impl Locale {
    /// Parse and canonicalise a tag: `zh_cn` → `zh-CN`, `ZH-hant-tw` → `zh-Hant-TW`.
    ///
    /// Accepts `-` or `_` separators. Rejects empty/oversized input and subtags
    /// that are not 1–8 ASCII alphanumerics.
    pub fn parse(tag: &str) -> Result<Self, LocaleError> {
        let tag = tag.trim();
        let err = || LocaleError(tag.to_owned());
        if tag.is_empty() || tag.len() > 35 {
            return Err(err());
        }

        let mut out = String::with_capacity(tag.len());
        let mut script_allowed = true;
        let mut region_allowed = true;

        for (i, sub) in tag.split(['-', '_']).enumerate() {
            let bytes = sub.as_bytes();
            if !(1..=8).contains(&bytes.len()) || !bytes.iter().all(u8::is_ascii_alphanumeric) {
                return Err(err());
            }
            let alpha = bytes.iter().all(u8::is_ascii_alphabetic);
            let digits = bytes.iter().all(u8::is_ascii_digit);

            if i == 0 {
                if !alpha || !(2..=3).contains(&bytes.len()) {
                    return Err(err());
                }
                out.push_str(&sub.to_ascii_lowercase());
                continue;
            }

            out.push('-');
            if script_allowed && alpha && bytes.len() == 4 {
                // Script: Titlecase.
                out.push_str(&sub[..1].to_ascii_uppercase());
                out.push_str(&sub[1..].to_ascii_lowercase());
                script_allowed = false;
            } else if region_allowed && ((alpha && bytes.len() == 2) || (digits && bytes.len() == 3))
            {
                // Region: UPPERCASE.
                out.push_str(&sub.to_ascii_uppercase());
                script_allowed = false;
                region_allowed = false;
            } else {
                // Variants / extensions: lowercase, no further script/region.
                out.push_str(&sub.to_ascii_lowercase());
                script_allowed = false;
                region_allowed = false;
            }
        }
        Ok(Self(out.into()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Primary language subtag (`zh` for `zh-Hant-TW`).
    pub fn language(&self) -> &str {
        self.0.split('-').next().unwrap_or(&self.0)
    }

    /// Script subtag, if present (`Hant`).
    pub fn script(&self) -> Option<&str> {
        self.0
            .split('-')
            .nth(1)
            .filter(|s| s.len() == 4 && s.bytes().all(|b| b.is_ascii_alphabetic()))
    }

    /// Region subtag, if present (`TW`, `419`).
    pub fn region(&self) -> Option<&str> {
        self.0
            .split('-')
            .skip(1)
            .take(2)
            .find(|s| (s.len() == 2 && s.bytes().all(|b| b.is_ascii_alphabetic())) || (s.len() == 3 && s.bytes().all(|b| b.is_ascii_digit())))
    }

    /// Text direction. An explicit script wins (`ku-Arab` is RTL, `ku` is not);
    /// otherwise the primary language decides. Matches whole subtags — never prefixes.
    pub fn direction(&self) -> Direction {
        let rtl = match self.script() {
            Some(script) => RTL_SCRIPTS.contains(&script),
            None => RTL_LANGUAGES.contains(&self.language()),
        };
        if rtl {
            Direction::Rtl
        } else {
            Direction::Ltr
        }
    }

    /// The tag with its last subtag removed (`zh-Hant-TW` → `zh-Hant` → `zh` → `None`).
    pub fn parent(&self) -> Option<Self> {
        self.0.rsplit_once('-').map(|(head, _)| Self(head.into()))
    }
}

impl fmt::Debug for Locale {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Locale({})", self.0)
    }
}

impl fmt::Display for Locale {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl FromStr for Locale {
    type Err = LocaleError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::parse(s)
    }
}

impl TryFrom<String> for Locale {
    type Error = LocaleError;
    fn try_from(value: String) -> Result<Self, Self::Error> {
        Self::parse(&value)
    }
}

impl From<Locale> for String {
    fn from(value: Locale) -> Self {
        value.0.to_string()
    }
}

impl AsRef<str> for Locale {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

/// Extract language tags from an `Accept-Language` header, best first.
///
/// `en-US,en;q=0.9,ja;q=0.8,*;q=0.1` → `["en-US", "en", "ja"]`. Entries with
/// `q=0`, the `*` wildcard and unparsable q-values are dropped; equal weights keep
/// header order. Feed the result to `Catalog::negotiate`.
pub fn accept_language_tags(header: &str) -> Vec<&str> {
    let mut items: Vec<(&str, f32)> = header
        .split(',')
        .filter_map(|part| {
            let mut pieces = part.split(';');
            let tag = pieces.next()?.trim();
            if tag.is_empty() || tag == "*" {
                return None;
            }
            let q = pieces
                .find_map(|p| p.trim().strip_prefix("q="))
                .map_or(Some(1.0), |v| v.trim().parse::<f32>().ok())?;
            (q > 0.0).then_some((tag, q))
        })
        .collect();
    items.sort_by(|a, b| b.1.total_cmp(&a.1)); // stable: ties keep header order
    items.into_iter().map(|(tag, _)| tag).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn loc(s: &str) -> Locale {
        Locale::parse(s).unwrap()
    }

    #[test]
    fn canonicalises_case_and_separator() {
        assert_eq!(loc("zh_cn").as_str(), "zh-CN");
        assert_eq!(loc("ZH-hant-tw").as_str(), "zh-Hant-TW");
        assert_eq!(loc(" EN ").as_str(), "en");
        assert_eq!(loc("es-419").as_str(), "es-419");
    }

    #[test]
    fn rejects_garbage() {
        for bad in ["", "e", "english", "en-", "en--US", "en-US-!!", "123", "en-waytoolongsubtag"] {
            assert!(Locale::parse(bad).is_err(), "{bad} should be rejected");
        }
    }

    #[test]
    fn exposes_subtags() {
        let l = loc("zh-Hant-TW");
        assert_eq!((l.language(), l.script(), l.region()), ("zh", Some("Hant"), Some("TW")));
        let l = loc("ja");
        assert_eq!((l.script(), l.region()), (None, None));
        assert_eq!(loc("en-GB").region(), Some("GB"));
    }

    #[test]
    fn parent_chain() {
        let mut l = loc("zh-Hant-TW");
        let mut seen = vec![l.to_string()];
        while let Some(p) = l.parent() {
            seen.push(p.to_string());
            l = p;
        }
        assert_eq!(seen, ["zh-Hant-TW", "zh-Hant", "zh"]);
    }

    #[test]
    fn rtl_detection_uses_whole_subtags() {
        for rtl in ["ar", "ar-EG", "he", "fa", "ur-PK", "ku-Arab", "az-Arab"] {
            assert_eq!(loc(rtl).direction(), Direction::Rtl, "{rtl}");
        }
        // The old prefix check misclassified none of these as RTL and missed `ar` entirely.
        for ltr in ["en", "ja", "zh-CN", "ku", "fao", "hi", "ur-Latn"] {
            assert_eq!(loc(ltr).direction(), Direction::Ltr, "{ltr}");
        }
    }

    #[test]
    fn serde_round_trip_validates() {
        let l: Locale = serde_json::from_str("\"zh_cn\"").unwrap();
        assert_eq!(serde_json::to_string(&l).unwrap(), "\"zh-CN\"");
        assert!(serde_json::from_str::<Locale>("\"not a tag\"").is_err());
    }

    #[test]
    fn accept_language_ordering() {
        assert_eq!(
            accept_language_tags("en-US,en;q=0.9,ja;q=0.8,*;q=0.1, fr;q=0"),
            ["en-US", "en", "ja"]
        );
        assert_eq!(accept_language_tags("ja;q=0.5, vi;q=0.9, en;q=0.9"), ["vi", "en", "ja"]);
        assert!(accept_language_tags("").is_empty());
    }
}
