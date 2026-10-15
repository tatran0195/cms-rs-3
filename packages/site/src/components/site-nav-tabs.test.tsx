// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SiteNavTabs } from './site-nav-tabs';
import type { SnapshotNavTabItem } from '@cms/shared';

describe('SiteNavTabs', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const tabs: SnapshotNavTabItem[] = [
    { label: 'Overview', href: '/overview' },
    {
      label: 'Products',
      items: [
        { label: 'Cloud DB', href: '/products/db' },
        {
          label: 'Storage',
          items: [
            { label: 'Block Storage', href: '/products/storage/block' },
          ],
        },
      ],
    },
  ];

  it('renders top-level tab links and triggers', async () => {
    await act(async () => {
      root.render(<SiteNavTabs tabs={tabs} currentPath="overview" projectId="proj-1" />);
    });

    expect(container.textContent).toContain('Overview');
    expect(container.textContent).toContain('Products');
  });

  it('marks active tab link with data-active', async () => {
    await act(async () => {
      root.render(<SiteNavTabs tabs={tabs} currentPath="overview" projectId="proj-1" />);
    });

    const activeLink = container.querySelector('[data-active="true"]');
    expect(activeLink).not.toBeNull();
    expect(activeLink?.textContent).toContain('Overview');
  });

  it('renders nothing when tabs is empty', async () => {
    await act(async () => {
      root.render(<SiteNavTabs tabs={[]} currentPath="overview" projectId="proj-1" />);
    });

    expect(container.innerHTML).toBe('');
  });
});
