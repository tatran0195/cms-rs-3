/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pathname: '/app/projects/test-project/editor',
  t: vi.fn((key: string) => key),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, children, ...props }: any) => {
    let href = typeof to === 'string' ? to : '#';
    if (params && typeof to === 'string') {
      for (const [k, v] of Object.entries(params)) {
        href = href.replace(`$${k}`, String(v));
      }
    }
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
  useRouterState: ({ select }: any = {}) =>
    select ? select({ location: { pathname: mocks.pathname } }) : { location: { pathname: mocks.pathname } },
  useNavigate: () => vi.fn(),
}));

vi.mock('@cms/i18n/react', () => ({
  useLocale: () => ({ t: mocks.t, locale: 'en' }),
  useT: () => mocks.t,
}));

vi.mock('./NotificationsPopover', () => ({
  NotificationsPopover: () => (
    <button type="button" aria-label="notifications">
      Notifications
    </button>
  ),
}));

vi.mock('@/features/auth', () => ({
  useSession: () => ({ data: { user: { name: 'Test User', email: 'test@example.com' } } }),
  useSignOut: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@cms/sdk/react', () => ({
  useProjects: () => ({ data: [{ id: 'test-project', name: 'Test Project', slug: 'test-project' }] }),
  useWorkspaceSettings: () => ({ data: { name: 'Acme Workspace' } }),
  useDeployments: () => ({ data: [] }),
}));

vi.mock('@cms/design-system/theme', () => ({
  useTheme: () => ({ setTheme: vi.fn(), resolvedTheme: 'light' }),
}));

import { ActivityRail } from './ActivityRail';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const roots: Array<ReturnType<typeof createRoot>> = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe('ActivityRail', () => {
  it('renders navigation links including deployments link', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(<ActivityRail projectId="test-project" />);
    });

    const overviewLink = container.querySelector('a[aria-label="project.overview"]');
    expect(overviewLink).not.toBeNull();

    const editorLink = container.querySelector('a[aria-label="project.editor"]');
    expect(editorLink).not.toBeNull();

    const deployLink = container.querySelector('a[aria-label="project.publish"]');
    expect(deployLink).not.toBeNull();
    expect(deployLink?.getAttribute('href')).toBe('/app/projects/test-project/deployments');

    const analyticsLink = container.querySelector('a[aria-label="project.analytics"]');
    expect(analyticsLink).not.toBeNull();

    const settingsLink = container.querySelector('a[aria-label="project.settings"]');
    expect(settingsLink).not.toBeNull();

    // Search button should no longer exist on the rail
    const searchBtn = container.querySelector('button[aria-label="dashboard.search.placeholder"]');
    expect(searchBtn).toBeNull();
  });
});
