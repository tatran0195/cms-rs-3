import { queryKeys } from '@cms/sdk/react';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { performChangeDetection, preparePagesForWorker } from './useChangeDetectionWorker';

describe('useChangeDetectionWorker logic', () => {
  const pages = [
    {
      id: 'page-1',
      title: 'Original Title',
      path: 'docs/page-1',
      slug: 'page-1',
      content: 'Original content',
      isPublished: true,
      kind: 'PAGE' as const,
    },
    {
      id: 'page-2',
      title: 'Page 2',
      path: 'docs/page-2',
      slug: 'page-2',
      content: 'Content 2',
      isPublished: true,
      kind: 'PAGE' as const,
    },
  ];

  it('prepares pages overlaying the active draft content', () => {
    const activeDraft = {
      id: 'page-1',
      title: 'Draft Title Update',
      content: 'Draft content update',
    };

    const prepared = preparePagesForWorker(pages, activeDraft);

    expect(prepared).toHaveLength(2);
    expect(prepared[0]?.title).toBe('Draft Title Update');
    expect(prepared[0]?.content).toBe('Draft content update');
    expect(prepared[1]?.title).toBe('Page 2');
  });

  it('computes changes and seeds TanStack Query cache', async () => {
    const queryClient = new QueryClient();
    const projectId = 'test-project-123';

    const baselinePages = [
      {
        id: 'page-1',
        title: 'Original Title',
        path: 'docs/page-1',
        slug: 'page-1',
        content: 'Original content',
        isPublished: true,
        languageCode: 'en',
        kind: 'PAGE' as const,
      },
    ];

    const currentPages = preparePagesForWorker(pages, {
      id: 'page-1',
      title: 'Modified Title',
      content: 'Modified content',
    });

    const result = await performChangeDetection({
      queryClient,
      projectId,
      currentPages,
      baselinePages,
      hasBaseline: true,
      lastVersion: 1,
    });

    expect(result.changes).toHaveLength(2); // page-1 modified, page-2 added
    const cachedData = queryClient.getQueryData(queryKeys.deployments.changes(projectId));
    expect(cachedData).toEqual(result);
  });
});
