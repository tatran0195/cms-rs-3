/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({
  useApiKeys: vi.fn(),
  mutation: { isPending: false, mutate: vi.fn() },
}));

vi.mock('@cms/i18n/react', () => ({
  useLocale: () => ({ locale: 'en', t: (key: string) => key }),
}));
vi.mock('@/hooks/api', () => ({
  useApiKeys: hooks.useApiKeys,
  useCreateApiKey: () => hooks.mutation,
  useRevokeApiKey: () => hooks.mutation,
  useRotateApiKey: () => hooks.mutation,
}));

import { ApiKeysTab } from './api-keys-tab';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const roots: Array<ReturnType<typeof createRoot>> = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }
  document.body.replaceChildren();
});

describe('API-key settings list state', () => {
  it('renders a localized query failure instead of the empty state', async () => {
    hooks.useApiKeys.mockReturnValue({
      data: undefined,
      error: new Error('sensitive backend detail'),
      isError: true,
      isLoading: false,
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => root.render(<ApiKeysTab projectId="project-1" />));

    expect(container.querySelector('[role="alert"]')?.textContent).toBe('settings.apiKeys.loadError');
    expect(container.textContent).not.toContain('settings.apiKeys.empty');
    expect(container.textContent).not.toContain('sensitive backend detail');
  });

  it('renders keys with canonical cms:read, cms:write scopes and offers canonical scope buttons', async () => {
    hooks.useApiKeys.mockReturnValue({
      data: [
        {
          id: 'k-1',
          name: 'CI Machine Key',
          lastFour: 'abcd',
          scopes: ['mcp:connect', 'cms:read', 'cms:write'],
          state: 'active',
          expiresAt: '2030-01-01T00:00:00Z',
          lastUsedAt: null,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
      isError: false,
      isLoading: false,
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => root.render(<ApiKeysTab projectId="project-1" />));

    expect(container.textContent).toContain('cms:read');
    expect(container.textContent).toContain('cms:write');
    expect(container.textContent).toContain('cms:admin');
    expect(container.textContent).toContain('CI Machine Key');
  });
});
