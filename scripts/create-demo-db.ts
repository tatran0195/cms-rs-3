import fs from 'node:fs';
import path from 'node:path';
import { Database } from 'bun:sqlite';

const outDir = path.resolve('target/demo-site');
fs.mkdirSync(outDir, { recursive: true });
const dbPath = path.join(outDir, 'docs.sqlite');

if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
}

const db = new Database(dbPath);

db.run(`
  CREATE TABLE export_meta (
    project_id TEXT PRIMARY KEY,
    project_name TEXT NOT NULL,
    project_slug TEXT NOT NULL,
    exported_at TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1
  );

  INSERT INTO export_meta VALUES (
    'proj_enterprise_docs',
    'Acme Cloud Platform Documentation',
    'acme-cloud',
    '2026-10-17T02:00:00Z',
    1
  );

  CREATE TABLE project_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  INSERT INTO project_config VALUES ('description', '"Official Acme Cloud Platform developer documentation."');

  CREATE TABLE languages (
    code TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    is_default INTEGER NOT NULL,
    is_rtl INTEGER NOT NULL
  );

  INSERT INTO languages VALUES ('en', 'English', 1, 0);
  INSERT INTO languages VALUES ('ja', 'Japanese', 0, 0);

  CREATE TABLE versions (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL,
    label TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    is_default INTEGER NOT NULL
  );

  INSERT INTO versions VALUES ('v1', 'v1.0', 'v1.0 (Latest)', 1, 1);

  CREATE TABLE pages (
    id TEXT PRIMARY KEY,
    custom_id TEXT,
    version_id TEXT NOT NULL,
    parent_id TEXT,
    kind TEXT NOT NULL,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    path TEXT NOT NULL,
    icon TEXT,
    sort_order INTEGER NOT NULL
  );

  CREATE INDEX idx_pages_custom_id ON pages(custom_id);

  CREATE TABLE page_content (
    page_id TEXT NOT NULL,
    language TEXT NOT NULL,
    markdown TEXT NOT NULL,
    description TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (page_id, language)
  );

  CREATE VIRTUAL TABLE page_fts USING fts5(
    page_id UNINDEXED,
    version_id UNINDEXED,
    language UNINDEXED,
    title,
    content
  );

  CREATE TABLE changelog (
    slug TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    published_at TEXT NOT NULL
  );

  INSERT INTO changelog VALUES ('v1.0.0', 'Initial GA Release', '2026-10-17');

  CREATE TABLE assets (
    path TEXT PRIMARY KEY,
    mime_type TEXT NOT NULL,
    data BLOB NOT NULL
  );
`);

// Seed Pages and Groups:
// 1. Getting Started (page)
db.run(`
  INSERT INTO pages VALUES (
    'page_intro',
    'intro',
    'v1',
    NULL,
    'PAGE',
    'getting-started',
    'Getting Started with Acme Cloud',
    '/getting-started',
    'rocket',
    1
  );

  INSERT INTO page_content VALUES (
    'page_intro',
    'en',
    '# Getting Started with Acme Cloud\\n\\nWelcome to Acme Cloud Platform. This guide walks you through provisioning your first cluster and connecting your MCP agents.\\n\\n## Prerequisites\\n\\n- Rust 1.80+\\n- An Acme API key\\n\\n## Quickstart\\n\\nRun the following command:\\n\\n\`\`\`bash\\nacme init\\n\`\`\`\\n',
    'Learn how to get started with Acme Cloud documentation and platform tools.',
    '2026-10-17T02:00:00Z'
  );

  INSERT INTO page_fts VALUES (
    'page_intro',
    'v1',
    'en',
    'Getting Started with Acme Cloud',
    'Welcome to Acme Cloud Platform. This guide walks you through provisioning your first cluster and connecting your MCP agents.'
  );
`);

// 2. API Reference (group)
db.run(`
  INSERT INTO pages VALUES (
    'group_api',
    'api-ref',
    'v1',
    NULL,
    'GROUP',
    'api',
    'API Reference',
    '/api',
    'code',
    2
  );
`);

// 3. Child 1 of API Reference: Authentication Guide (page)
db.run(`
  INSERT INTO pages VALUES (
    'page_auth',
    'auth-guide',
    'v1',
    'group_api',
    'PAGE',
    'auth',
    'Authentication & Tokens',
    '/api/auth',
    'shield',
    1
  );

  INSERT INTO page_content VALUES (
    'page_auth',
    'en',
    '# Authentication & Tokens\\n\\nAcme Cloud uses Bearer tokens and mutual TLS for API security.\\n\\n## Bearer Authentication\\n\\nSend your token in the Authorization header:\\n\\n\`\`\`http\\nAuthorization: Bearer <your-token>\\n\`\`\`\\n\\n## Scopes\\n\\n- pages:read\\n- search:read\\n',
    'Authentication mechanisms, token lifecycle, and RBAC scopes.',
    '2026-10-17T02:00:00Z'
  );

  INSERT INTO page_fts VALUES (
    'page_auth',
    'v1',
    'en',
    'Authentication & Tokens',
    'Acme Cloud uses Bearer tokens and mutual TLS for API security. Bearer Authentication and RBAC scopes.'
  );
`);

// 4. Child 2 of API Reference: Webhooks (page)
db.run(`
  INSERT INTO pages VALUES (
    'page_webhooks',
    'webhooks-guide',
    'v1',
    'group_api',
    'PAGE',
    'webhooks',
    'Webhooks & Event Delivery',
    '/api/webhooks',
    'bell',
    2
  );

  INSERT INTO page_content VALUES (
    'page_webhooks',
    'en',
    '# Webhooks & Event Delivery\\n\\nReceive real-time notifications when documentation changes.\\n\\n## Signature Verification\\n\\nAll webhook payloads are signed using HMAC-SHA256.\\n',
    'Webhook delivery, retries, and HMAC verification.',
    '2026-10-17T02:00:00Z'
  );

  INSERT INTO page_fts VALUES (
    'page_webhooks',
    'v1',
    'en',
    'Webhooks & Event Delivery',
    'Receive real-time notifications when documentation changes. HMAC-SHA256 signature verification.'
  );
`);

console.log('Successfully created demo SQLite database at:', dbPath);
db.close();
