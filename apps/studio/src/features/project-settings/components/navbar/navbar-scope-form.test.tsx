/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NavbarScopeForm } from './navbar-scope-form';

vi.mock('@cms/i18n/react', () => ({
  useT: () => (key: string) => key,
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Array<ReturnType<typeof createRoot>> = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }
  document.body.replaceChildren();
});

describe('NavbarScopeForm', () => {
  it('renders navbar fields without tabs editor', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <NavbarScopeForm
          initial={{
            ctaLabel: 'Get Started',
            ctaUrl: 'https://example.com',
            links: [],
            anchors: [],
          } as any}
          onSave={vi.fn()}
        />,
      );
    });

    expect(container.textContent).not.toContain('settings.navbar.tabs.label');
    expect(container.querySelector('[data-testid="tabs-tree-editor"]')).toBeNull();
  });
});
