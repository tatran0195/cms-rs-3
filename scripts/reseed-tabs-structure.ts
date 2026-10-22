import crypto from 'node:crypto';
import { SQL } from 'bun';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres!Tsvs7345@localhost:5432/cms';
const sql = new SQL(DATABASE_URL);

const PROJECT_ID = '34c59d77-9474-439f-918e-40193594770d';

interface PageDef {
  title: string;
  slug: string;
  description: string;
  content: string;
}

interface GroupDef {
  title: string;
  slug: string;
  pages: PageDef[];
}

interface TabDef {
  label: string;
  href: string;
  icon?: string;
  groups: GroupDef[];
}

const TABS: TabDef[] = [
  {
    label: 'Documentation',
    href: '/docs',
    groups: [
      {
        title: 'Getting Started',
        slug: 'getting-started',
        pages: [
          {
            title: 'Introduction',
            slug: 'introduction',
            description: 'Overview of the enterprise documentation platform and architecture.',
            content: `# Introduction

Welcome to the enterprise documentation platform. This system delivers zero-latency visual documentation authoring with native Markdown/MDX fidelity and multi-channel publishing.

## Platform Pillars
- **Instant Virtualized Navigation**: Smooth 60fps scrolling across 10,000+ documents.
- **Top-Level Tab Architecture**: High-level parallel product workspaces.
- **Bidirectional Roundtripping**: Visual WYSIWYG editing perfectly preserved in Git-backed Markdown.
- **Enterprise Scale**: Multi-version branching, automated localization, and instant SQLite runner exports.

> [!NOTE]
> All navigation nodes are organized into top-level tabs for clean multi-product separation.
`,
          },
          {
            title: 'Quickstart Guide',
            slug: 'quickstart',
            description: 'Five-minute setup guide to create and publish your first documentation site.',
            content: `# Quickstart Guide

Get up and running with your documentation project in less than five minutes.

## Step 1: Initialize Project
\`\`\`bash
bun create @cms/doc-site my-docs
cd my-docs
bun install
\`\`\`

## Step 2: Configure Top-Level Tabs
Edit your \`docs.json\` or configure in Studio:
\`\`\`json
{
  "navbar": {
    "tabs": [
      { "label": "Documentation", "href": "/docs" },
      { "label": "API Reference", "href": "/api" },
      { "label": "SDKs & Tools", "href": "/sdks" }
    ]
  }
}
\`\`\`

## Step 3: Run Development Server
\`\`\`bash
bun run dev
\`\`\`
`,
          },
          {
            title: 'Architecture & Engine',
            slug: 'architecture',
            description: 'Deep dive into the Rust core, Tokio asynchronous runtime, and SQLite storage.',
            content: `# Architecture & Engine

The CMS is architected as an ultra-high performance publishing engine powered by Rust and Bun.

### Architectural Tiers
\`\`\`text
+-------------------------------------------------------------+
|              Studio Next/Vite Web Application               |
+-------------------------------------------------------------+
                               | (REST / SSE / WebSockets)
                               v
+-------------------------------------------------------------+
|              Rust cms-server (Axum + Tokio)                 |
+-------------------------------------------------------------+
                               | (mTLS / SQL / Direct Memory)
                               v
+-------------------------------------------------------------+
|     PostgreSQL Primary DB  <--->  Embedded SQLite Runner    |
+-------------------------------------------------------------+
\`\`\`

All reads are cached and rendered into binary SQLite snapshots for sub-millisecond reader page loads.
`,
          },
        ],
      },
      {
        title: 'Essentials',
        slug: 'essentials',
        pages: [
          {
            title: 'Configuration Matrix',
            slug: 'configuration',
            description: 'Detailed configuration matrix for themes, navbar, and SEO properties.',
            content: `# Configuration Matrix

Customize your site appearance, branding, and navigation behavior.

| Property | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| \`navbar.tabs\` | \`NavTabItem[]\` | \`[]\` | Top-level navigation sections |
| \`navbar.anchors\` | \`NavAnchor[]\` | \`[]\` | Pinned links rendered at the top of the sidebar |
| \`theme.preset\` | \`string\` | \`"harbor"\` | Base aesthetic palette |
| \`styling.theme\` | \`string\` | \`"dark"\` | Default color mode |
`,
          },
          {
            title: 'Deployment & CI/CD',
            slug: 'deployment',
            description: 'Automated deployment pipelines and zero-downtime rolling releases.',
            content: `# Deployment & CI/CD

Continuous integration pipelines build and deploy your documentation snapshots automatically.

\`\`\`yaml
name: Deploy Docs
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run build
\`\`\`
`,
          },
          {
            title: 'Security & Permissions',
            slug: 'security',
            description: 'Role-based access controls, session tokens, and audit logs.',
            content: `# Security & Permissions

Enterprise projects strictly enforce role-based access control (RBAC).

> [!IMPORTANT]
> Access tokens are rotated cryptographically every 24 hours. Service tokens must use mTLS authentication.
`,
          },
        ],
      },
      {
        title: 'Advanced Guides',
        slug: 'advanced',
        pages: [
          {
            title: 'High-Throughput Event Streaming',
            slug: 'streaming',
            description: 'Handling real-time collaborative editing events with WebSocket backplanes.',
            content: `# High-Throughput Event Streaming

Event streams synchronize active collaborator cursors and document drafts in real time.
`,
          },
          {
            title: 'Disaster Recovery & Snapshots',
            slug: 'disaster-recovery',
            description: 'Point-in-time recovery and snapshot replication across availability zones.',
            content: `# Disaster Recovery & Snapshots

Immutable point-in-time snapshots allow immediate rollback to any historical publication version.
`,
          },
        ],
      },
    ],
  },
  {
    label: 'API Reference',
    href: '/api',
    groups: [
      {
        title: 'Overview & Auth',
        slug: 'overview',
        pages: [
          {
            title: 'Authentication & Bearer Tokens',
            slug: 'authentication',
            description: 'Authenticate API requests using project API keys or JWT bearer tokens.',
            content: `# Authentication & Bearer Tokens

All REST API requests require a valid Bearer token in the \`Authorization\` HTTP header:

\`\`\`http
GET /api/v1/projects HTTP/1.1
Host: api.cms.internal
Authorization: Bearer sec_tok_9918231a4f009b
\`\`\`
`,
          },
          {
            title: 'Error Handling & Status Codes',
            slug: 'errors',
            description: 'Standard RFC-7807 problem details and HTTP status code definitions.',
            content: `# Error Handling & Status Codes

Errors are formatted as RFC-7807 Problem Details:

\`\`\`json
{
  "type": "https://api.cms.internal/errors/not-found",
  "title": "Page Not Found",
  "status": 404,
  "detail": "No page matching slug 'unknown' was found in branch 'v1.0'."
}
\`\`\`
`,
          },
          {
            title: 'Rate Limits & Concurrency',
            slug: 'rate-limits',
            description: 'API rate limits, throttling headers, and burst allocations.',
            content: `# Rate Limits & Concurrency

Standard tier accounts are limited to 1,000 requests per minute with a burst buffer of 200 requests.
`,
          },
        ],
      },
      {
        title: 'Endpoints',
        slug: 'endpoints',
        pages: [
          {
            title: 'Projects API',
            slug: 'projects',
            description: 'List, retrieve, and update project configurations.',
            content: `# Projects API

### \`GET /api/v1/projects/:id\`
Retrieves project metadata, active versions, and configured navbar tabs.
`,
          },
          {
            title: 'Pages & Documents API',
            slug: 'pages',
            description: 'Create, update, move, and query documentation pages and groups.',
            content: `# Pages & Documents API

### \`POST /api/v1/projects/:id/pages\`
Creates a new page or group in the specified branch and locale.
`,
          },
          {
            title: 'Export & Deployment API',
            slug: 'exports',
            description: 'Trigger asynchronous compilation of SQLite, PDF, and HTML packages.',
            content: `# Export & Deployment API

### \`POST /api/v1/projects/:id/exports\`
Enqueues a background compilation worker for high-performance offline distribution.
`,
          },
        ],
      },
    ],
  },
  {
    label: 'SDKs & Tools',
    href: '/sdks',
    groups: [
      {
        title: 'Official Libraries',
        slug: 'libraries',
        pages: [
          {
            title: 'TypeScript & Node.js SDK',
            slug: 'typescript',
            description: 'Type-safe client library for Node.js, Bun, and browser applications.',
            content: `# TypeScript & Node.js SDK

Install via Bun or npm:
\`\`\`bash
bun add @cms/sdk
\`\`\`

\`\`\`typescript
import { CmsClient } from '@cms/sdk';

const client = new CmsClient({
  baseUrl: 'http://localhost:3000',
  token: process.env.CMS_API_KEY,
});

const pages = await client.pages.list('proj-id', { languageId: 'en' });
console.log(pages);
\`\`\`
`,
          },
          {
            title: 'Rust Crate (cms-sdk)',
            slug: 'rust',
            description: 'High-performance native Rust client built on reqwest and serde.',
            content: `# Rust Crate (cms-sdk)

Add to \`Cargo.toml\`:
\`\`\`toml
[dependencies]
cms-sdk = "0.9"
tokio = { version = "1", features = ["full"] }
\`\`\`
`,
          },
          {
            title: 'Python Async Client',
            slug: 'python',
            description: 'Asynchronous Python client supporting asyncio and Pydantic models.',
            content: `# Python Async Client

\`\`\`bash
pip install cms-sdk-py
\`\`\`
`,
          },
        ],
      },
      {
        title: 'CLI & Automation',
        slug: 'tools',
        pages: [
          {
            title: 'CLI Installation & Setup',
            slug: 'cli-install',
            description: 'Install the cms CLI for command-line management and CI deployment.',
            content: `# CLI Installation & Setup

\`\`\`bash
curl -fsSL https://get.cms.internal/install.sh | sh
cms auth login
\`\`\`
`,
          },
          {
            title: 'Commands Reference',
            slug: 'cli-commands',
            description: 'Full reference of commands, flags, and environment variables.',
            content: `# Commands Reference

- \`cms projects list\`
- \`cms pages export --project <id>\`
- \`cms deploy --branch <branch>\`
`,
          },
        ],
      },
    ],
  },
];

async function main() {
  console.log('='.repeat(70));
  console.log('RESEEDING BACKEND DATA BASED ON NEW TAB-ROOT STRUCTURE');
  console.log('='.repeat(70));

  // 1. Verify project exists
  const [project] = await sql<{ id: string }[]>`
    SELECT id FROM "Project" WHERE id = ${PROJECT_ID}
  `;
  if (!project) {
    throw new Error(`Project ${PROJECT_ID} not found`);
  }

  // 2. Fetch branches and languages
  const branches = await sql<{ id: string; slug: string; is_default: boolean }[]>`
    SELECT id, slug, is_default FROM "Branch" WHERE project_id = ${PROJECT_ID}
  `;
  const defaultBranch = branches.find((b) => b.is_default) ?? branches[0];
  console.log(`Using default branch: ${defaultBranch.slug} (${defaultBranch.id})`);

  const languages = await sql<{ id: string; code: string; is_default: boolean }[]>`
    SELECT id, code, is_default FROM "Language" WHERE project_id = ${PROJECT_ID}
  `;
  console.log(`Configuring across ${languages.length} languages: ${languages.map((l) => l.code).join(', ')}`);

  // 3. Clear existing pages, snapshots, export jobs for this project
  console.log('\nClearing existing project pages and export artifacts...');
  await sql`DELETE FROM "ExportJob" WHERE project_id = ${PROJECT_ID}`;
  await sql`DELETE FROM "ExportSnapshot" WHERE project_id = ${PROJECT_ID}`;
  await sql`DELETE FROM "Page" WHERE project_id = ${PROJECT_ID}`;
  console.log('✓ Cleaned all previous pages from database.');

  // 4. Update Project Navbar Config with Top-Level Tabs, Anchors, and Links
  const navbarConfig = {
    tabs: TABS.map((t, idx) => ({
      label: t.label,
      href: t.href,
      position: idx,
    })),
    anchors: [
      { label: 'Community Forum', href: 'https://community.example.com', external: true },
      { label: 'Changelog', href: '/docs/changelog', external: false },
    ],
    links: [
      { label: 'Support', href: 'https://support.example.com', external: true },
      { label: 'GitHub', href: 'https://github.com', external: true },
    ],
    showSearch: true,
    changelog: false,
  };

  const jsonStr = JSON.stringify(navbarConfig);
  await (sql as any).unsafe(`
    UPDATE "Project"
    SET config = jsonb_set(COALESCE(config, '{}'::jsonb), '{navbar}', '${jsonStr}'::jsonb),
        updated_at = NOW()
    WHERE id = '${PROJECT_ID}'
  `);
  console.log('✓ Updated project navbar config with top-level tabs.');

  // Also update languages config to inherit navbar tabs
  await (sql as any).unsafe(`
    UPDATE "Language"
    SET config = jsonb_set(COALESCE(config, '{}'::jsonb), '{navbar}', '${jsonStr}'::jsonb),
        updated_at = NOW()
    WHERE project_id = '${PROJECT_ID}'
  `);
  console.log('✓ Updated language navbar configs.');

  // 5. Seed Groups and Pages under each Tab
  console.log('\nSeeding structured tabs, groups, and pages...');
  let totalSeeded = 0;

  for (const lang of languages) {
    console.log(`\n  Seeding locale '${lang.code}'...`);
    let globalPosition = 0;

    for (const tab of TABS) {
      const tabBaseHref = tab.href.replace(/^\/+/, ''); // e.g. "docs", "api", "sdks"

      for (let gIdx = 0; gIdx < tab.groups.length; gIdx++) {
        const groupDef = tab.groups[gIdx];
        const groupId = crypto.randomUUID();
        const groupSlug = `${tabBaseHref}-${groupDef.slug}`;
        const groupPath = `/${tabBaseHref}/${groupDef.slug}`;

        // Insert Group (kind: 'GROUP', parent_id: null, path: /docs/getting-started)
        await sql`
          INSERT INTO "Page" (
            id, project_id, branch_id, language_id, parent_id, kind,
            path, slug, title, description, content, position,
            is_published, is_indexed, created_at, updated_at
          )
          VALUES (
            ${groupId}, ${PROJECT_ID}, ${defaultBranch.id}, ${lang.id}, NULL, 'GROUP',
            ${groupPath}, ${groupSlug}, ${groupDef.title}, ${`Category: ${groupDef.title}`}, '',
            ${globalPosition++}, true, true, NOW(), NOW()
          )
        `;
        totalSeeded++;

        // Insert Child Pages under Group
        for (let pIdx = 0; pIdx < groupDef.pages.length; pIdx++) {
          const pageDef = groupDef.pages[pIdx];
          const pageId = crypto.randomUUID();
          const pagePath = `/${tabBaseHref}/${groupDef.slug}/${pageDef.slug}`;
          const pageSlug = `${tabBaseHref}-${groupDef.slug}-${pageDef.slug}`;

          await sql`
            INSERT INTO "Page" (
              id, project_id, branch_id, language_id, parent_id, kind,
              path, slug, title, description, content, position,
              is_published, is_indexed, created_at, updated_at
            )
            VALUES (
              ${pageId}, ${PROJECT_ID}, ${defaultBranch.id}, ${lang.id}, ${groupId}, 'PAGE',
              ${pagePath}, ${pageSlug}, ${pageDef.title}, ${pageDef.description},
              ${pageDef.content}, ${pIdx}, true, true, NOW(), NOW()
            )
          `;
          totalSeeded++;
        }
      }
    }
  }

  // 6. Create clean export snapshot
  const snapshotId = crypto.randomUUID();
  await sql`
    INSERT INTO "ExportSnapshot" (
      id, project_id, branch_id, deployment_version, pages_count, created_at
    )
    VALUES (
      ${snapshotId}, ${PROJECT_ID}, ${defaultBranch.id}, 1, ${totalSeeded}, NOW()
    )
  `;
  console.log(`\n✓ Created fresh ExportSnapshot: ${snapshotId}`);

  console.log(`\n${'='.repeat(70)}`);
  console.log('RESEED COMPLETE!');
  console.log(`Total Pages/Groups Seeded: ${totalSeeded}`);
  console.log('Top-Level Tabs: Documentation (/docs), API Reference (/api), SDKs & Tools (/sdks)');
  console.log('='.repeat(70));

  await sql.close();
}

main().catch((err) => {
  console.error('❌ Reseed failed:', err);
  process.exit(1);
});
