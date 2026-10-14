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

  it('correctly attaches locale header when built with withLocale', async () => {
    let capturedHeaders: any;
    const client = CmsClientBuilder.create()
      .withBaseUrl('https://api.cms.internal')
      .withLocale(() => 'vi')
      .build();

    if (typeof client.http.options.headers === 'function') {
      capturedHeaders = await client.http.options.headers();
    }
    expect(capturedHeaders?.['x-cms-locale']).toBe('vi');
  });
});
