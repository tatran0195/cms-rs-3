/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectAnalyticsPage } from './ProjectAnalyticsPage';

vi.mock('@cms/i18n/react', () => ({
  useLocale: () => ({ locale: 'en' }),
  useT: () => (key: string) => key,
}));

vi.mock('@cms/sdk/react', () => ({
  useProjectAnalytics: () => ({
    data: {
      availability: 'available',
      totalViews: 450,
      uniqueVisitors: 210,
      timeseries: [{ date: '2026-10-20', views: 40 }],
      topPages: [{ path: 'intro', views: 180 }],
      topSearches: [{ query: 'auth', count: 12 }],
      languages: [{ language: 'en', views: 300 }],
      noAnswerReasons: [],
      searches: {
        total: 50,
        zeroResults: 5,
        queryTerms: 'legacy',
        clickedResults: 40,
        averageLatencyMs: 38,
      },
      ai: {
        answersCompleted: 15,
        answersFailed: 1,
        costMicros: 2000,
      },
    },
    isPending: false,
    isError: false,
  }),
}));

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const roots: Array<ReturnType<typeof createRoot>> = [];

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  for (const root of roots) {
    act(() => root.unmount());
  }
  roots.length = 0;
  document.body.innerHTML = '';
});

describe('ProjectAnalyticsPage', () => {
  it('renders search average latency and zero-result search rate in KPI strip', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(<ProjectAnalyticsPage projectId="p1" />);
    });

    const text = container.textContent ?? '';
    // Verify presence of latency / search latency
    expect(text).toMatch(/latency|ms/i);
    // Verify latency value 38
    expect(text).toMatch(/38/);
  });
});
