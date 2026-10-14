import { describe, expect, it } from 'vitest';
import { createCmsClient } from '../src';

describe('Endpoint URL Builders', () => {
  const client = createCmsClient({ baseUrl: 'https://cms.internal:4310' });

  it('builds Git webhook URL', () => {
    const url = client.git.getWebhookUrl('proj-456');
    expect(url).toBe('https://cms.internal:4310/api/public/git/webhook/proj-456');
  });

  it('builds Git webhook URL with custom baseUrl', () => {
    const url = client.git.getWebhookUrl('proj-456', 'http://localhost:3000');
    expect(url).toBe('http://localhost:3000/api/public/git/webhook/proj-456');
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
