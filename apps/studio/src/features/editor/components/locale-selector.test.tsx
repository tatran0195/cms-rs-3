/** @vitest-environment jsdom */

import type { Language } from '@cms/sdk';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleSelector } from './locale-selector';

vi.mock('@cms/i18n/react', () => ({ useT: () => (key: string) => key }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mockLanguages: Language[] = [
  {
    id: 'lang-en',
    projectId: 'p1',
    code: 'en',
    label: 'English',
    direction: 'LTR',
    isDefault: true,
    position: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'lang-es',
    projectId: 'p1',
    code: 'es',
    label: 'Spanish',
    direction: 'LTR',
    isDefault: false,
    position: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

const roots: Array<ReturnType<typeof createRoot>> = [];

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe('LocaleSelector', () => {
  it('renders active language and default badge', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <LocaleSelector
          languages={mockLanguages}
          activeLanguageId="lang-en"
          onSelect={vi.fn()}
          onAddLanguage={vi.fn()}
          onLanguageSettings={vi.fn()}
          onAddPage={vi.fn()}
          onAddGroup={vi.fn()}
        />,
      );
    });

    expect(container.textContent).toContain('English');
    expect(container.textContent).toContain('(en)');
    expect(container.textContent).toContain('editor.default');
  });

  it('renders Spanish when activeLanguageId is lang-es', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <LocaleSelector
          languages={mockLanguages}
          activeLanguageId="lang-es"
          onSelect={vi.fn()}
          onAddLanguage={vi.fn()}
          onLanguageSettings={vi.fn()}
          onAddPage={vi.fn()}
          onAddGroup={vi.fn()}
        />,
      );
    });

    expect(container.textContent).toContain('Spanish');
    expect(container.textContent).toContain('(es)');
  });
});
