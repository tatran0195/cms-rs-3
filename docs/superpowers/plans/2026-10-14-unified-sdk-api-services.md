# Unified SDK API Services & Fluent Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize all API services, domain workflows, typed URL generators, and TanStack Query hooks into `@cms/sdk` with fluent builder patterns, eliminating raw endpoints and direct fetch calls across frontend code.

**Architecture:**
- `@cms/sdk`: Pure, framework-agnostic TypeScript core providing `CmsClientBuilder`, `CmsClient`, scoped project contexts (`client.project(id)`), multi-step workflows (`client.assets.upload`), and typed URL builders (`getWebhookUrl`, `getOpenApiSpecUrl`, `getEndpointUrl`).
- `@cms/sdk/react`: Subpath export providing optional TanStack Query v5 bindings, centralized `queryKeys`, `CmsClientProvider`, and unified hooks.
- `apps/studio` & `packages/site`: Consumes `@cms/sdk` and `@cms/sdk/react` exclusively, removing ad-hoc service files (`site-service.ts`) and replacing all raw endpoint strings.

**Tech Stack:** TypeScript, Ky, TanStack Query v5, React, Vitest, Biome.

## Global Constraints
- Pure Core SDK: Root `@cms/sdk` MUST have zero dependencies on React or DOM APIs.
- Platform Purpose: Internal deployment only. No plan, billing, or pricing features.
- Zero Endpoint Leaks: No raw strings matching `/api/*` in UI components or frontend route loaders.
- Backward Compatibility: Keep existing `apps/studio/src/shared/hooks/api/` re-exports aliased to `@cms/sdk/react` during transition.

---

### Task 1: Fluent Client Configuration Builder (`CmsClientBuilder`)

**Files:**
- Create: `packages/sdk/src/builder.ts`
- Modify: `packages/sdk/src/client.ts`
- Modify: `packages/sdk/src/index.ts`
- Test: `packages/sdk/test/builder.test.ts`

**Interfaces:**
- Produces: `CmsClientBuilder` with chaining methods:
  - `withBaseUrl(url: string): this`
  - `withHeaders(headers: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>)): this`
  - `withLocale(getLocaleFn: () => string | undefined): this`
  - `withCredentials(credentials: RequestCredentials): this`
  - `withTimeout(timeoutMs: number): this`
  - `withRetry(retryOptions: { limit?: number; statusCodes?: number[] }): this`
  - `withCustomFetch(customFetch: typeof fetch): this`
  - `build(): CmsClient`

- [ ] **Step 1: Write the failing test for CmsClientBuilder**

Create `packages/sdk/test/builder.test.ts`:
```typescript
import { describe, expect, it } from 'vitest';
import { CmsClientBuilder, CmsClient } from '../src';

describe('CmsClientBuilder', () => {
  it('builds a CmsClient with fluent options', () => {
    const client = CmsClientBuilder.create()
      .withBaseUrl('https://api.cms.internal')
      .withLocale(() => 'en')
      .withCredentials('include')
      .withTimeout(15000)
      .withRetry({ limit: 2 })
      .build();

    expect(client).toBeInstanceOf(CmsClient);
    expect(client.http.options.baseUrl).toBe('https://api.cms.internal');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --filter @cms/sdk test test/builder.test.ts`
Expected: FAIL with "CmsClientBuilder is not defined"

- [ ] **Step 3: Implement CmsClientBuilder**

Create `packages/sdk/src/builder.ts`:
```typescript
import { CmsClient, type CmsClientOptions } from './client';

export class CmsClientBuilder {
  private options: CmsClientOptions = {};

  static create(): CmsClientBuilder {
    return new CmsClientBuilder();
  }

  withBaseUrl(baseUrl: string): this {
    this.options.baseUrl = baseUrl;
    return this;
  }

  withHeaders(
    headers: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>)
  ): this {
    this.options.headers = headers;
    return this;
  }

  withLocale(getLocaleFn: () => string | undefined): this {
    const existingHeaders = this.options.headers;
    this.options.headers = async () => {
      const base =
        typeof existingHeaders === 'function'
          ? await existingHeaders()
          : existingHeaders || {};
      const locale = getLocaleFn();
      if (locale) {
        return { ...base, 'x-cms-locale': locale };
      }
      return base;
    };
    return this;
  }

  withCredentials(credentials: RequestCredentials): this {
    const existingFetch = this.options.fetch;
    this.options.fetch = (input, init) => {
      const customInit = { ...init, credentials };
      return existingFetch ? existingFetch(input, customInit) : fetch(input, customInit);
    };
    return this;
  }

  withTimeout(timeoutMs: number): this {
    this.options.timeout = timeoutMs;
    return this;
  }

  withRetry(retryOptions: { limit?: number; statusCodes?: number[] }): this {
    this.options.retry = retryOptions;
    return this;
  }

  withCustomFetch(customFetch: typeof fetch): this {
    this.options.fetch = customFetch;
    return this;
  }

  build(): CmsClient {
    return new CmsClient(this.options);
  }
}
```

Export `CmsClientBuilder` from `packages/sdk/src/index.ts`:
```typescript
export * from './builder';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --filter @cms/sdk test test/builder.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/builder.ts packages/sdk/src/index.ts packages/sdk/test/builder.test.ts
git commit -m "feat(sdk): add fluent CmsClientBuilder"
```

---

### Task 2: Typed Endpoint URL Builders in Core SDK

**Files:**
- Modify: `packages/sdk/src/resources/git.ts`
- Modify: `packages/sdk/src/resources/public.ts`
- Create: `packages/sdk/src/resources/mcp.ts`
- Modify: `packages/sdk/src/resources/index.ts`
- Test: `packages/sdk/test/urls.test.ts`

**Interfaces:**
- Produces:
  - `client.git.getWebhookUrl(projectId: string, baseUrl?: string): string`
  - `client.public.getOpenApiSpecUrl(projectId: string, baseUrl?: string): string`
  - `client.mcp.getEndpointUrl(baseUrl?: string): string`

- [ ] **Step 1: Write the failing test for URL builders**

Create `packages/sdk/test/urls.test.ts`:
```typescript
import { describe, expect, it } from 'vitest';
import { createCmsClient } from '../src';

describe('Endpoint URL Builders', () => {
  const client = createCmsClient({ baseUrl: 'https://cms.internal:4310' });

  it('builds Git webhook URL', () => {
    const url = client.git.getWebhookUrl('proj-456');
    expect(url).toBe('https://cms.internal:4310/api/public/git/webhook/proj-456');
  });

  it('builds OpenAPI public spec URL', () => {
    const url = client.public.getOpenApiSpecUrl('proj-456');
    expect(url).toBe('https://cms.internal:4310/api/public/sites/proj-456/openapi.json');
  });

  it('builds MCP endpoint URL', () => {
    const url = client.mcp.getEndpointUrl();
    expect(url).toBe('https://cms.internal:4310/api/mcp');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --filter @cms/sdk test test/urls.test.ts`
Expected: FAIL with "client.git.getWebhookUrl is not a function"

- [ ] **Step 3: Implement URL builders**

In `packages/sdk/src/resources/git.ts`:
```typescript
  getWebhookUrl(projectId: string, baseUrl?: string): string {
    const base = baseUrl || this.http.options.baseUrl || '';
    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${cleanBase}/api/public/git/webhook/${encodeURIComponent(projectId)}`;
  }
```

In `packages/sdk/src/resources/public.ts`:
```typescript
  getOpenApiSpecUrl(projectId: string, baseUrl?: string): string {
    const base = baseUrl || this.http.options.baseUrl || '';
    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${cleanBase}/api/public/sites/${encodeURIComponent(projectId)}/openapi.json`;
  }
```

In `packages/sdk/src/resources/mcp.ts`:
```typescript
import type { HttpClient } from '../http';

export interface McpAuditEvent {
  id: string;
  toolName: string;
  caller: string;
  status: string;
  createdAt: string;
  [key: string]: unknown;
}

export class McpResource {
  constructor(private readonly http: HttpClient) {}

  getEndpointUrl(baseUrl?: string): string {
    const base = baseUrl || this.http.options.baseUrl || '';
    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${cleanBase}/api/mcp`;
  }

  async listAuditEvents(params?: { limit?: number; offset?: number }): Promise<McpAuditEvent[]> {
    return this.http.get<McpAuditEvent[]>('/api/mcp/audit-events', params);
  }
}
```

In `packages/sdk/src/client.ts`: Register `this.mcp = new McpResource(this.http)`.
In `packages/sdk/src/resources/index.ts`: Export `* from './mcp'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --filter @cms/sdk test test/urls.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/resources/git.ts packages/sdk/src/resources/public.ts packages/sdk/src/resources/mcp.ts packages/sdk/src/resources/index.ts packages/sdk/src/client.ts packages/sdk/test/urls.test.ts
git commit -m "feat(sdk): add typed endpoint URL builders and McpResource"
```

---

### Task 3: Missing Backend Resources (`ExportsResource` & `AiResource`)

**Files:**
- Create: `packages/sdk/src/resources/exports.ts`
- Create: `packages/sdk/src/resources/ai.ts`
- Modify: `packages/sdk/src/resources/index.ts`
- Modify: `packages/sdk/src/client.ts`
- Test: `packages/sdk/test/exports.test.ts`

**Interfaces:**
- Produces:
  - `client.exports.listJobs(params?): Promise<ExportJob[]>`
  - `client.exports.createJob(payload): Promise<ExportJob>`
  - `client.exports.getJob(jobId): Promise<ExportJob>`
  - `client.exports.getDownloadUrl(jobId, artifactId?): string`
  - `client.exports.listSchedules(projectId): Promise<ExportSchedule[]>`
  - `client.exports.createSchedule(projectId, payload): Promise<ExportSchedule>`
  - `client.exports.updateSchedule(scheduleId, payload): Promise<ExportSchedule>`
  - `client.exports.deleteSchedule(scheduleId): Promise<{ success: boolean }>`
  - `client.exports.runSchedule(projectId, scheduleId): Promise<ExportJob>`
  - `client.ai.prompt(projectId, payload): Promise<{ result: string }>`

- [ ] **Step 1: Write the failing test for ExportsResource**

Create `packages/sdk/test/exports.test.ts`:
```typescript
import { describe, expect, it, vi } from 'vitest';
import { createCmsClient } from '../src';

describe('ExportsResource', () => {
  it('calls export jobs and schedules endpoints', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ id: 'job-1', status: 'COMPLETED' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const client = createCmsClient({ baseUrl: 'https://cms.test', fetch: mockFetch });
    const jobs = await client.exports.listJobs();
    expect(jobs[0].id).toBe('job-1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/app/export/jobs'),
      expect.anything()
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --filter @cms/sdk test test/exports.test.ts`
Expected: FAIL with "client.exports is undefined"

- [ ] **Step 3: Implement ExportsResource & AiResource**

Create `packages/sdk/src/resources/exports.ts`:
```typescript
import type { HttpClient } from '../http';

export interface ExportJob {
  id: string;
  projectId?: string;
  status: string;
  createdAt: string;
  [key: string]: unknown;
}

export interface ExportSchedule {
  id: string;
  projectId: string;
  cronExpression: string;
  enabled: boolean;
  [key: string]: unknown;
}

export class ExportsResource {
  constructor(private readonly http: HttpClient) {}

  async listJobs(params?: { limit?: number; offset?: number }): Promise<ExportJob[]> {
    return this.http.get<ExportJob[]>('/api/app/export/jobs', params);
  }

  async createJob(payload: Record<string, unknown>): Promise<ExportJob> {
    return this.http.post<ExportJob>('/api/app/export/jobs', payload);
  }

  async getJob(id: string): Promise<ExportJob> {
    return this.http.get<ExportJob>(`/api/app/export/jobs/${id}`);
  }

  getDownloadUrl(jobId: string, artifactId?: string, baseUrl?: string): string {
    const base = baseUrl || this.http.options.baseUrl || '';
    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
    return artifactId
      ? `${cleanBase}/api/app/projects/export/artifacts/${artifactId}/download`
      : `${cleanBase}/api/app/export/jobs/${jobId}/download`;
  }

  async listSchedules(projectId: string): Promise<ExportSchedule[]> {
    return this.http.get<ExportSchedule[]>(`/api/app/export/projects/${projectId}/schedules`);
  }

  async createSchedule(projectId: string, payload: Record<string, unknown>): Promise<ExportSchedule> {
    return this.http.post<ExportSchedule>(`/api/app/export/projects/${projectId}/schedules`, payload);
  }

  async updateSchedule(scheduleId: string, payload: Record<string, unknown>): Promise<ExportSchedule> {
    return this.http.put<ExportSchedule>(`/api/app/export/schedules/${scheduleId}`, payload);
  }

  async deleteSchedule(scheduleId: string): Promise<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`/api/app/export/schedules/${scheduleId}`);
  }

  async runSchedule(projectId: string, scheduleId: string): Promise<ExportJob> {
    return this.http.post<ExportJob>(`/api/app/projects/${projectId}/exports/schedules/${scheduleId}/run`);
  }
}
```

Create `packages/sdk/src/resources/ai.ts`:
```typescript
import type { HttpClient } from '../http';

export class AiResource {
  constructor(private readonly http: HttpClient) {}

  async prompt(projectId: string, payload: { prompt: string; context?: unknown }): Promise<{ result: string }> {
    return this.http.post<{ result: string }>(`/api/app/projects/${projectId}/ai`, payload);
  }
}
```

In `packages/sdk/src/client.ts`: Register `this.exports` and `this.ai`.
In `packages/sdk/src/resources/index.ts`: Export `* from './exports'` and `* from './ai'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --filter @cms/sdk test test/exports.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/resources/exports.ts packages/sdk/src/resources/ai.ts packages/sdk/src/resources/index.ts packages/sdk/src/client.ts packages/sdk/test/exports.test.ts
git commit -m "feat(sdk): add ExportsResource and AiResource"
```

---

### Task 4: High-Level Multi-Step Asset Upload Workflow in `AssetsResource`

**Files:**
- Modify: `packages/sdk/src/resources/assets.ts`
- Test: `packages/sdk/test/assets-upload.test.ts`

**Interfaces:**
- Produces: `client.assets.upload(projectId, file, options?): Promise<AssetResponse>`
- Eliminates: Direct `fetch(presign.uploadUrl, { method: 'PUT', ... })` in UI code.

- [ ] **Step 1: Write the failing test for high-level upload**

Create `packages/sdk/test/assets-upload.test.ts`:
```typescript
import { describe, expect, it, vi } from 'vitest';
import { createCmsClient } from '../src';

describe('AssetsResource.upload', () => {
  it('executes the 3-step presign -> PUT -> confirm lifecycle', async () => {
    const fetchMock = vi.fn().mockImplementation((input: string, init?: RequestInit) => {
      if (input.includes('/assets/presign')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              assetId: 'asset-123',
              uploadUrl: 'https://storage.internal/upload/123',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      }
      if (input === 'https://storage.internal/upload/123') {
        expect(init?.method).toBe('PUT');
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      if (input.includes('/assets/confirm')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ id: 'asset-123', filename: 'test.png', sizeBytes: 1024 }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      }
      return Promise.reject(new Error(`Unhandled URL: ${input}`));
    });

    const client = createCmsClient({ baseUrl: 'https://cms.test', fetch: fetchMock });
    const file = new File(['mock data'], 'test.png', { type: 'image/png' });

    const result = await client.assets.upload('proj-1', file);
    expect(result.id).toBe('asset-123');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --filter @cms/sdk test test/assets-upload.test.ts`
Expected: FAIL with "client.assets.upload is not a function"

- [ ] **Step 3: Implement client.assets.upload**

In `packages/sdk/src/resources/assets.ts`:
```typescript
export interface AssetUploadOptions {
  mimeType?: string;
  onProgress?: (bytesUploaded: number, totalBytes: number) => void;
}

// Inside AssetsResource:
  async upload<T = Record<string, unknown>>(
    projectId: string,
    file: File | Blob | { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer>; type?: string },
    options?: AssetUploadOptions
  ): Promise<T> {
    const filename = 'name' in file ? file.name : 'upload.bin';
    const sizeBytes = file.size;
    const mimeType = options?.mimeType || file.type || 'application/octet-stream';

    // 1. Presign
    const presign = await this.presign(projectId, {
      filename,
      mimeType,
      sizeBytes,
    });

    // 2. Binary PUT
    const customFetch = this.http.options.fetch || fetch;
    const uploadRes = await customFetch(presign.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType,
      },
      body: file as BodyInit,
    });

    if (!uploadRes.ok) {
      throw new Error(`Upload failed with status ${uploadRes.status}`);
    }

    // 3. Confirm
    return this.confirm<T>(projectId, {
      assetId: presign.assetId,
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --filter @cms/sdk test test/assets-upload.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/resources/assets.ts packages/sdk/test/assets-upload.test.ts
git commit -m "feat(sdk): add high-level client.assets.upload workflow"
```

---

### Task 5: Scoped Project Context Builder (`client.project(projectId)`)

**Files:**
- Create: `packages/sdk/src/project-context.ts`
- Modify: `packages/sdk/src/client.ts`
- Modify: `packages/sdk/src/index.ts`
- Test: `packages/sdk/test/project-context.test.ts`

**Interfaces:**
- Produces: `client.project(projectId)` returning `ScopedProjectContext` with scoped resources (`pages`, `deployments`, `assets`, `git`, `domains`, `addons`, `apiKeys`, `readerAccess`, `openapi`) that pre-bind `projectId`.

- [ ] **Step 1: Write the failing test for ScopedProjectContext**

Create `packages/sdk/test/project-context.test.ts`:
```typescript
import { describe, expect, it, vi } from 'vitest';
import { createCmsClient } from '../src';

describe('ScopedProjectContext', () => {
  it('pre-binds projectId across nested resource operations', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ id: 'page-1', title: 'Home' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const client = createCmsClient({ baseUrl: 'https://cms.test', fetch: mockFetch });
    const project = client.project('proj-123');

    const pages = await project.pages.list();
    expect(pages).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/projects/proj-123/pages'),
      expect.anything()
    );

    const webhookUrl = project.git.getWebhookUrl();
    expect(webhookUrl).toBe('https://cms.test/api/public/git/webhook/proj-123');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --filter @cms/sdk test test/project-context.test.ts`
Expected: FAIL with "client.project is not a function"

- [ ] **Step 3: Implement ScopedProjectContext**

Create `packages/sdk/src/project-context.ts`:
```typescript
import type { CmsClient } from './client';
import type { CreatePageRequest, UpdatePageRequest } from './types';
import type { AssetUploadOptions } from './resources/assets';

export class ScopedPagesResource {
  constructor(private readonly client: CmsClient, private readonly projectId: string) {}

  list(params?: { languageId?: string; branchId?: string }) {
    return this.client.pages.list(this.projectId, params);
  }
  get(pageId: string) {
    return this.client.pages.get(this.projectId, pageId);
  }
  create(payload: CreatePageRequest | Record<string, unknown>) {
    return this.client.pages.create(this.projectId, payload);
  }
  update(pageId: string, payload: UpdatePageRequest | Record<string, unknown>) {
    return this.client.pages.update(this.projectId, pageId, payload);
  }
  delete(pageId: string) {
    return this.client.pages.delete(this.projectId, pageId);
  }
  reorder(payload: { items: Array<{ id: string; parentId: string | null; position: number }> }) {
    return this.client.pages.reorder(this.projectId, payload);
  }
}

export class ScopedDeploymentsResource {
  constructor(private readonly client: CmsClient, private readonly projectId: string) {}

  list() {
    return this.client.deployments.list(this.projectId);
  }
  getChanges() {
    return this.client.deployments.getChanges(this.projectId);
  }
  publish(message?: string) {
    return this.client.deployments.trigger(this.projectId, { message });
  }
  publishAnyway(message?: string) {
    return this.client.deployments.forcePublish(this.projectId, { message });
  }
  rollback(deploymentId: string) {
    return this.client.deployments.rollback(this.projectId, deploymentId);
  }
}

export class ScopedAssetsResource {
  constructor(private readonly client: CmsClient, private readonly projectId: string) {}

  upload(
    file: File | Blob | { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer>; type?: string },
    options?: AssetUploadOptions
  ) {
    return this.client.assets.upload(this.projectId, file, options);
  }
}

export class ScopedGitResource {
  constructor(private readonly client: CmsClient, private readonly projectId: string) {}

  getStatus() {
    return this.client.git.getStatus(this.projectId);
  }
  getWebhookUrl(baseUrl?: string) {
    return this.client.git.getWebhookUrl(this.projectId, baseUrl);
  }
}

export class ScopedProjectContext {
  readonly pages: ScopedPagesResource;
  readonly deployments: ScopedDeploymentsResource;
  readonly assets: ScopedAssetsResource;
  readonly git: ScopedGitResource;

  constructor(readonly client: CmsClient, readonly id: string) {
    this.pages = new ScopedPagesResource(client, id);
    this.deployments = new ScopedDeploymentsResource(client, id);
    this.assets = new ScopedAssetsResource(client, id);
    this.git = new ScopedGitResource(client, id);
  }

  get() {
    return this.client.projects.get(this.id);
  }
  update(payload: Record<string, unknown>) {
    return this.client.projects.update(this.id, payload);
  }
  delete() {
    return this.client.projects.delete(this.id);
  }
}
```

Add `project(projectId: string): ScopedProjectContext` method to `CmsClient` in `packages/sdk/src/client.ts`.
Export `ScopedProjectContext` from `packages/sdk/src/index.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --filter @cms/sdk test test/project-context.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/project-context.ts packages/sdk/src/client.ts packages/sdk/src/index.ts packages/sdk/test/project-context.test.ts
git commit -m "feat(sdk): add ScopedProjectContext builder (client.project)"
```

---

### Task 6: Unified Sites Resource & Service Migration in `@cms/sdk`

**Files:**
- Create: `packages/sdk/src/resources/sites.ts`
- Modify: `packages/sdk/src/client.ts`
- Modify: `packages/sdk/src/resources/index.ts`
- Test: `packages/sdk/test/sites.test.ts`

**Interfaces:**
- Produces: `client.sites` (and `createSiteService(client)`) providing:
  - `getSite(projectId, options?)`
  - `getPage(projectId, path, options?)`
  - `listChangelog(projectId)`
  - `getGitPreview(token)`
  - `search(projectId, query, options?)`
  - `answer(projectId, query, options?)`
  - `recordEvent(projectId, event)`

- [ ] **Step 1: Write the failing test for SitesResource**

Create `packages/sdk/test/sites.test.ts`:
```typescript
import { describe, expect, it, vi } from 'vitest';
import { createCmsClient } from '../src';

describe('SitesResource', () => {
  it('calls public site endpoints with query parameters', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ hits: [{ id: 'hit-1', title: 'Match' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const client = createCmsClient({ baseUrl: 'https://cms.test', fetch: mockFetch });
    const hits = await client.sites.search('proj-1', 'auth', { language: 'en', limit: 5 });

    expect(hits).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/public/sites/proj-1/search?q=auth&limit=5&lang=en'),
      expect.anything()
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --filter @cms/sdk test test/sites.test.ts`
Expected: FAIL with "client.sites is undefined"

- [ ] **Step 3: Implement SitesResource**

Create `packages/sdk/src/resources/sites.ts`:
```typescript
import type { HttpClient } from '../http';

export interface SiteShell {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface SitePage {
  id: string;
  path: string;
  content: string;
  [key: string]: unknown;
}

export interface ChangelogEntry {
  id: string;
  title: string;
  publishedAt: string;
  [key: string]: unknown;
}

export interface SiteSearchHit {
  id: string;
  title: string;
  path: string;
  snippet?: string;
  [key: string]: unknown;
}

export interface SearchAnswer {
  answer: string;
  references?: Array<{ id: string; title: string; path: string }>;
  [key: string]: unknown;
}

export class SitesResource {
  constructor(private readonly http: HttpClient) {}

  async getSite<T = SiteShell>(projectId: string, options?: { language?: string; version?: string }): Promise<T> {
    const params: Record<string, string> = {};
    if (options?.language) params.lang = options.language;
    if (options?.version) params.version = options.version;
    return this.http.get<T>(`/api/public/sites/${projectId}`, Object.keys(params).length ? params : undefined);
  }

  async getPage<T = SitePage>(projectId: string, path: string, options?: { language?: string; version?: string }): Promise<T> {
    const params: Record<string, string> = { path };
    if (options?.language) params.lang = options.language;
    if (options?.version) params.version = options.version;
    return this.http.get<T>(`/api/public/sites/${projectId}/page`, params);
  }

  async listChangelog<T = ChangelogEntry>(projectId: string): Promise<T[]> {
    return this.http.get<T[]>(`/api/public/sites/${projectId}/changelog`);
  }

  async getGitPreview(token: string): Promise<string> {
    const res = await this.http.get<unknown>(`/api/public/git/previews/${token}`);
    return JSON.stringify(res);
  }

  async search<T = SiteSearchHit>(
    projectId: string,
    query: string,
    options?: { language?: string; version?: string; limit?: number }
  ): Promise<T[]> {
    const params: Record<string, string> = { q: query };
    if (options?.limit) params.limit = String(options.limit);
    if (options?.language) params.lang = options.language;
    if (options?.version) params.version = options.version;

    const res = await this.http.get<{ hits: T[] }>(`/api/public/sites/${projectId}/search`, params);
    return res.hits || [];
  }

  async answer<T = SearchAnswer>(
    projectId: string,
    query: string,
    options?: { language?: string; version?: string }
  ): Promise<T> {
    const body: Record<string, unknown> = {
      question: query,
      q: query,
      query,
    };
    if (options?.language) body.lang = options.language;
    if (options?.version) body.version = options.version;
    return this.http.post<T>(`/api/public/sites/${projectId}/answer`, body);
  }

  async recordEvent(projectId: string, event: Record<string, unknown>): Promise<void> {
    await this.http.post<void>(`/api/public/sites/${projectId}/events`, event);
  }
}
```

Register `this.sites = new SitesResource(this.http)` on `CmsClient` in `packages/sdk/src/client.ts`.
Export from `packages/sdk/src/resources/index.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --filter @cms/sdk test test/sites.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/resources/sites.ts packages/sdk/src/client.ts packages/sdk/src/resources/index.ts packages/sdk/test/sites.test.ts
git commit -m "feat(sdk): add SitesResource unifying site services"
```

---

### Task 7: `@cms/sdk/react` Subpath Export with Query Keys & Provider

**Files:**
- Modify: `packages/sdk/package.json`
- Create: `packages/sdk/src/react/index.ts`
- Create: `packages/sdk/src/react/context.tsx`
- Create: `packages/sdk/src/react/query-keys.ts`
- Test: `packages/sdk/test/react/context.test.tsx`

**Interfaces:**
- Produces:
  - Subpath `@cms/sdk/react`
  - `CmsClientProvider` & `useCmsClient()`
  - Centralized `queryKeys`

- [ ] **Step 1: Configure package.json exports & peerDependencies**

In `packages/sdk/package.json`, add:
```json
  "exports": {
    ".": "./src/index.ts",
    "./react": "./src/react/index.ts",
    "./types": "./src/types/index.ts",
    "./errors": "./src/errors.ts"
  },
  "peerDependencies": {
    "@tanstack/react-query": "^5.0.0",
    "react": "^18.0.0 || ^19.0.0"
  },
  "peerDependenciesMeta": {
    "@tanstack/react-query": { "optional": true },
    "react": { "optional": true }
  }
```

Add `@tanstack/react-query` and `react`, `@types/react` to `devDependencies` of `packages/sdk`.

- [ ] **Step 2: Write test for CmsClientProvider**

Create `packages/sdk/test/react/context.test.tsx`:
```tsx
import { renderHook } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { createCmsClient } from '../../src';
import { CmsClientProvider, useCmsClient } from '../../src/react';

describe('CmsClientProvider & useCmsClient', () => {
  it('supplies CmsClient through React Context', () => {
    const client = createCmsClient({ baseUrl: 'https://test.internal' });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <CmsClientProvider client={client}>{children}</CmsClientProvider>
    );

    const { result } = renderHook(() => useCmsClient(), { wrapper });
    expect(result.current).toBe(client);
  });
});
```

- [ ] **Step 3: Implement CmsClientProvider & queryKeys**

Create `packages/sdk/src/react/context.tsx`:
```tsx
import React, { createContext, useContext, ReactNode } from 'react';
import type { CmsClient } from '../client';

const CmsContext = createContext<CmsClient | null>(null);

export function CmsClientProvider({ client, children }: { client: CmsClient; children: ReactNode }) {
  return <CmsContext.Provider value={client}>{children}</CmsContext.Provider>;
}

export function useCmsClient(): CmsClient {
  const client = useContext(CmsContext);
  if (!client) {
    throw new Error('useCmsClient must be used within a CmsClientProvider');
  }
  return client;
}
```

Create `packages/sdk/src/react/query-keys.ts` moving query keys from `apps/studio/src/shared/hooks/api/query-keys.ts`.
Create `packages/sdk/src/react/index.ts`:
```typescript
export * from './context';
export * from './query-keys';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --filter @cms/sdk test test/react/context.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/package.json packages/sdk/src/react packages/sdk/test/react/context.test.tsx
git commit -m "feat(sdk): add @cms/sdk/react subpath export with provider and queryKeys"
```

---

### Task 8: Unified React Query Hooks in `@cms/sdk/react`

**Files:**
- Create: `packages/sdk/src/react/hooks/projects.ts`
- Create: `packages/sdk/src/react/hooks/pages.ts`
- Create: `packages/sdk/src/react/hooks/deployments.ts`
- Create: `packages/sdk/src/react/hooks/assets.ts`
- Create: `packages/sdk/src/react/hooks/settings.ts`
- Create: `packages/sdk/src/react/hooks/site.ts`
- Modify: `packages/sdk/src/react/index.ts`
- Test: `packages/sdk/test/react/hooks.test.tsx`

**Interfaces:**
- Produces: `useProjects`, `useProject`, `usePages`, `usePage`, `useDeployments`, `usePublish`, `useUploadAsset`, `useSiteSearch`, `useDomains`, `useApiKeys`, `useOpenApiConfiguration`.

- [ ] **Step 1: Write test for unified hooks**

Create `packages/sdk/test/react/hooks.test.tsx`:
```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createCmsClient } from '../../src';
import { CmsClientProvider, useProjects } from '../../src/react';

describe('useProjects hook in @cms/sdk/react', () => {
  it('fetches projects via CmsClient from context', async () => {
    const mockProjects = [{ id: 'p1', name: 'Documentation' }];
    const client = createCmsClient({ baseUrl: 'https://cms.test' });
    vi.spyOn(client.projects, 'list').mockResolvedValue(mockProjects as any);

    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <CmsClientProvider client={client}>{children}</CmsClientProvider>
      </QueryClientProvider>
    );

    const { result } = renderHook(() => useProjects(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockProjects);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --filter @cms/sdk test test/react/hooks.test.tsx`
Expected: FAIL with "useProjects is not defined"

- [ ] **Step 3: Implement hooks in packages/sdk/src/react/hooks/**

Migrate and unify hooks from `apps/studio/src/features/*/services/*-api.ts` and `apps/studio/src/shared/hooks/api/`:
- `projects.ts`: `useProjects`, `useProject`, `useProjectMembers`, `useCreateProject`, `useUpdateProject`, `useDeleteProject`.
- `pages.ts`: `usePages`, `usePage`, `useCreatePage`, `useUpdatePage`, `useDeletePage`, `useReorderPages`.
- `deployments.ts`: `useDeployments`, `usePendingChanges`, `usePublish`, `usePublishAnyway`, `useRollback`.
- `assets.ts`: `useUploadAsset` (delegating to `client.assets.upload(projectId, file)`).
- `settings.ts`: `useDomains`, `useApiKeys`, `useOpenApiConfiguration`, `useProjectAddons`, `useWorkspaceSettings`.
- `site.ts`: `useSite`, `useSitePage`, `useSiteSearch`, `useAnswerSite`.

Export all hooks from `packages/sdk/src/react/index.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --filter @cms/sdk test test/react/hooks.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/react/hooks packages/sdk/src/react/index.ts packages/sdk/test/react/hooks.test.tsx
git commit -m "feat(sdk): add unified TanStack Query hooks to @cms/sdk/react"
```

---

### Task 9: Migrate `apps/studio` and `packages/site` to Eliminate Raw Endpoints & Ad-Hoc Services

**Files:**
- Modify: `apps/studio/src/shared/services/cms-client.ts`
- Modify: `apps/studio/src/main.tsx` (wrap with `CmsClientProvider`)
- Delete: `apps/studio/src/shared/services/site-service.ts`
- Modify: `apps/studio/src/routes/sites/$projectId/*` & `git-preview.$token.tsx`
- Modify: `apps/studio/src/features/project-settings/components/git-workflow.tsx` & `git-tab.tsx`
- Modify: `apps/studio/src/features/project-settings/components/api-keys-tab.tsx`
- Modify: `packages/site/src/lib/openapi-reference.ts`
- Modify: `apps/studio/src/shared/hooks/api/index.ts` & `queries.ts` & `mutations.ts`
- Test: `bun --filter @cms/studio test`

**Interfaces:**
- Eliminates:
  - Hardcoded `/api/public/git/webhook/${projectId}` -> `cmsClient.git.getWebhookUrl(projectId)`
  - Hardcoded `/api/public/sites/${projectId}/openapi.json` -> `cmsClient.public.getOpenApiSpecUrl(projectId)`
  - Hardcoded `/api/mcp` -> `cmsClient.mcp.getEndpointUrl()`
  - Ad-hoc `site-service.ts` -> `cmsClient.sites`
  - Direct `fetch` in `mutations.ts` -> `cmsClient.assets.upload(projectId, file)`

- [ ] **Step 1: Wrap Studio in CmsClientProvider and update cms-client.ts with CmsClientBuilder**

In `apps/studio/src/shared/services/cms-client.ts`:
```typescript
import { getLocale } from '@cms/i18n';
import { CmsClientBuilder } from '@cms/sdk';

const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4310';

export const cmsClient = CmsClientBuilder.create()
  .withBaseUrl(baseOrigin)
  .withLocale(() => {
    try {
      return getLocale();
    } catch {
      return undefined;
    }
  })
  .withCredentials('include')
  .build();
```

In `apps/studio/src/main.tsx` or router provider: wrap application tree with `<CmsClientProvider client={cmsClient}>`.

- [ ] **Step 2: Replace raw URLs in Studio and Site packages**

In `apps/studio/src/features/project-settings/components/git-workflow.tsx`:
```diff
- const webhookUrl = new URL(`/api/public/git/webhook/${projectId}`, env.VITE_APP_URL).toString();
+ const webhookUrl = cmsClient.git.getWebhookUrl(projectId, env.VITE_APP_URL);
```

In `apps/studio/src/features/project-settings/components/git-tab.tsx`:
```diff
- const webhookUrl = `${webhookOrigin}/api/public/git/webhook/${projectId}`;
+ const webhookUrl = cmsClient.git.getWebhookUrl(projectId, webhookOrigin);
```

In `apps/studio/src/features/project-settings/components/api-keys-tab.tsx`:
```diff
- <code className="min-w-0 truncate text-foreground">/api/mcp</code>
+ <code className="min-w-0 truncate text-foreground">{cmsClient.mcp.getEndpointUrl()}</code>
```

In `packages/site/src/lib/openapi-reference.ts`:
```diff
- url: `/api/public/sites/${encodeURIComponent(projectId)}/openapi.json`,
+ url: cmsClient.public.getOpenApiSpecUrl(projectId),
```

- [ ] **Step 3: Replace siteService and manual asset upload**

In `apps/studio/src/routes/sites/$projectId/*`:
Replace `siteService.getSite(...)` with `cmsClient.sites.getSite(...)`.
Delete `apps/studio/src/shared/services/site-service.ts`.

In `apps/studio/src/shared/hooks/api/mutations.ts`:
```typescript
export const useUploadAsset = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => cmsClient.assets.upload(projectId, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.assets.all(projectId) }),
  });
};
```

In `apps/studio/src/shared/hooks/api/index.ts`: Re-export from `@cms/sdk/react` for complete backward compatibility.

- [ ] **Step 4: Run Studio tests and build to verify compatibility**

Run: `bun --filter @cms/studio test`
Expected: PASS

Run: `bun --filter @cms/studio build`
Expected: Build succeeds with 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/studio packages/site
git commit -m "refactor(studio): eliminate raw endpoint strings and consume unified @cms/sdk"
```

---

### Task 10: Full Monorepo Typecheck & Regression Verification

**Files:** Monorepo-wide check.

- [ ] **Step 1: Run typechecks across all workspaces**

Run: `bun run typecheck`
Expected: 0 type errors across all packages and apps.

- [ ] **Step 2: Run all workspace tests**

Run: `bun run test`
Expected: All package and studio tests pass.

- [ ] **Step 3: Verification scan for raw endpoint strings**

Verify that no unencapsulated `/api/public/git/webhook`, `/api/mcp`, or manual `fetch` calls remain in `apps/studio/src` and `packages/site/src`.

- [ ] **Step 4: Commit any remaining adjustments**

```bash
git commit -am "chore: finalize unified sdk api services and verify monorepo build"
```
