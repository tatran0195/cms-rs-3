/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectPreviewPage } from './ProjectPreviewPage';

vi.mock('@cms/i18n/react', () => ({
  useT: () => (key: string) => key,
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useRouterState: () => '/app/projects/proj-1/preview',
  Outlet: () => null,
}));

vi.mock('@cms/sdk/react', () => ({
  CmsClientProvider: ({ children }: any) => <>{children}</>,
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
  global.ResizeObserver = class {
    observe() {
      // Mock implementation
    }
    unobserve() {
      // Mock implementation
    }
    disconnect() {
      // Mock implementation
    }
  };
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
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

    // SiteNav renders navigation element with links
    const nav = container.querySelector('nav');
    expect(nav).toBeDefined();
    expect(nav).not.toBeNull();
    const links = nav?.querySelectorAll('a');
    expect(links && links.length > 0).toBe(true);

    // Theme toggle button should be present
    const themeBtn = container.querySelector(
      'button[aria-label="Light theme"], button[aria-label="Dark theme"], button[aria-label="Toggle preview theme"]',
    );
    expect(themeBtn).not.toBeNull();

    // Theme CSS style tag should be injected inside the provider
    const styleEl = container.querySelector('style');
    expect(styleEl).toBeDefined();
    expect(styleEl).not.toBeNull();
  });
});
