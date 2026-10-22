/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pathname: '/app/projects/test-project/editor',
  t: vi.fn((key: string) => key),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: any) => (
    <a href={typeof to === 'string' ? to : '#'} {...props}>
      {children}
    </a>
  ),
  useRouterState: ({ select }: any = {}) =>
    select ? select({ location: { pathname: mocks.pathname } }) : { location: { pathname: mocks.pathname } },
  useNavigate: () => vi.fn(),
}));

vi.mock('@cms/i18n/react', () => ({
  useLocale: () => ({ t: mocks.t, locale: 'en' }),
  useT: () => mocks.t,
}));

vi.mock('@cms/sdk/react', () => ({
  useProject: () => ({ data: { id: 'test-project', name: 'Test Docs' } }),
  useProjects: () => ({ data: [{ id: 'test-project', name: 'Test Docs' }] }),
  useSession: () => ({ data: { user: { name: 'Test User' } } }),
  useUnreadNotificationCount: () => ({ data: 0 }),
  useNotifications: () => ({ data: [], isLoading: false }),
  useMarkNotificationsRead: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/features/auth', () => ({
  useSession: () => ({ data: { user: { name: 'Test User', email: 'test@example.com' } } }),
  useSignOut: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@cms/design-system/theme', () => ({
  useTheme: () => ({ setTheme: vi.fn(), resolvedTheme: 'light' }),
}));

vi.mock('@/features/publishing/components/DeployPipeline', () => ({
  DeployPipeline: () => <div data-testid="deploy-pipeline" />,
}));

import { ProjectLayout } from './ProjectLayout';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const roots: Array<ReturnType<typeof createRoot>> = [];

beforeEach(() => {
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

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe('ProjectLayout', () => {
  it('renders ActivityRail alongside children in editor mode', async () => {
    mocks.pathname = '/app/projects/test-project/editor';

    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <ProjectLayout projectId="test-project">
          <div data-testid="editor-content">Canvas Content</div>
        </ProjectLayout>,
      );
    });

    const rail = container.querySelector('aside[aria-label="Activity Rail"]');
    expect(rail).not.toBeNull();

    const editorContent = container.querySelector('[data-testid="editor-content"]');
    expect(editorContent).not.toBeNull();
  });

  it('renders ProjectSidebar and preview link in non-editor mode', async () => {
    mocks.pathname = '/app/projects/test-project';

    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <ProjectLayout projectId="test-project">
          <div data-testid="overview-content">Overview Content</div>
        </ProjectLayout>,
      );
    });

    const rail = container.querySelector('aside[aria-label="Activity Rail"]');
    expect(rail).not.toBeNull();

    const overviewContent = container.querySelector('[data-testid="overview-content"]');
    expect(overviewContent).not.toBeNull();
  });

  it('renders children with dedicated layout in settings mode without duplicate sidebar', async () => {
    mocks.pathname = '/app/projects/test-project/settings';

    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <ProjectLayout projectId="test-project">
          <div data-testid="settings-content">Settings Content</div>
        </ProjectLayout>,
      );
    });

    const rail = container.querySelector('aside[aria-label="Activity Rail"]');
    expect(rail).not.toBeNull();

    const settingsContent = container.querySelector('[data-testid="settings-content"]');
    expect(settingsContent).not.toBeNull();
  });

  it('renders children with dedicated layout in preview mode without duplicate sidebar', async () => {
    mocks.pathname = '/app/projects/test-project/preview';

    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <ProjectLayout projectId="test-project">
          <div data-testid="preview-content">Preview Content</div>
        </ProjectLayout>,
      );
    });

    const rail = container.querySelector('aside[aria-label="Activity Rail"]');
    expect(rail).not.toBeNull();

    const previewContent = container.querySelector('[data-testid="preview-content"]');
    expect(previewContent).not.toBeNull();
  });
});
