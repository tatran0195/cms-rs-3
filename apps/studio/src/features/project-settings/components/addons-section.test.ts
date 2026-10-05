// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectAddon } from '@/hooks/api/types';
import { AddonsSection } from './addons-section';

const translations: Record<string, string> = {
  'settings.addons.feedback.placement': '配置',
  'settings.addons.feedback.placement.afterContent': 'コンテンツの後',
  'settings.addons.feedback.placement.afterNavigation': 'ナビゲーションの後',
  'settings.addons.feedback.presentation': '表示スタイル',
  'settings.addons.feedback.presentation.compact': 'コンパクトな行',
  'settings.addons.feedback.presentation.card': 'カード',
  'settings.addons.group.engagement.title': '読者エンゲージメント',
};

const mutation = { isPending: false, mutate: vi.fn() };
const addons = [
  {
    id: 'feedback',
    group: 'engagement',
    enabled: true,
    config: { placement: 'after-content', presentation: 'card' },
    revision: 1,
    updatedAt: null,
    status: 'active',
  },
] satisfies ProjectAddon[];

vi.mock('@cms/i18n/react', () => ({ useT: () => (key: string) => translations[key] ?? key }));
vi.mock('@/hooks/api', () => ({
  useProjectAddons: () => ({ data: addons, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateProjectAddon: () => mutation,
  useActivateProjectAddon: () => mutation,
  useDeactivateProjectAddon: () => mutation,
}));

describe('AddonsSection localized select values', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    container.dir = 'rtl';
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
    vi.clearAllMocks();
  });

  it('renders localized labels instead of raw add-on enum tokens in RTL', async () => {
    const root = createRoot(container);
    await act(async () => root.render(createElement(AddonsSection, { projectId: 'project-a' })));

    expect(container.textContent).toContain('コンテンツの後');
    expect(container.textContent).toContain('カード');
    expect(container.textContent).not.toContain('after-content');

    act(() => root.unmount());
  });
});
