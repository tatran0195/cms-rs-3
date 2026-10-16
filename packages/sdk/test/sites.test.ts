import { describe, expect, it, vi } from 'vitest';
import { createCmsClient } from '../src';

describe('SitesResource', () => {
  it('calls public site endpoints with query parameters', async () => {
    const mockFetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes('/api/public/sites/proj-1/search')) {
        return Promise.resolve(
          new Response(JSON.stringify({ hits: [{ id: 'hit-1', title: 'Match' }] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    const client = createCmsClient({ baseUrl: 'https://cms.test', fetch: mockFetch });
    const hits = await client.sites.search('proj-1', 'auth', { language: 'en', limit: 5 });

    expect(hits).toHaveLength(1);
    const [req] = mockFetch.mock.calls[0] as [Request, unknown];
    expect(req.url).toContain('/api/public/sites/proj-1/search');
    expect(req.url).toContain('q=auth');
    expect(req.url).toContain('limit=5');
    expect(req.url).toContain('lang=en');
  });

  it('fetches site shell and pages', async () => {
    const mockFetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes('/api/public/sites/proj-1/page')) {
        return Promise.resolve(
          new Response(JSON.stringify({ id: 'p1', path: 'intro', content: '# Hello' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    const client = createCmsClient({ baseUrl: 'https://cms.test', fetch: mockFetch });
    const page = await client.sites.getPage('proj-1', 'intro');
    expect(page.id).toBe('p1');
    const [req] = mockFetch.mock.calls[0] as [Request, unknown];
    expect(req.url).toContain('/api/public/sites/proj-1/page?path=intro');
  });
});
