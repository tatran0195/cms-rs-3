//! Markdown text extraction and chunking for search indexing
//!
//! Converts Markdown / MDX documentation pages into clean plain text and
//! logical section chunks (split by headings) for granular search and RAG retrieval.

use pulldown_cmark::{Event, Parser, Tag, TagEnd};

/// A searchable chunk extracted from a Markdown document
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentChunk {
    /// Zero-based chunk index within the document
    pub chunk_index: i32,
    /// Heading of this section, if any
    pub heading: Option<String>,
    /// Plain text content of this section
    pub text: String,
}

/// Convert Markdown content into plain text (strips markdown formatting)
pub fn markdown_to_plain_text(markdown: &str) -> String {
    let mut plain_text = String::with_capacity(markdown.len());
    let parser = Parser::new(markdown);

    for event in parser {
        match event {
            Event::Text(text) => {
                plain_text.push_str(&text);
            }
            Event::Code(code) => {
                plain_text.push_str(&code);
            }
            Event::SoftBreak | Event::HardBreak => {
                plain_text.push('\n');
            }
            Event::End(TagEnd::Paragraph | TagEnd::Heading(_) | TagEnd::Item) => {
                plain_text.push('\n');
            }
            _ => {}
        }
    }

    plain_text.trim().to_string()
}

/// Extract section chunks from markdown content based on headings.
///
/// If no headings are found or text is short, a single chunk with index 0 is returned.
pub fn extract_chunks(markdown: &str) -> Vec<DocumentChunk> {
    if markdown.trim().is_empty() {
        return Vec::new();
    }

    let mut chunks = Vec::new();
    let mut current_heading: Option<String> = None;
    let mut current_text = String::new();
    let mut in_heading = false;
    let mut heading_buf = String::new();

    let parser = Parser::new(markdown);

    for event in parser {
        match event {
            Event::Start(Tag::Heading { .. }) => {
                // If we already have accumulated text for a previous section, finish it
                let trimmed = current_text.trim();
                if !trimmed.is_empty() {
                    chunks.push(DocumentChunk {
                        chunk_index: chunks.len() as i32,
                        heading: current_heading.take(),
                        text: trimmed.to_string(),
                    });
                    current_text.clear();
                }
                in_heading = true;
                heading_buf.clear();
            }
            Event::End(TagEnd::Heading(_)) => {
                in_heading = false;
                let h = heading_buf.trim().to_string();
                if !h.is_empty() {
                    current_heading = Some(h.clone());
                    current_text.push_str(&h);
                    current_text.push('\n');
                }
                heading_buf.clear();
            }
            Event::Text(text) => {
                if in_heading {
                    heading_buf.push_str(&text);
                } else {
                    current_text.push_str(&text);
                }
            }
            Event::Code(code) => {
                if in_heading {
                    heading_buf.push_str(&code);
                } else {
                    current_text.push_str(&code);
                }
            }
            Event::SoftBreak | Event::HardBreak => {
                if !in_heading {
                    current_text.push('\n');
                }
            }
            Event::End(TagEnd::Paragraph | TagEnd::Item) if !in_heading => {
                current_text.push('\n');
            }
            _ => {}
        }
    }

    let trimmed = current_text.trim();
    if !trimmed.is_empty() || chunks.is_empty() {
        chunks.push(DocumentChunk {
            chunk_index: chunks.len() as i32,
            heading: current_heading,
            text: trimmed.to_string(),
        });
    }

    chunks
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_markdown_to_plain_text() {
        let md = "# 日本語タイトル\n\nこれは**強調**された[リンク](https://example.com)です。\n\n```rust\nlet x = 1;\n```";
        let plain = markdown_to_plain_text(md);
        assert!(plain.contains("日本語タイトル"));
        assert!(plain.contains("強調"));
        assert!(plain.contains("リンク"));
        assert!(plain.contains("let x = 1;"));
        assert!(!plain.contains("**"));
        assert!(!plain.contains("```"));
    }

    #[test]
    fn test_extract_chunks() {
        let md = r#"# 概要
ドキュメントの概要です。

## 機能一覧
- 形態素解析
- 全文検索

## 設定方法
設定の手順です。
"#;
        let chunks = extract_chunks(md);
        assert_eq!(chunks.len(), 3);
        assert_eq!(chunks[0].chunk_index, 0);
        assert!(chunks[0].text.contains("概要"));
        assert_eq!(chunks[1].chunk_index, 1);
        assert_eq!(chunks[1].heading.as_deref(), Some("機能一覧"));
        assert!(chunks[1].text.contains("形態素解析"));
        assert_eq!(chunks[2].chunk_index, 2);
        assert_eq!(chunks[2].heading.as_deref(), Some("設定方法"));
    }
}
