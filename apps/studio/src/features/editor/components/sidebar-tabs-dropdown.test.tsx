/** @vitest-environment jsdom */

import type { NavLink, NavTabItem } from '@cms/validators';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SidebarTabsDropdown } from './sidebar-tabs-dropdown';

vi.mock('@cms/i18n/react', () => ({
  useT: () => (key: string) => {
    if (key === 'editor.pages' || key === 'editor.allPages') return 'All pages';
    if (key === 'settings.navbar.tabs.label') return 'Tabs & Sections';
    if (key === 'settings.navbar.links.label') return 'Navbar Links';
    if (key === 'settings.navbar.title') return 'Configure navbar & tabs';
    return key;
  },
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mockTabs: NavTabItem[] = [
  {
    label: 'Documentation',
    href: '/docs',
    items: [{ label: 'Getting Started', href: '/docs/getting-started' }],
  },
  {
    label: 'API Reference',
    href: '/api',
  },
];

const mockLinks: NavLink[] = [
  {
    label: 'GitHub',
    href: 'https://github.com/example/repo',
    external: true,
  },
  {
    label: 'Community',
    href: '/community',
    items: [{ label: 'Discord', href: 'https://discord.gg/example', external: true }],
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

describe('SidebarTabsDropdown', () => {
  it('renders trigger showing "All pages" by default when activeTabHref is null', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(<SidebarTabsDropdown tabs={mockTabs} links={mockLinks} activeTabHref={null} onSelectTab={vi.fn()} />);
    });

    const trigger = container.querySelector('[data-slot="dropdown-menu-trigger"]');
    expect(trigger).not.toBeNull();
    expect(trigger?.textContent).toContain('All pages');
  });

  it('renders trigger showing active tab title and path when activeTabHref matches', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(<SidebarTabsDropdown tabs={mockTabs} links={mockLinks} activeTabHref="/api" onSelectTab={vi.fn()} />);
    });

    const trigger = container.querySelector('[data-slot="dropdown-menu-trigger"]');
    expect(trigger?.textContent).toContain('API Reference');
    expect(trigger?.textContent).toContain('/api');
  });

  it('calls onSelectTab when a tab is clicked', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    const onSelectTab = vi.fn();

    await act(async () => {
      root.render(<SidebarTabsDropdown tabs={mockTabs} links={mockLinks} activeTabHref={null} onSelectTab={onSelectTab} />);
    });

    const trigger = container.querySelector<HTMLButtonElement>('[data-slot="dropdown-menu-trigger"]');
    await act(async () => {
      trigger?.click();
    });

    const docOption = Array.from(document.querySelectorAll('[data-slot="dropdown-menu-item"]')).find((el) =>
      el.textContent?.includes('Documentation'),
    ) as HTMLElement | undefined;

    expect(docOption).toBeDefined();

    await act(async () => {
      docOption?.click();
    });

    expect(onSelectTab).toHaveBeenCalledWith('/docs');
  });

  it('calls onManageNavbar when configure button is clicked', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    const onManageNavbar = vi.fn();

    await act(async () => {
      root.render(
        <SidebarTabsDropdown tabs={mockTabs} links={mockLinks} activeTabHref={null} onSelectTab={vi.fn()} onManageNavbar={onManageNavbar} />,
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>('[data-slot="dropdown-menu-trigger"]');
    await act(async () => {
      trigger?.click();
    });

    const manageBtn = Array.from(document.querySelectorAll('[data-slot="dropdown-menu-item"]')).find(
      (el) => el.textContent?.includes('Configure navbar & tabs') || el.textContent?.includes('settings.navbar.title'),
    ) as HTMLElement | undefined;

    expect(manageBtn).toBeDefined();

    await act(async () => {
      manageBtn?.click();
    });

    expect(onManageNavbar).toHaveBeenCalled();
  });
});
