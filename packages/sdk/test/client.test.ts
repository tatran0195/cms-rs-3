import { describe, expect, it, vi } from 'vitest';
import { createCmsClient } from '../src/client';
import { CmsApiError } from '../src/errors';
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

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'application/json',
        'x-request-id': 'req-abc-123',
      }),
      json: async () => ({
        data: mockProject,
        meta: {
          requestId: 'req-abc-123',
          timestamp: '2026-10-07T00:00:00Z',
        },
      }),
    });

    const client = createCmsClient({
      baseUrl: 'http://localhost:8080',
      fetch: mockFetch,
    });

    const project = await client.projects.get('proj-123');

    expect(project).toEqual(mockProject);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8080/api/projects/proj-123',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Accept: 'application/json',
        }),
      })
    );
  });

  it('throws CmsApiError on non-2xx status with structured error envelope', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers({
        'content-type': 'application/json',
        'x-request-id': 'req-err-999',
      }),
      json: async () => ({
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project proj-999 does not exist',
          details: { id: 'proj-999' },
        },
        requestId: 'req-err-999',
      }),
    });

    const client = createCmsClient({
      baseUrl: 'http://localhost:8080',
      fetch: mockFetch,
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
    }
  });

  it('attaches Bearer token dynamically if configured', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        data: [{ id: 'proj-1' }],
      }),
    });

    const client = createCmsClient({
      baseUrl: 'http://localhost:8080',
      token: () => Promise.resolve('secret-jwt-token'),
      fetch: mockFetch,
    });

    await client.projects.list();

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8080/api/projects',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer secret-jwt-token',
        }),
      })
    );
  });
});
