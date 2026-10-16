import { describe, expect, it, vi } from 'vitest';
import { createCmsClient } from '../src';

describe('ScopedProjectContext', () => {
  it('pre-binds projectId across nested resource operations', async () => {
    const mockFetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes('/api/projects/proj-123/pages')) {
        return Promise.resolve(
          new Response(JSON.stringify([{ id: 'page-1', title: 'Home' }]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    const client = createCmsClient({ baseUrl: 'https://cms.test', fetch: mockFetch });
    const project = client.project('proj-123');

    const pages = await project.pages.list();
    expect(pages).toHaveLength(1);
    const [req] = mockFetch.mock.calls[0] as [Request, unknown];
    expect(req.url).toContain('/api/projects/proj-123/pages');

    const webhookUrl = project.git.getWebhookUrl();
    expect(webhookUrl).toBe('https://cms.test/api/public/git/webhook/proj-123');
  });
});
