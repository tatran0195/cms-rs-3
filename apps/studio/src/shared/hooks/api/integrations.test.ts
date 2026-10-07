// @vitest-environment jsdom

import { CmsApiError } from '@cms/sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useActivateProjectIntegration, useUpdateProjectIntegration } from './integrations';
import { queryKeys } from './query-keys';

const mocks = vi.hoisted(() => ({
  activate: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@cms/i18n/react', () => ({ useT: () => (key: string) => key }));
vi.mock('../../services/cms-client', () => ({
  cmsClient: {
    integrations: {
      update: mocks.update,
      activate: mocks.activate,
    },
  },
}));

const makeError = (code: string) =>
  new CmsApiError({
    status: 409,
    code,
    message: 'The integration changed.',
  });

describe('integration mutation conflict recovery', () => {
  const projectId = 'project-a';
  let container: HTMLDivElement;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
    vi.clearAllMocks();
  });

  it.each(['update', 'activate'] as const)('refreshes integration caches before surfacing an %s revision conflict', async (action) => {
    mocks.update.mockRejectedValue(makeError('integration:revision_conflict'));
    mocks.activate.mockRejectedValue(makeError('integration:revision_conflict'));
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    let mutate: () => Promise<unknown> = () => Promise.reject(new Error('mutation hook was not ready'));

    function Probe() {
      const update = useUpdateProjectIntegration(projectId);
      const activate = useActivateProjectIntegration(projectId);
      mutate = () =>
        action === 'update'
          ? update.mutateAsync({
              providerId: 'slack',
              body: { providerId: 'slack', label: 'Alerts', expectedRevision: 1, idempotencyKey: 'update-key' },
            })
          : activate.mutateAsync({ providerId: 'slack', body: { expectedRevision: 1, idempotencyKey: 'activate-key' } });
      return null;
    }

    const root = createRoot(container);
    await act(async () => root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(Probe))));
    await act(async () => {
      await expect(mutate()).rejects.toMatchObject({ code: 'integration:revision_conflict' });
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.integrations.all(projectId), exact: true, refetchType: 'all' });
    expect(invalidate).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it('does not invalidate caches for unrelated mutation errors', async () => {
    mocks.activate.mockRejectedValue(makeError('integration:inactive'));
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    let mutate: () => Promise<unknown> = () => Promise.reject(new Error('mutation hook was not ready'));

    function Probe() {
      const activate = useActivateProjectIntegration(projectId);
      mutate = () => activate.mutateAsync({ providerId: 'slack', body: { expectedRevision: 1, idempotencyKey: 'activate-key' } });
      return null;
    }

    const root = createRoot(container);
    await act(async () => root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(Probe))));
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    await act(async () => {
      await expect(mutate()).rejects.toMatchObject({ code: 'integration:inactive' });
    });

    expect(invalidate).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});
