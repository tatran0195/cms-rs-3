//! RAG (Retrieval Augmented Generation) — LLM-powered answers from search results
//!
//! Supports multiple LLM providers:
//! - **Gemini** — Google's Gemini API (default)
//! - **OpenAI** — OpenAI-compatible APIs (GPT-4o, etc.)
//! - **Ollama** — Local LLM inference
//!
//! The RAG pipeline:
//! 1. Vector search retrieves the top-k most relevant document chunks
//! 2. Chunks are assembled into a context prompt
//! 3. The LLM generates an answer grounded in the retrieved context

use cms_config::RagConfig;
use cms_entity::search::{RagAnswer, SearchHit};
use cms_error::AppError;

/// Generate a RAG answer using the configured LLM provider.
///
/// `hits` should be the top-k search results from hybrid search.
/// The function constructs a grounded prompt and calls the LLM.
pub async fn generate_rag_answer(
    config: &RagConfig,
    project_id: &str,
    question: &str,
    hits: &[SearchHit],
) -> Result<RagAnswer, AppError> {
    if !config.enabled {
        return Ok(fallback_answer(project_id, question, hits));
    }

    let api_key = config.api_key.as_deref().filter(|k| !k.trim().is_empty());
    if api_key.is_none() && config.provider != "ollama" {
        tracing::warn!(
            provider = config.provider,
            "RAG API key not configured, falling back to context-only answer"
        );
        return Ok(fallback_answer(project_id, question, hits));
    }

    if hits.is_empty() {
        return Ok(RagAnswer {
            answer: format!("No relevant documentation found for '{}'.", question),
            confidence: 0.0,
            sources: Vec::new(),
        });
    }

    let context = build_context(hits, config.max_context_chunks);
    let prompt = build_prompt(question, &context);

    let answer_text = match config.provider.as_str() {
        "gemini" => {
            call_gemini(
                api_key.unwrap_or_default(),
                &config.model,
                &prompt,
                config.temperature,
            )
            .await?
        }
        "openai" => {
            let base_url = config
                .api_base_url
                .as_deref()
                .unwrap_or("https://api.openai.com/v1");
            call_openai_compatible(
                api_key.unwrap_or_default(),
                base_url,
                &config.model,
                &prompt,
                config.temperature,
            )
            .await?
        }
        "ollama" => {
            let base_url = config
                .api_base_url
                .as_deref()
                .unwrap_or("http://localhost:11434/v1");
            call_openai_compatible("", base_url, &config.model, &prompt, config.temperature)
                .await?
        }
        other => {
            return Err(AppError::SearchError(format!(
                "Unknown RAG provider: '{}'. Use 'gemini', 'openai', or 'ollama'.",
                other
            )))
        }
    };

    let confidence = hits
        .first()
        .map(|h| (h.score / 2.0).clamp(0.3, 0.95))
        .unwrap_or(0.5);

    Ok(RagAnswer {
        answer: answer_text,
        confidence,
        sources: hits.to_vec(),
    })
}

/// Build context string from search hits
fn build_context(hits: &[SearchHit], max_chunks: usize) -> String {
    hits.iter()
        .take(max_chunks)
        .enumerate()
        .map(|(i, hit)| {
            format!(
                "[Source {}] {} ({})\n{}",
                i + 1,
                hit.title,
                hit.path,
                hit.chunk_text
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

/// Build the grounded RAG prompt
fn build_prompt(question: &str, context: &str) -> String {
    format!(
        r#"You are a helpful documentation assistant. Answer the user's question based ONLY on the provided documentation context. If the answer cannot be found in the context, say so clearly.

## Documentation Context

{context}

## User Question

{question}

## Instructions

- Answer concisely and accurately based on the provided context
- Reference specific sections when relevant
- If the context doesn't contain enough information, acknowledge this
- Use the same language as the question (e.g., respond in Japanese if asked in Japanese)
- Format your answer in Markdown"#
    )
}

/// Fallback answer when LLM is not available — just concatenates context
fn fallback_answer(project_id: &str, question: &str, hits: &[SearchHit]) -> RagAnswer {
    if hits.is_empty() {
        return RagAnswer {
            answer: format!("No relevant documentation found for '{}'.", question),
            confidence: 0.0,
            sources: Vec::new(),
        };
    }

    let context = hits
        .iter()
        .take(5)
        .map(|h| format!("### {} ({})\n{}", h.title, h.path, h.chunk_text))
        .collect::<Vec<_>>()
        .join("\n\n");

    let answer = format!(
        "Documentation search results for project '{}' (AI summarization is not configured):\n\n{}",
        project_id, context
    );

    let confidence = hits
        .first()
        .map(|h| (h.score / 2.0).clamp(0.1, 1.0))
        .unwrap_or(0.5);

    RagAnswer {
        answer,
        confidence,
        sources: hits.to_vec(),
    }
}

// ── LLM Provider Implementations ─────────────────────────────────────

/// Call Google Gemini API
async fn call_gemini(
    api_key: &str,
    model: &str,
    prompt: &str,
    temperature: f32,
) -> Result<String, AppError> {
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
        model
    );

    let body = serde_json::json!({
        "contents": [{
            "parts": [{"text": prompt}]
        }],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": 2048
        }
    });

    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .header("x-goog-api-key", api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::SearchError(format!("Gemini API request failed: {}", e)))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let error_body = resp.text().await.unwrap_or_default();
        return Err(AppError::SearchError(format!(
            "Gemini API returned {}: {}",
            status, error_body
        )));
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::SearchError(format!("Failed to parse Gemini response: {}", e)))?;

    let text = json["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .unwrap_or("Unable to generate an answer from the documentation.")
        .to_string();

    Ok(text)
}

/// Call OpenAI-compatible API (works with OpenAI, Ollama, and other compatible providers)
async fn call_openai_compatible(
    api_key: &str,
    base_url: &str,
    model: &str,
    prompt: &str,
    temperature: f32,
) -> Result<String, AppError> {
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));

    let body = serde_json::json!({
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "You are a helpful documentation assistant."
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        "temperature": temperature,
        "max_tokens": 2048
    });

    let client = reqwest::Client::new();
    let mut req = client.post(&url).json(&body);

    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", api_key));
    }

    let resp = req
        .send()
        .await
        .map_err(|e| AppError::SearchError(format!("LLM API request failed: {}", e)))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let error_body = resp.text().await.unwrap_or_default();
        return Err(AppError::SearchError(format!(
            "LLM API returned {}: {}",
            status, error_body
        )));
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::SearchError(format!("Failed to parse LLM response: {}", e)))?;

    let text = json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("Unable to generate an answer from the documentation.")
        .to_string();

    Ok(text)
}
