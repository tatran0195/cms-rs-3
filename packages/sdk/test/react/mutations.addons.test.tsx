// @vitest-environment jsdom

import { CmsApiError } from '../../src/errors';
import { CmsClientProvider, queryKeys, useActivateProjectAddon, useUpdateProjectAddon } from '../../src/react';
import type { ProjectAddon } from '../../src/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activate: vi.fn(),
  update: vi.fn(),
}));

const mockClient = {
  addons: {
    update: mocks.update,
    activate: mocks.activate,
    deactivate: vi.fn(),
  },
};

const conflictError = () =>
  new CmsApiError({
    status: 409,
    code: 'addon:revision_conflict',
    message: 'The add-on changed.',
  });

describe('add-on mutation conflict recovery', () => {
  const projectId = 'project-a';
  const addonId = 'feedback';
  let container: HTMLDivElement;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.append(container);
    mocks.activate.mockRejectedValue(conflictError());
    mocks.update.mockRejectedValue(conflictError());
  });

  afterEach(() => {
    container.remove();
    vi.clearAllMocks();
  });

  it.each(['update', 'activate'] as const)('invalidates detail and list caches before surfacing an %s revision conflict', async (action) => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    let mutate: () => Promise<ProjectAddon> = () => Promise.reject(new Error('mutation hook was not ready'));

    function Probe() {
      const update = useUpdateProjectAddon(projectId);
      const activate = useActivateProjectAddon(projectId);
      mutate = () =>
        action === 'update'
          ? update.mutateAsync({ addonId, body: { enabled: true, expectedRevision: 2, idempotencyKey: 'update-key' } })
          : activate.mutateAsync({ addonId, expectedRevision: 2 });
      return null;
    }

    const root = createRoot(container);
    await act(async () =>
      root.render(
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(CmsClientProvider, { client: mockClient as any }, createElement(Probe))
        )
      )
    );
    await act(async () => {
      await expect(mutate()).rejects.toMatchObject({ code: 'addon:revision_conflict' });
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.addons.detail(projectId, addonId), exact: true, refetchType: 'all' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.addons.all(projectId), exact: true, refetchType: 'all' });
    expect(invalidate).toHaveBeenCalledTimes(2);
    act(() => root.unmount());
  });

  it('does not invalidate add-on caches for unrelated mutation errors', async () => {
    mocks.update.mockRejectedValue(
      new CmsApiError({
        status: 400,
        code: 'addon:invalid_config',
        message: 'Invalid configuration.',
      })
    );
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    let mutate: () => Promise<ProjectAddon> = () => Promise.reject(new Error('mutation hook was not ready'));

    function Probe() {
      const update = useUpdateProjectAddon(projectId);
      mutate = () => update.mutateAsync({ addonId, body: { enabled: true, expectedRevision: 2, idempotencyKey: 'update-key' } });
      return null;
    }

    const root = createRoot(container);
    await act(async () =>
      root.render(
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(CmsClientProvider, { client: mockClient as any }, createElement(Probe))
        )
      )
    );
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    await act(async () => {
      await expect(mutate()).rejects.toMatchObject({ code: 'addon:invalid_config' });
    });

    expect(invalidate).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});
