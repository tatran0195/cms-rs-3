// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocsLayoutSandbox } from './docs-layout-sandbox';

const translations: Record<string, string> = {
  'settings.theme.layout.docs.name': 'Standard Docs',
  'settings.theme.layout.docs.description': 'Clean three-column reference layout.',
  'settings.theme.layout.notebook.name': 'Notebook',
  'settings.theme.layout.notebook.description': 'Interactive dual-pane layout.',
  'settings.theme.layout.glass.name': 'Glass',
  'settings.theme.layout.glass.description': 'Frosted translucent glassmorphism panels.',
  'settings.theme.layout.flux.name': 'Flux',
  'settings.theme.layout.flux.description': 'Fluid modern layout.',
  'settings.theme.layout.spacious.name': 'Spacious',
  'settings.theme.layout.spacious.description': 'Generous whitespace layout.',
};

vi.mock('@cms/i18n/react', () => ({
  useT: () => (key: string) => translations[key] ?? key,
}));

describe('DocsLayoutSandbox', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.replaceChildren();
    vi.clearAllMocks();
  });

  it('renders macOS window chrome with red, yellow, and green traffic lights', async () => {
    await act(async () => {
      root.render(
        <DocsLayoutSandbox
          currentLayout="spacious"
          onSelectLayout={() => {
            /* noop */
          }}
        />,
      );
    });

    expect(container.querySelector('[data-window-control="close"]')).not.toBeNull();
    expect(container.querySelector('[data-window-control="minimize"]')).not.toBeNull();
    expect(container.querySelector('[data-window-control="maximize"]')).not.toBeNull();
  });

  it('renders interactive layout controls and allows switching layouts', async () => {
    const onSelect = vi.fn();
    await act(async () => {
      root.render(<DocsLayoutSandbox currentLayout="spacious" onSelectLayout={onSelect} />);
    });

    const buttons = [...container.querySelectorAll<HTMLButtonElement>('button')];
    const fluxButton = buttons.find((b) => b.textContent?.includes('Flux'));
    expect(fluxButton).toBeDefined();

    await act(async () => {
      fluxButton?.click();
    });

    // Verify Apply button calls onSelect with flux
    const applyButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Apply to Project'));
    expect(applyButton).toBeDefined();

    await act(async () => {
      applyButton?.click();
    });

    expect(onSelect).toHaveBeenCalledWith('flux');
  });
});
