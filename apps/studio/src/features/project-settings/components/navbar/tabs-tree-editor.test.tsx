// @vitest-environment jsdom

import type { NavTabItem } from '@cms/validators';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TabsTreeEditor } from './tabs-tree-editor';

vi.mock('@cms/i18n/react', () => ({
  useT: () => (key: string) => key,
}));

describe('TabsTreeEditor', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
    vi.clearAllMocks();
  });

  it('renders root items and fires onChange on add root button click', async () => {
    const onChange = vi.fn();
    const items: NavTabItem[] = [{ label: 'Docs', href: '/docs' }];

    const root = createRoot(container);
    await act(async () => {
      root.render(<TabsTreeEditor onChange={onChange} value={items} />);
    });

    const inputs = container.querySelectorAll('input');
    expect(inputs[0].value).toBe('Docs');
    expect(inputs[1].value).toBe('/docs');

    const addBtn = [...container.querySelectorAll('button')].find((btn) => btn.textContent?.includes('settings.navbar.tabs.add'));
    expect(addBtn).toBeDefined();

    await act(async () => {
      addBtn?.click();
    });

    expect(onChange).toHaveBeenCalledWith([
      { label: 'Docs', href: '/docs' },
      { label: '', href: '' },
    ]);
  });

  it('allows adding a sub-tab to an existing node', async () => {
    const onChange = vi.fn();
    const items: NavTabItem[] = [{ label: 'Docs', href: '/docs' }];

    const root = createRoot(container);
    await act(async () => {
      root.render(<TabsTreeEditor onChange={onChange} value={items} />);
    });

    const subTabBtn = [...container.querySelectorAll('button')].find((btn) => btn.getAttribute('aria-label') === 'Add sub-tab');
    expect(subTabBtn).toBeDefined();

    await act(async () => {
      subTabBtn?.click();
    });

    expect(onChange).toHaveBeenCalledWith([
      {
        label: 'Docs',
        href: '/docs',
        items: [{ label: '', href: '' }],
      },
    ]);
  });
});
