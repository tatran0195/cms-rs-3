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
  'settings.addons.consent.placement': 'バナーの配置',
  'settings.addons.consent.placement.start': '下部左',
  'settings.addons.consent.placement.center': '下部中央',
  'settings.addons.consent.placement.end': '下部右',
  'settings.addons.consent.presentation': 'バナーの密度',
  'settings.addons.consent.presentation.compact': 'コンパクト',
  'settings.addons.consent.presentation.comfortable': 'ゆったり',
  'settings.addons.consent.buttons': 'ボタンスタイル',
  'settings.addons.consent.buttons.inline': '横並び',
  'settings.addons.consent.buttons.stacked': '縦並び',
  'settings.addons.group.engagement.title': '読者エンゲージメント',
  'settings.addons.group.privacy.title': 'プライバシーと同意',
  'settings.addons.group.publishing.title': '公開ワークフロー',
};

const mutation = { isPending: false, mutate: vi.fn() };
const availability = {
  state: 'available',
  plans: ['free'],
  available: true,
  schemaVersion: 1,
  projectId: 'project-a',
  availability: 'complete',
  decision: 'enabled',
  planKey: 'free',
  source: 'plan',
  limit: null,
  meterKey: null,
  behavior: 'observe',
  enforcement: 'advisory',
} as const;
const addons = [
  {
    id: 'feedback',
    group: 'engagement',
    enabled: true,
    config: { placement: 'after-content', presentation: 'card' },
    revision: 1,
    updatedAt: null,
    status: 'active',
    availability: { ...availability, entitlement: 'addons.feedback', capabilityKey: 'addons.feedback' },
  },
  {
    id: 'consent-banner',
    group: 'privacy',
    enabled: true,
    config: { placement: 'bottom-end', presentation: 'comfortable', buttonLayout: 'inline' },
    revision: 1,
    updatedAt: null,
    status: 'active',
    availability: { ...availability, entitlement: 'addons.consent-banner', capabilityKey: 'addons.consent-banner' },
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

    const privacy = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('プライバシーと同意'));
    await act(async () => privacy?.click());

    expect(container.textContent).toContain('下部右');
    expect(container.textContent).toContain('ゆったり');
    expect(container.textContent).toContain('横並び');
    expect(container.textContent).not.toMatch(/bottom-end|comfortable|inline/);

    act(() => root.unmount());
  });
});
