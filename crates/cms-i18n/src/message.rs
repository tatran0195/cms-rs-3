//! Parsed message templates and their arguments.
//!
//! The syntax is the subset of the Paraglide / inlang message format used by the
//! flat `{locale}.json` files: literal text plus `{name}` placeholders where
//! `name` is `[A-Za-z0-9_]+`. Messages are parsed **once at load time**, so a
//! malformed translation fails the boot instead of a user's sign-in email.
//!
//! Interpolation is a single pass over the parsed parts. Substituted values are
//! never re-scanned, so a user-controlled value such as a workspace named
//! `{error}` cannot inject other placeholders (the old `String::replace` loop could).

use std::fmt;

/// A template could not be parsed.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ParseError {
    #[error("unclosed `{{` at byte {0}")]
    Unclosed(usize),
    #[error("invalid placeholder `{{{0}}}` at byte {1} (expected [A-Za-z0-9_]+)")]
    InvalidPlaceholder(String, usize),
    #[error("unmatched `}}` at byte {0}")]
    StrayClose(usize),
}

/// A placeholder had no matching argument.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MissingArg(pub String);

#[derive(Debug, Clone, PartialEq, Eq)]
enum Part {
    Text(Box<str>),
    Var(Box<str>),
}

/// A parsed message.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Message {
    parts: Box<[Part]>,
}

impl Message {
    pub fn parse(src: &str) -> Result<Self, ParseError> {
        let mut parts = Vec::new();
        let mut text = String::new();
        let mut chars = src.char_indices().peekable();

        while let Some((i, c)) = chars.next() {
            match c {
                '{' => {
                    let rest = &src[i + 1..];
                    let len = rest.find('}').ok_or(ParseError::Unclosed(i))?;
                    let name = &rest[..len];
                    if name.is_empty()
                        || !name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
                    {
                        return Err(ParseError::InvalidPlaceholder(name.to_owned(), i));
                    }
                    if !text.is_empty() {
                        parts.push(Part::Text(std::mem::take(&mut text).into()));
                    }
                    parts.push(Part::Var(name.into()));
                    let resume = i + 1 + len + 1;
                    while chars.peek().is_some_and(|&(j, _)| j < resume) {
                        chars.next();
                    }
                }
                '}' => return Err(ParseError::StrayClose(i)),
                other => text.push(other),
            }
        }
        if !text.is_empty() {
            parts.push(Part::Text(text.into()));
        }
        Ok(Self {
            parts: parts.into(),
        })
    }

    /// Names of the placeholders this message uses (with repeats).
    pub fn vars(&self) -> impl Iterator<Item = &str> {
        self.parts.iter().filter_map(|p| match p {
            Part::Var(name) => Some(&**name),
            Part::Text(_) => None,
        })
    }

    /// Interpolate. Fails if a placeholder has no argument; extra arguments are ignored
    /// (one `Args` is shared by the subject, title, body, … of an email).
    pub fn render(&self, args: &Args) -> Result<String, MissingArg> {
        let mut out = String::with_capacity(
            self.parts
                .iter()
                .map(|p| match p {
                    Part::Text(t) => t.len(),
                    Part::Var(_) => 16,
                })
                .sum(),
        );
        for part in self.parts.iter() {
            match part {
                Part::Text(t) => out.push_str(t),
                Part::Var(name) => {
                    out.push_str(args.get(name).ok_or_else(|| MissingArg(name.to_string()))?);
                }
            }
        }
        Ok(out)
    }
}

/// Named arguments for [`Message::render`]. Names are code-defined, hence `&'static str`.
#[derive(Debug, Clone, Default)]
pub struct Args {
    items: Vec<(&'static str, String)>,
}

impl Args {
    pub fn new() -> Self {
        Self::default()
    }

    /// Add (or replace) an argument. Any `Display` value works: `&str`, `u32`, …
    #[must_use]
    pub fn with(mut self, name: &'static str, value: impl fmt::Display) -> Self {
        self.set(name, value);
        self
    }

    pub fn set(&mut self, name: &'static str, value: impl fmt::Display) {
        let value = value.to_string();
        match self.items.iter_mut().find(|(n, _)| *n == name) {
            Some(slot) => slot.1 = value,
            None => self.items.push((name, value)),
        }
    }

    pub fn get(&self, name: &str) -> Option<&str> {
        self.items
            .iter()
            .find(|(n, _)| *n == name)
            .map(|(_, v)| v.as_str())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn render(src: &str, args: &Args) -> Result<String, MissingArg> {
        Message::parse(src).unwrap().render(args)
    }

    #[test]
    fn interpolates_in_order_and_repeats() {
        let args = Args::new().with("a", "X").with("b", 7);
        assert_eq!(render("{a}-{b}-{a}", &args).unwrap(), "X-7-X");
        assert_eq!(render("plain", &args).unwrap(), "plain");
        assert_eq!(render("日本語 {a} です", &args).unwrap(), "日本語 X です");
    }

    #[test]
    fn values_are_never_rescanned() {
        // User-controlled value that looks like another placeholder.
        let args = Args::new()
            .with("memberName", "{workspaceName}")
            .with("workspaceName", "Acme");
        assert_eq!(
            render("{memberName} joined {workspaceName}", &args).unwrap(),
            "{workspaceName} joined Acme"
        );
    }

    #[test]
    fn missing_argument_is_an_error() {
        assert_eq!(render("{x}", &Args::new()), Err(MissingArg("x".into())));
    }

    #[test]
    fn extra_arguments_are_ignored() {
        assert_eq!(render("hi", &Args::new().with("unused", 1)).unwrap(), "hi");
    }

    #[test]
    fn malformed_templates_are_rejected_at_parse_time() {
        assert!(matches!(
            Message::parse("a {b"),
            Err(ParseError::Unclosed(2))
        ));
        assert!(matches!(
            Message::parse("a {} b"),
            Err(ParseError::InvalidPlaceholder(..))
        ));
        assert!(matches!(
            Message::parse("{ a }"),
            Err(ParseError::InvalidPlaceholder(..))
        ));
        assert!(matches!(
            Message::parse("{a {b}"),
            Err(ParseError::InvalidPlaceholder(..))
        ));
        assert!(matches!(
            Message::parse("a } b"),
            Err(ParseError::StrayClose(2))
        ));
    }

    #[test]
    fn lists_vars() {
        let m = Message::parse("{a} and {b} and {a}").unwrap();
        assert_eq!(m.vars().collect::<Vec<_>>(), ["a", "b", "a"]);
    }

    #[test]
    fn set_replaces_existing() {
        let mut a = Args::new().with("k", 1);
        a.set("k", 2);
        assert_eq!(a.get("k"), Some("2"));
    }
}
