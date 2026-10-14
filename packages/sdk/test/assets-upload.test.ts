import { describe, expect, it, vi } from 'vitest';
import { createCmsClient } from '../src';

describe('AssetsResource.upload', () => {
  it('executes the 3-step presign -> PUT -> confirm lifecycle', async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      const method = input instanceof Request ? input.method : init?.method || 'GET';

      if (url.includes('/assets/presign')) {
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
      if (url === 'https://storage.internal/upload/123') {
        expect(method).toBe('PUT');
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      if (url.includes('/assets/confirm')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ id: 'asset-123', filename: 'test.png', sizeBytes: 1024 }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    const client = createCmsClient({ baseUrl: 'https://cms.test', fetch: fetchMock });
    const file = new File(['mock binary data'], 'test.png', { type: 'image/png' });

    const result = await client.assets.upload('proj-1', file);
    expect(result.id).toBe('asset-123');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
