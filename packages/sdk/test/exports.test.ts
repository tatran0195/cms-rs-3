import { describe, expect, it, vi } from 'vitest';
import { createCmsClient } from '../src';

describe('ExportsResource', () => {
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

  it('triggers on-demand schedule run', async () => {
    const mockFetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      return Promise.resolve(
        new Response(JSON.stringify({ id: 'job-99', status: 'PENDING' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    const client = createCmsClient({ baseUrl: 'https://cms.test', fetch: mockFetch });
    const job = await client.exports.runSchedule('p1', 'sched-1');
    expect(job.id).toBe('job-99');
    const [req] = mockFetch.mock.calls[0] as [Request, unknown];
    expect(req.url).toContain('/api/app/export/schedules/sched-1/run');
  });
});
