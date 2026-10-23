/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectPreviewPage } from './ProjectPreviewPage';

vi.mock('@cms/i18n/react', () => ({
  useT: () => (key: string) => key,
}));

vi.mock('@cms/sdk/react', () => ({
  useProject: () => ({
    data: {
      id: 'proj-1',
      name: 'Preview Site',
      slug: 'preview-site',
      config: { styling: { primaryColor: '#3b82f6' } },
    },
  }),
  useLanguages: () => ({
    data: [{ id: 'lang-en', code: 'en', label: 'English', isDefault: true, direction: 'LTR' }],
  }),
  useBranches: () => ({
    data: [{ id: 'br-main', name: 'main', isDefault: true }],
  }),
  usePages: () => ({
    data: [
      { id: 'p1', title: 'Getting Started', path: 'getting-started', kind: 'PAGE', hidden: false, position: 0, parentId: null },
      { id: 'g1', title: 'Guides', path: 'guides', kind: 'GROUP', hidden: false, position: 1, parentId: null },
      { id: 'p2', title: 'Advanced', path: 'guides/advanced', kind: 'PAGE', hidden: false, position: 0, parentId: 'g1' },
    ],
    isPending: false,
  }),
  usePage: () => ({
    data: { id: 'p1', title: 'Getting Started', content: '# Hello Preview', path: 'getting-started' },
    isPending: false,
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

describe('ProjectPreviewPage', () => {
  it('renders SiteNav and injects theme CSS into DocumentationThemeProvider', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(<ProjectPreviewPage projectId="proj-1" search={{}} onUpdateSearch={vi.fn()} />);
    });

    // SiteNav renders navigation element with aria-label
    const nav = container.querySelector('nav');
    expect(nav).toBeDefined();
    expect(nav).not.toBeNull();
    // Theme CSS style tag should be injected inside the provider
    const styleEl = container.querySelector('style');
    expect(styleEl).toBeDefined();
    expect(styleEl).not.toBeNull();
  });
});
