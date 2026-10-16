/** @vitest-environment jsdom */

import { CmsApiError } from '@cms/sdk';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useProject: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock('@cms/i18n/react', () => ({ useT: () => (key: string) => key }));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));
vi.mock('@cms/sdk/react', () => ({ useProject: mocks.useProject }));

import { ProjectAccessBoundary } from './ProjectAccessBoundary';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const roots: Array<ReturnType<typeof createRoot>> = [];

beforeEach(() => {
  mocks.refetch.mockReset();
  mocks.useProject.mockReset();
});

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }
  document.body.replaceChildren();
  vi.clearAllMocks();
});

async function render() {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () =>
    root.render(
      <ProjectAccessBoundary projectId="project-1">
        <div data-testid="child">child content</div>
      </ProjectAccessBoundary>,
    ),
  );
  return container;
}

describe('ProjectAccessBoundary', () => {
  it('renders children when the project loads successfully', async () => {
    mocks.useProject.mockReturnValue({
      data: { id: 'project-1', name: 'Alpha' },
      error: null,
      isPending: false,
      refetch: mocks.refetch,
    });

    const container = await render();

    expect(container.querySelector('[data-testid="child"]')?.textContent).toBe('child content');
    expect(container.querySelector('main')).toBeNull();
  });

  it('keeps children mounted on transient background errors if project is cached', async () => {
    mocks.useProject.mockReturnValue({
      data: { id: 'project-1', name: 'Alpha' },
      error: new Error('network hiccup'),
      isPending: false,
      refetch: mocks.refetch,
    });

    const container = await render();

    expect(container.querySelector('[data-testid="child"]')?.textContent).toBe('child content');
    expect(container.querySelector('main')).toBeNull();
  });

  it('hides children and shows 404 screen when access is revoked, even with cached project', async () => {
    mocks.useProject.mockReturnValue({
      data: { id: 'project-1', name: 'Alpha' },
      error: new CmsApiError({ status: 403, code: 'forbidden', message: 'forbidden' }),
      isPending: false,
      refetch: mocks.refetch,
    });

    const container = await render();

    expect(container.querySelector('[data-testid="child"]')).toBeNull();
    expect(container.querySelector('main h1')?.textContent).toBe('notFound.title');
    expect(container.querySelector('main p')?.textContent).toBe('notFound.body');
  });

  it('shows an error screen with a retry button on non-auth failures', async () => {
    mocks.useProject.mockReturnValue({
      data: null,
      error: new CmsApiError({ status: 500, code: 'server_error', message: 'server error' }),
      isPending: false,
      refetch: mocks.refetch,
    });

    const container = await render();

    expect(container.querySelector('[data-testid="child"]')).toBeNull();
    expect(container.querySelector('main h1')?.textContent).toBe('error.title');
    expect(container.querySelector('main button')?.textContent).toBe('error.tryAgain');

    await act(async () => container.querySelector<HTMLButtonElement>('main button')?.click());
    expect(mocks.refetch).toHaveBeenCalled();
  });

  it('shows a loading state while the project request is pending', async () => {
    mocks.useProject.mockReturnValue({
      data: null,
      error: null,
      isPending: true,
      refetch: mocks.refetch,
    });

    const container = await render();

    expect(container.querySelector('[role="status"]')?.textContent).toBe('common.loading');
  });
});
