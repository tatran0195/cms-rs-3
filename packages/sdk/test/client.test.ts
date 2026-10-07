import { describe, expect, it, vi } from 'vitest';
import { createCmsClient } from '../src/client';
import { CmsApiError, CmsTimeoutError } from '../src/errors';
import type { ProjectResponse } from '../src/types';

describe('CMS SDK Client', () => {
  it('unwraps ApiResponse data envelope on 200 OK', async () => {
    const mockProject: ProjectResponse = {
      id: 'proj-123',
      organizationId: 'org-456',
      name: 'Docs Engine',
      slug: 'docs-engine',
      description: 'Main product documentation',
      icon: null,
      isPublic: true,
      config: null,
      createdAt: '2026-10-07T00:00:00Z',
      updatedAt: '2026-10-07T00:00:00Z',
    };

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: mockProject,
          meta: {
            requestId: 'req-abc-123',
            timestamp: '2026-10-07T00:00:00Z',
          },
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'req-abc-123',
          },
        },
      ),
    );

    const client = createCmsClient({
      baseUrl: 'http://localhost:8080',
      fetch: mockFetch,
    });

    const project = await client.projects.get('proj-123');

    expect(project).toEqual(mockProject);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [firstReq] = mockFetch.mock.calls[0] as [Request, unknown];
    expect(firstReq.url).toBe('http://localhost:8080/api/projects/proj-123');
    expect(firstReq.method).toBe('GET');
    expect(firstReq.headers.get('accept')).toBe('application/json');
  });

  it('throws CmsApiError on non-2xx status with structured error envelope', async () => {
    const mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              code: 'PROJECT_NOT_FOUND',
              message: 'Project proj-999 does not exist',
              details: { id: 'proj-999' },
            },
            requestId: 'req-err-999',
          }),
          {
            status: 404,
            statusText: 'Not Found',
            headers: {
              'content-type': 'application/json',
              'x-request-id': 'req-err-999',
            },
          },
        ),
      ),
    );

    const client = createCmsClient({
      baseUrl: 'http://localhost:8080',
      fetch: mockFetch,
      retry: 0,
    });

    await expect(client.projects.get('proj-999')).rejects.toThrow(CmsApiError);

    try {
      await client.projects.get('proj-999');
    } catch (err) {
      expect(err).toBeInstanceOf(CmsApiError);
      const apiErr = err as CmsApiError;
      expect(apiErr.status).toBe(404);
      expect(apiErr.code).toBe('PROJECT_NOT_FOUND');
      expect(apiErr.message).toBe('Project proj-999 does not exist');
      expect(apiErr.requestId).toBe('req-err-999');
      expect(apiErr.isNotFound()).toBe(true);
      expect(apiErr.isServerError()).toBe(false);
      expect(apiErr.response).toBeDefined();
    }
  });

  it('attaches Bearer token dynamically if configured', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'proj-1' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const client = createCmsClient({
      baseUrl: 'http://localhost:8080',
      token: () => Promise.resolve('secret-jwt-token'),
      fetch: mockFetch,
    });

    await client.projects.list();

    const [req] = mockFetch.mock.calls[0] as [Request, unknown];
    expect(req.url).toBe('http://localhost:8080/api/projects');
    expect(req.headers.get('authorization')).toBe('Bearer secret-jwt-token');
  });

  it('attaches dynamic headers if function is provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const client = createCmsClient({
      baseUrl: 'http://localhost:8080',
      headers: () => Promise.resolve({ 'x-custom-tenant': 'tenant-acme' }),
      fetch: mockFetch,
    });

    await client.projects.list();

    const [req] = mockFetch.mock.calls[0] as [Request, unknown];
    expect(req.headers.get('x-custom-tenant')).toBe('tenant-acme');
  });

  it('automatically retries idempotent requests on transient 503 error', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(
          new Response('Service Unavailable', {
            status: 503,
            statusText: 'Service Unavailable',
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ data: { id: 'proj-retry' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    const client = createCmsClient({
      baseUrl: 'http://localhost:8080',
      fetch: mockFetch,
      retry: {
        limit: 2,
        delay: () => 0, // Instant retry for test speed
      },
    });

    const res = await client.projects.get('proj-retry');
    expect(res).toEqual({ id: 'proj-retry' });
    expect(callCount).toBe(2);
  });

  it('does not retry when retry is disabled', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve(
        new Response('Service Unavailable', {
          status: 503,
          statusText: 'Service Unavailable',
        }),
      );
    });

    const client = createCmsClient({
      baseUrl: 'http://localhost:8080',
      fetch: mockFetch,
      retry: 0,
    });

    await expect(client.projects.get('proj-fail')).rejects.toThrow(CmsApiError);
    expect(callCount).toBe(1);
  });

  it('allows extending client with additional configuration', async () => {
    const mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: { id: 'extended' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const baseClient = createCmsClient({
      baseUrl: 'http://localhost:8080',
      fetch: mockFetch,
      token: 'base-token',
    });

    const extendedClient = baseClient.extend({
      headers: { 'x-extended-header': 'true' },
    });

    await extendedClient.projects.get('proj-ext');

    const [req] = mockFetch.mock.calls[0] as [Request, unknown];
    expect(req.headers.get('authorization')).toBe('Bearer base-token');
    expect(req.headers.get('x-extended-header')).toBe('true');

    const tokenOverrideClient = baseClient.extend({
      token: 'overridden-token',
    });
    await tokenOverrideClient.projects.get('proj-ext2');
    const [req2] = mockFetch.mock.calls[1] as [Request, unknown];
    expect(req2.headers.get('authorization')).toBe('Bearer overridden-token');
  });

  it('provides access to raw Ky instance and supports direct raw calls', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ custom: 'raw-data' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const client = createCmsClient({
      baseUrl: 'http://localhost:8080',
      fetch: mockFetch,
    });

    expect(client.raw).toBeDefined();
    expect(typeof client.raw.get).toBe('function');
    expect(typeof client.raw.post).toBe('function');
    expect(client.http.raw).toBe(client.raw);

    const res = await client.raw.get('api/raw-check').json<{ custom: string }>();
    expect(res).toEqual({ custom: 'raw-data' });
  });

  it('executes custom Ky beforeRequest and afterResponse hooks', async () => {
    const beforeRequestHook = vi.fn();
    const afterResponseHook = vi.fn();

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const client = createCmsClient({
      baseUrl: 'http://localhost:8080',
      fetch: mockFetch,
      hooks: {
        beforeRequest: [beforeRequestHook],
        afterResponse: [afterResponseHook],
      },
    });

    await client.http.get('/status');
    expect(beforeRequestHook).toHaveBeenCalledTimes(1);
    expect(afterResponseHook).toHaveBeenCalledTimes(1);
  });

  it('correctly passes query searchParams to Ky', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const client = createCmsClient({
      baseUrl: 'http://localhost:8080',
      fetch: mockFetch,
    });

    await client.pages.list('proj-123', { branchId: 'branch-main', limit: 50 });

    const [req] = mockFetch.mock.calls[0] as [Request, unknown];
    const url = new URL(req.url);
    expect(url.pathname).toBe('/api/projects/proj-123/pages');
    expect(url.searchParams.get('branchId')).toBe('branch-main');
    expect(url.searchParams.get('limit')).toBe('50');
  });

  it('translates Ky TimeoutError into CmsTimeoutError on request timeout', async () => {
    const mockFetch = vi.fn().mockImplementation(
      (req: Request) =>
        new Promise((_, reject) => {
          req.signal.addEventListener('abort', () => {
            const abortError = new DOMException('The operation was aborted.', 'AbortError');
            reject(abortError);
          });
        }),
    );

    const client = createCmsClient({
      baseUrl: 'http://localhost:8080',
      fetch: mockFetch,
      timeout: 50,
      retry: 0,
    });

    await expect(client.projects.get('proj-slow')).rejects.toThrow(CmsTimeoutError);
  });

  it('unwraps response and metadata with requestWithMeta', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { status: 'ok' },
          meta: { requestId: 'req-meta-42', timestamp: '2026-10-07T00:00:00Z' },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    const client = createCmsClient({
      baseUrl: 'http://localhost:8080',
      fetch: mockFetch,
    });

    const envelope = await client.http.requestWithMeta<{ status: string }>('/health');
    expect(envelope.data).toEqual({ status: 'ok' });
    expect(envelope.meta?.requestId).toBe('req-meta-42');
  });
});
