/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pathname: '/app',
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
  useMembers: () => ({ data: { members: [] } }),
  useCreateProject: () => ({ mutate: vi.fn(), isPending: false }),
  useDeployments: () => ({ data: [] }),
}));

vi.mock('@cms/design-system/theme', () => ({
  useTheme: () => ({ setTheme: vi.fn(), resolvedTheme: 'light' }),
}));

import { DashboardLayout } from './DashboardLayout';

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

describe('DashboardLayout', () => {
  it('renders full-width overview without redundant sidebar on /app', async () => {
    mocks.pathname = '/app';

    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <DashboardLayout>
          <div data-testid="dashboard-content">Dashboard Content</div>
        </DashboardLayout>,
      );
    });

    const rail = container.querySelector('aside[aria-label="Activity Rail"]');
    expect(rail).not.toBeNull();

    // No redundant context sidebar on overview page
    const appSidebar = container.querySelector('div[data-slot="sidebar"]');
    expect(appSidebar).toBeNull();

    const content = container.querySelector('[data-testid="dashboard-content"]');
    expect(content).not.toBeNull();
  });

  it('renders ActivityRail and AppSidebar on non-overview routes like /app/settings', async () => {
    mocks.pathname = '/app/settings';

    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <DashboardLayout>
          <div data-testid="dashboard-content">Settings Content</div>
        </DashboardLayout>,
      );
    });

    const rail = container.querySelector('aside[aria-label="Activity Rail"]');
    expect(rail).not.toBeNull();

    const appSidebar = container.querySelector('div[data-slot="sidebar"]');
    expect(appSidebar).not.toBeNull();

    const content = container.querySelector('[data-testid="dashboard-content"]');
    expect(content).not.toBeNull();
  });

  it('renders full-width layout without AppSidebar on /app/analytics', async () => {
    mocks.pathname = '/app/analytics';

    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <DashboardLayout>
          <div data-testid="dashboard-content">Analytics Content</div>
        </DashboardLayout>,
      );
    });

    const rail = container.querySelector('aside[aria-label="Activity Rail"]');
    expect(rail).not.toBeNull();

    const appSidebar = container.querySelector('div[data-slot="sidebar"]');
    expect(appSidebar).toBeNull();

    const content = container.querySelector('[data-testid="dashboard-content"]');
    expect(content).not.toBeNull();
  });
});
