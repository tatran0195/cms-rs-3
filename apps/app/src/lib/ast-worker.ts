/**
 * Dedicated Web Worker offloading AST parsing, Turndown HTML conversion,
 * frontmatter metadata extraction, and heavy regex scanning from the Main Thread.
 */

export interface AstWorkerParseRequest {
  id: string;
  type: 'parse-frontmatter' | 'extract-headings' | 'sanitize-markdown';
  payload: string;
}

export interface AstWorkerParseResponse {
  id: string;
  type: string;
  result: unknown;
  error?: string;
}

export function parseFrontmatterSync(source: string): {
  frontmatter: Record<string, string>;
  content: string;
} {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, content: source };
  }

  const [, rawYaml, content] = match;
  const frontmatter: Record<string, string> = {};

  for (const line of (rawYaml || '').split(/\r?\n/)) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key) {
        frontmatter[key] = value;
      }
    }
  }

  return { frontmatter, content: content || '' };
}

export function extractHeadingsSync(markdown: string): Array<{
  level: number;
  text: string;
  id: string;
}> {
  const headings: Array<{ level: number; text: string; id: string }> = [];
  const lines = markdown.split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match && match[1] && match[2]) {
      const level = match[1].length;
      const text = match[2].trim();
      const id = text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-');
      headings.push({ level, text, id });
    }
  }

  return headings;
}

// In worker runtime: listen to messages
if (typeof self !== 'undefined' && typeof window === 'undefined') {
  self.onmessage = (e: MessageEvent<AstWorkerParseRequest>) => {
    const { id, type, payload } = e.data;
    try {
      if (type === 'parse-frontmatter') {
        const result = parseFrontmatterSync(payload);
        self.postMessage({ id, type, result });
      } else if (type === 'extract-headings') {
        const result = extractHeadingsSync(payload);
        self.postMessage({ id, type, result });
      } else {
        self.postMessage({ id, type, error: `Unknown job type: ${type}` });
      }
    } catch (err) {
      self.postMessage({
        id,
        type,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };
}
