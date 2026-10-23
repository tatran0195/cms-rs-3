/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectDeploymentsPage } from './ProjectDeploymentsPage';

const mocks = vi.hoisted(() => ({
  deployments: [
    {
      id: 'd2',
      version: 2,
      status: 'READY',
      commitMessage: 'Second release',
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    },
    {
      id: 'd1',
      version: 1,
      status: 'READY',
      commitMessage: 'Initial release',
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    },
  ],
  pendingChanges: {
    changes: [
      { id: 'c1', path: 'intro', status: 'modified' },
      { id: 'c2', path: 'quickstart', status: 'added' },
    ],
    redirectIssues: [],
  },
  confirmMock: vi.fn().mockResolvedValue(true),
  rollbackMutateMock: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: any) => (
    <a href="/test" {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}));

vi.mock('@cms/i18n/react', () => ({
  useLocale: () => ({ locale: 'en' }),
  useT: () => (key: string, params?: any) => {
    if (params?.version) return `${key} ${params.version}`;
    return key;
  },
}));

vi.mock('@cms/design-system/components/ui/confirm', () => ({
  useConfirm: () => mocks.confirmMock,
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: vi.fn(),
    }),
  };
});

vi.mock('@cms/sdk/react', () => ({
  queryKeys: {
    deployments: {
      baseline: (id: string) => ['baseline', id],
      changes: (id: string) => ['changes', id],
      all: (id: string) => ['all', id],
    },
  },
  useProject: () => ({ data: { id: 'p1', name: 'Test Docs', slug: 'test-docs' } }),
  usePages: () => ({ data: [] }),
  useDomains: () => ({
    data: [{ id: 'dom-1', domain: 'docs.example.com', isPrimary: true, verified: true }],
  }),
  usePendingChanges: () => ({
    data: mocks.pendingChanges,
    isPending: false,
  }),
  useDeployments: () => ({
    data: mocks.deployments,
    isLoading: false,
  }),
  useRollback: () => ({
    mutate: mocks.rollbackMutateMock,
    isPending: false,
  }),
  usePublishAnyway: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  usePublish: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('@/features/publishing/components/PublishModal', () => ({
  PublishModal: () => <div data-testid="publish-modal" />,
}));

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const roots: Array<ReturnType<typeof createRoot>> = [];

beforeEach(() => {
  document.body.innerHTML = '';
  mocks.confirmMock.mockClear();
  mocks.rollbackMutateMock.mockClear();
});

afterEach(async () => {
  for (const root of roots) {
    await act(async () => root.unmount());
  }
  roots.length = 0;
  document.body.innerHTML = '';
});

describe('ProjectDeploymentsPage', () => {
  it('renders header, production domain card, pending changes card, and deployment history', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(<ProjectDeploymentsPage projectId="p1" />);
    });

    const text = container.textContent ?? '';
    expect(text).toMatch(/Deployments & Publishing/i);
    expect(text).toMatch(/docs\.example\.com/i);
    expect(text).toMatch(/2 unreleased/i);
    expect(text).toMatch(/v2/i);
    expect(text).toMatch(/Second release/i);
    expect(text).toMatch(/v1/i);
    expect(text).toMatch(/Initial release/i);
  });

  it('triggers rollback confirmation when rollback button on past ready release is clicked', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(<ProjectDeploymentsPage projectId="p1" />);
    });

    // The current live is v2; v1 has the rollback button
    const buttons = Array.from(container.querySelectorAll('button'));
    const rollbackBtn = buttons.find((btn) => btn.textContent?.includes('Rollback'));
    expect(rollbackBtn).toBeDefined();

    await act(async () => {
      rollbackBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mocks.confirmMock).toHaveBeenCalledTimes(1);
    expect(mocks.rollbackMutateMock).toHaveBeenCalledWith('d1', expect.any(Object));
  });

  it('renders active pipeline banner when status is BUILDING', async () => {
    mocks.deployments = [
      {
        id: 'd3',
        version: 3,
        status: 'BUILDING',
        commitMessage: 'Ongoing deploy',
        createdAt: new Date().toISOString(),
        completedAt: null,
      },
      {
        id: 'd2',
        version: 2,
        status: 'READY',
        commitMessage: 'Second release',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
    ];

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(<ProjectDeploymentsPage projectId="p1" />);
    });

    const text = container.textContent ?? '';
    expect(text).toMatch(/Deployment in Progress — Version 3/i);
    expect(text).toMatch(/Building v3/i);
  });
});
