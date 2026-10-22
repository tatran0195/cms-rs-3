/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
  it('renders navigation links and triggers search and deploy actions', async () => {
    const onOpenSearch = vi.fn();
    const onOpenDeploy = vi.fn();

    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(<ActivityRail projectId="test-project" onOpenSearch={onOpenSearch} onOpenDeploy={onOpenDeploy} />);
    });

    const overviewLink = container.querySelector('a[aria-label="project.overview"]');
    expect(overviewLink).not.toBeNull();

    const editorLink = container.querySelector('a[aria-label="project.editor"]');
    expect(editorLink).not.toBeNull();

    const analyticsLink = container.querySelector('a[aria-label="project.analytics"]');
    expect(analyticsLink).not.toBeNull();

    const settingsLink = container.querySelector('a[aria-label="project.settings"]');
    expect(settingsLink).not.toBeNull();

    const searchBtn = container.querySelector('button[aria-label="dashboard.search.placeholder"]');
    expect(searchBtn).not.toBeNull();
    searchBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onOpenSearch).toHaveBeenCalledTimes(1);

    const deployBtn = container.querySelector('button[aria-label="project.publish"]');
    expect(deployBtn).not.toBeNull();
    deployBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onOpenDeploy).toHaveBeenCalledTimes(1);
  });
});
