/// Japanese tokenizer stub
///
/// This is a placeholder tokenizer that uses simple CJK bigram splitting.
/// A production implementation should integrate lindera-core with an IPADIC
/// or UniDic dictionary for proper Japanese morphological analysis.
pub struct JapaneseTokenizer;

impl JapaneseTokenizer {
    pub fn new() -> Self {
        Self
    }

    /// Tokenize text (stub: splits on whitespace and produces CJK bigrams)
    pub fn tokenize(&self, text: &str) -> Vec<String> {
        // Simple n-gram tokenization as a placeholder
        // Real implementation should use lindera-core with IPADIC dictionary
        let mut tokens = Vec::new();

        for word in text.split_whitespace() {
            if word.is_ascii() {
                tokens.push(word.to_lowercase());
            } else {
                // For CJK text, use bigrams as a simple approximation
                let chars: Vec<char> = word.chars().collect();
                for window in chars.windows(2) {
                    tokens.push(window.iter().collect());
                }
                // Also add single chars
                for c in &chars {
                    tokens.push(c.to_string());
                }
            }
        }

        tokens
    }

    /// Normalize text (NFKC-style: converts full-width chars to half-width)
    pub fn normalize(&self, text: &str) -> String {
        text.chars()
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
}

impl Default for JapaneseTokenizer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_japanese_tokenizer() {
        let tokenizer = JapaneseTokenizer::new();

        let text = "日本語の文章";
        let tokens = tokenizer.tokenize(text);

        assert!(!tokens.is_empty());
    }

    #[test]
    fn test_normalize() {
        let tokenizer = JapaneseTokenizer::new();

        // Test full-width to half-width normalization
        let text = "ＨＥＬＬＯ"; // Full-width
        let normalized = tokenizer.normalize(text);

        // Should convert to half-width
        assert_eq!(normalized, "HELLO");
    }
}
