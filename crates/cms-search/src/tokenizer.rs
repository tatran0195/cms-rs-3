//! Japanese morphological analyzer and Tantivy tokenizer
//!
//! Powered by Lindera with embedded SudachiDict (2026 vocabulary) in Decompose mode.
//! Provides:
//! - Full morphological segmentation (nouns, verbs, compound-word decomposition)
//! - Dictionary-form and spelling variant normalization (e.g., サーバ → サーバー, 引っ越す → 引越す)
//! - Unicode NFKC normalization and full-width to half-width ASCII conversion
//! - Accurate byte offsets for Tantivy snippet generation and search result highlighting

use std::{borrow::Cow, sync::Arc};

use lindera::{
    dictionary::{load_dictionary, Dictionary},
    mode::{Mode, Penalty},
    segmenter::Segmenter,
};
use tantivy::tokenizer::{Token, TokenStream, Tokenizer};
use unicode_normalization::UnicodeNormalization;

/// Name used to register the Japanese tokenizer in Tantivy
pub const JAPANESE_TOKENIZER_NAME: &str = "japanese_lindera";

/// Detailed token information from morphological analysis
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JapaneseToken {
    pub surface: String,
    pub normalized_form: Option<String>,
    pub part_of_speech: Option<String>,
    pub reading: Option<String>,
    pub byte_start: usize,
    pub byte_end: usize,
}

/// Japanese morphological tokenizer wrapping Lindera
#[derive(Clone)]
pub struct JapaneseTokenizer {
    segmenter: Arc<Segmenter>,
}

impl JapaneseTokenizer {
    /// Create a new tokenizer with the embedded SudachiDict dictionary
    pub fn new() -> Self {
        Self::with_dict_path(None)
    }

    /// Create a new tokenizer with an optional custom dictionary path
    pub fn with_dict_path(dict_path: Option<&str>) -> Self {
        let dictionary = match dict_path {
            Some(path) if !path.trim().is_empty() => {
                let uri = if path.starts_with("file://") || path.starts_with("embedded://") {
                    path.to_string()
                } else {
                    format!("file://{}", path)
                };
                load_dictionary(&uri).unwrap_or_else(|e| {
                    tracing::warn!(
                        "Failed to load custom Lindera dictionary at '{}': {}. Falling back to \
                         embedded SudachiDict.",
                        path,
                        e
                    );
                    load_embedded_sudachidict()
                })
            }
            _ => load_embedded_sudachidict(),
        };

        // Decompose mode is the industry standard for search:
        // Compound words (e.g. 関西国際空港) are segmented into searchable sub-tokens (関西, 国際, 空港)
        let mode = Mode::Decompose(Penalty::default());
        let segmenter = Segmenter::new(mode, dictionary, None);

        Self {
            segmenter: Arc::new(segmenter),
        }
    }

    /// Access the underlying Lindera segmenter
    pub fn segmenter(&self) -> &Arc<Segmenter> {
        &self.segmenter
    }

    /// Normalize text (NFKC-style: converts full-width chars and spaces to half-width)
    pub fn normalize(&self, text: &str) -> String {
        let nfkc: String = text.nfkc().collect();
        nfkc.chars()
            .map(|c| {
                let code = c as u32;
                // Full-width ASCII variants (U+FF01–U+FF5E) -> ASCII (U+0021–U+007E)
                if (0xFF01..=0xFF5E).contains(&code) {
                    char::from_u32(code - 0xFF01 + 0x21).unwrap_or(c)
                }
                // Full-width space (U+3000) -> ASCII space
                else if code == 0x3000 {
                    ' '
                } else {
                    c
                }
            })
            .collect()
    }

    /// Tokenize text into words/stems suitable for indexing and queries
    pub fn tokenize(&self, text: &str) -> Vec<String> {
        if text.trim().is_empty() {
            return Vec::new();
        }

        let mut result = Vec::new();
        if let Ok(mut tokens) = self.segmenter.segment(Cow::Borrowed(text)) {
            for t in &mut tokens {
                let surface = t.surface.to_string();
                if surface.trim().is_empty() || is_punctuation_or_symbol(&surface) {
                    continue;
                }

                let norm = t.get("normalized_form").map(|s| s.to_string());
                let term = match norm {
                    Some(ref n) if n != "*" && !n.is_empty() => n.as_str(),
                    _ => &surface,
                };

                let normalized_term: String = term.nfkc().collect();
                let lower = normalized_term.to_lowercase();
                if !lower.is_empty() && !result.contains(&lower) {
                    result.push(lower);
                }
            }
        }

        // Fallback if segmenter yielded nothing
        if result.is_empty() {
            for word in text.split_whitespace() {
                let clean: String = word
                    .nfkc()
                    .collect::<String>()
                    .to_lowercase()
                    .chars()
                    .filter(|c| !c.is_ascii_punctuation())
                    .collect();
                if !clean.is_empty() {
                    result.push(clean);
                }
            }
        }

        result
    }

    /// Detailed tokenization returning morphological features
    pub fn tokenize_with_details(&self, text: &str) -> Vec<JapaneseToken> {
        let mut result = Vec::new();
        if let Ok(mut tokens) = self.segmenter.segment(Cow::Borrowed(text)) {
            for t in &mut tokens {
                let surface = t.surface.to_string();
                let norm = t
                    .get("normalized_form")
                    .filter(|s| *s != "*" && !s.is_empty())
                    .map(|s| s.to_string());
                let pos = t
                    .get("part_of_speech")
                    .filter(|s| *s != "*" && !s.is_empty())
                    .map(|s| s.to_string());
                let reading = t
                    .get("reading")
                    .filter(|s| *s != "*" && !s.is_empty())
                    .map(|s| s.to_string());

                result.push(JapaneseToken {
                    surface,
                    normalized_form: norm,
                    part_of_speech: pos,
                    reading,
                    byte_start: t.byte_start,
                    byte_end: t.byte_end,
                });
            }
        }
        result
    }
}

impl Default for JapaneseTokenizer {
    fn default() -> Self {
        Self::new()
    }
}

fn load_embedded_sudachidict() -> Dictionary {
    load_dictionary("embedded://sudachidict").expect(
        "embedded SudachiDict dictionary should always be present with feature embed-sudachidict",
    )
}

fn is_punctuation_or_symbol(s: &str) -> bool {
    s.chars().all(|c| {
        c.is_ascii_punctuation()
            || matches!(
                c,
                '、' | '。'
                    | '・'
                    | '「'
                    | '」'
                    | '『'
                    | '』'
                    | '【'
                    | '】'
                    | '（'
                    | '）'
                    | '［'
                    | '］'
                    | '｛'
                    | '｝'
                    | '〈'
                    | '〉'
                    | '《'
                    | '》'
                    | '〔'
                    | '〕'
                    | '〜'
                    | '～'
                    | '…'
                    | '‥'
                    | 'ー'
                    | '―'
                    | '：'
                    | '；'
                    | '？'
                    | '！'
                    | '￥'
                    | '＄'
                    | '％'
                    | '＃'
                    | '＠'
                    | '＆'
                    | '＊'
                    | '＋'
                    | '＝'
                    | '＜'
                    | '＞'
                    | '／'
                    | '＼'
                    | '｜'
                    | '｀'
                    | '＾'
                    | '＿'
            )
    })
}

// =========================================================================
// Tantivy Tokenizer implementation
// =========================================================================

/// Tantivy Tokenizer adapter for Lindera Japanese morphological analysis
#[derive(Clone)]
pub struct LinderaTantivyTokenizer {
    inner: JapaneseTokenizer,
}

impl LinderaTantivyTokenizer {
    pub fn new() -> Self {
        Self {
            inner: JapaneseTokenizer::new(),
        }
    }

    pub fn with_tokenizer(tokenizer: JapaneseTokenizer) -> Self {
        Self { inner: tokenizer }
    }
}

impl Default for LinderaTantivyTokenizer {
    fn default() -> Self {
        Self::new()
    }
}

impl Tokenizer for LinderaTantivyTokenizer {
    type TokenStream<'a> = LinderaTokenStream;

    fn token_stream<'a>(&'a mut self, text: &'a str) -> Self::TokenStream<'a> {
        let mut tantivy_tokens = Vec::new();
        let mut position = 0;

        if let Ok(mut tokens) = self.inner.segmenter.segment(Cow::Borrowed(text)) {
            for t in &mut tokens {
                let surface = t.surface.to_string();
                if surface.trim().is_empty() || is_punctuation_or_symbol(&surface) {
                    continue;
                }

                let norm = t.get("normalized_form").map(|s| s.to_string());
                let norm_term = match norm {
                    Some(ref n) if n != "*" && !n.is_empty() => {
                        Some(n.nfkc().collect::<String>().to_lowercase())
                    }
                    _ => None,
                };
                let surface_norm = surface.nfkc().collect::<String>().to_lowercase();

                let primary_term = norm_term.clone().unwrap_or_else(|| surface_norm.clone());

                tantivy_tokens.push(Token {
                    offset_from: t.byte_start,
                    offset_to: t.byte_end,
                    position,
                    text: primary_term.clone(),
                    position_length: 1,
                });

                // If normalized form differs from surface form (e.g. 引越 vs 引っ越し),
                // emit surface form at the same position so either matches identically.
                if let Some(ref n) = norm_term {
                    if *n != surface_norm && !surface_norm.is_empty() {
                        tantivy_tokens.push(Token {
                            offset_from: t.byte_start,
                            offset_to: t.byte_end,
                            position,
                            text: surface_norm,
                            position_length: 1,
                        });
                    }
                }

                position += 1;
            }
        }

        LinderaTokenStream {
            tokens: tantivy_tokens,
            index: 0,
        }
    }
}

/// TokenStream emitting Tantivy tokens from Lindera analysis
pub struct LinderaTokenStream {
    tokens: Vec<Token>,
    index: usize,
}

impl TokenStream for LinderaTokenStream {
    fn advance(&mut self) -> bool {
        if self.index < self.tokens.len() {
            self.index += 1;
            true
        } else {
            false
        }
    }

    fn token(&self) -> &Token {
        &self.tokens[self.index - 1]
    }

    fn token_mut(&mut self) -> &mut Token {
        &mut self.tokens[self.index - 1]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_japanese_tokenizer_decomposition() {
        let tokenizer = JapaneseTokenizer::new();

        let text = "関西国際空港に行きました";
        let tokens = tokenizer.tokenize(text);

        assert!(tokens.contains(&"関西".to_string()));
        assert!(tokens.contains(&"国際".to_string()));
        assert!(tokens.contains(&"空港".to_string()));
        assert!(tokens.contains(&"行く".to_string()) || tokens.contains(&"行き".to_string()));
    }

    #[test]
    fn test_spelling_variation_normalization() {
        let tokenizer = JapaneseTokenizer::new();

        // "サーバ" should normalize to "サーバー"
        let tokens = tokenizer.tokenize("Linuxサーバの構築");
        assert!(tokens.contains(&"サーバー".to_string()) || tokens.contains(&"サーバ".to_string()));
        assert!(tokens.contains(&"構築".to_string()));
    }

    #[test]
    fn test_normalize() {
        let tokenizer = JapaneseTokenizer::new();

        let text = "ＨＥＬＬＯ　ワールド　１２３";
        let normalized = tokenizer.normalize(text);

        assert_eq!(normalized, "HELLO ワールド 123");
    }

    #[test]
    fn test_tantivy_token_stream() {
        let mut tokenizer = LinderaTantivyTokenizer::new();
        let mut stream = tokenizer.token_stream("日本語のドキュメント検索システム");

        let mut extracted = Vec::new();
        while stream.advance() {
            extracted.push(stream.token().text.clone());
        }

        assert!(extracted.contains(&"日本".to_string()));
        assert!(extracted.contains(&"語".to_string()));
        assert!(extracted.contains(&"ドキュメント".to_string()));
    }
}
