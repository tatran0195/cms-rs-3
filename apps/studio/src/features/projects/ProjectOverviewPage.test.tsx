/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectOverviewPage } from './ProjectOverviewPage';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: any) => <a href="#" {...props}>{children}</a>,
  useNavigate: () => vi.fn(),
}));

vi.mock('@cms/i18n/react', () => ({
  useLocale: () => ({ locale: 'en' }),
  useT: () => (key: string, params?: any) => {
    if (params?.version) return `${key} ${params.version}`;
    return key;
  },
}));

vi.mock('@cms/sdk/react', () => ({
  useProject: () => ({ data: { id: 'p1', name: 'Test Docs', slug: 'test-docs' } }),
  usePages: () => ({
    data: [
      { id: '1', title: 'Page 1', path: 'p1', kind: 'PAGE', languageCode: 'en', updatedAt: new Date().toISOString() },
      { id: '2', title: 'Page 2', path: 'p2', kind: 'PAGE', languageCode: 'en', updatedAt: new Date().toISOString() },
      { id: '3', title: 'Page 1 ES', path: 'p1', kind: 'PAGE', languageCode: 'es', updatedAt: new Date().toISOString() },
    ],
  }),
  useLanguages: () => ({
    data: [
      { id: 'l1', code: 'en', label: 'English', isDefault: true },
      { id: 'l2', code: 'es', label: 'Spanish', isDefault: false },
    ],
  }),
  useProjectMembers: () => ({ data: { members: [{ id: 'm1' }] } }),
  useDeployments: () => ({
    data: [{ id: 'd1', version: 3, status: 'READY', createdAt: new Date().toISOString() }],
  }),
  useDomains: () => ({ data: [] }),
  useProjectAnalytics: () => ({ data: { totalViews: 120, timeseries: [] }, isPending: false }),
  usePublishAnyway: () => ({ mutate: vi.fn(), isPending: false }),
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

describe('ProjectOverviewPage', () => {
  it('renders high-density operational metrics, translation progress, and recent changes', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(<ProjectOverviewPage projectId="p1" />);
    });

    const text = container.textContent ?? '';
    // Verify presence of Translation coverage / progress
    expect(text).toMatch(/translation/i);
    // Verify presence of content health card
    expect(text).toMatch(/content health|health/i);
    // Verify presence of recent updates
    expect(text).toMatch(/Page 1/i);
  });
});
