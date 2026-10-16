import { describe, expect, it, vi } from 'vitest';
import { createCmsClient } from '../src';

describe('ExportsResource & AiResource', () => {
  it('calls export jobs and schedules endpoints', async () => {
    const mockFetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes('/api/app/export/jobs')) {
        return Promise.resolve(
          new Response(JSON.stringify([{ id: 'job-1', status: 'COMPLETED' }]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    const client = createCmsClient({ baseUrl: 'https://cms.test', fetch: mockFetch });
    const jobs = await client.exports.listJobs();
    expect(jobs[0]?.id).toBe('job-1');
    const [req] = mockFetch.mock.calls[0] as [Request, unknown];
    expect(req.url).toContain('/api/app/export/jobs');
  });

  it('builds export download URLs correctly', () => {
    const client = createCmsClient({ baseUrl: 'https://cms.test' });
    const jobUrl = client.exports.getDownloadUrl('job-123');
    expect(jobUrl).toBe('https://cms.test/api/app/export/jobs/job-123/download');

    const artifactUrl = client.exports.getDownloadUrl('job-123', 'art-456');
    expect(artifactUrl).toBe('https://cms.test/api/app/projects/export/artifacts/art-456/download');
  });

  it('calls AI prompt endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ result: 'Generated summary' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const client = createCmsClient({ baseUrl: 'https://cms.test', fetch: mockFetch });
    const res = await client.ai.prompt('proj-1', { prompt: 'Summarize page' });
    expect(res.result).toBe('Generated summary');
    const [req] = mockFetch.mock.calls[0] as [Request, unknown];
    expect(req.url).toContain('/api/app/projects/proj-1/ai');
  });
});
