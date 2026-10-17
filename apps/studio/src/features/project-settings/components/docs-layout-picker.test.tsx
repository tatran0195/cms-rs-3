// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocsLayoutPicker } from './docs-layout-picker';

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

describe('DocsLayoutPicker', () => {
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

  it('renders all 5 docs layout options with localized names and descriptions', async () => {
    await act(async () => {
      root.render(<DocsLayoutPicker onChange={vi.fn()} value="docs" />);
    });

    const buttons = [...container.querySelectorAll<HTMLButtonElement>('button[data-docs-layout]')];
    expect(buttons).toHaveLength(5);

    const layoutIds = buttons.map((b) => b.getAttribute('data-docs-layout'));
    expect(layoutIds).toEqual(['docs', 'notebook', 'glass', 'flux', 'spacious']);

    expect(container.textContent).toContain('Standard Docs');
    expect(container.textContent).toContain('Notebook');
    expect(container.textContent).toContain('Glass');
    expect(container.textContent).toContain('Flux');
    expect(container.textContent).toContain('Spacious');
  });

  it('sets aria-pressed on the selected layout card', async () => {
    await act(async () => {
      root.render(<DocsLayoutPicker onChange={vi.fn()} value="glass" />);
    });

    const glassButton = container.querySelector<HTMLButtonElement>('button[data-docs-layout="glass"]');
    const docsButton = container.querySelector<HTMLButtonElement>('button[data-docs-layout="docs"]');

    expect(glassButton?.getAttribute('aria-pressed')).toBe('true');
    expect(docsButton?.getAttribute('aria-pressed')).toBe('false');
  });

  it('defaults to standard docs layout when value is undefined', async () => {
    await act(async () => {
      root.render(<DocsLayoutPicker onChange={vi.fn()} />);
    });

    const docsButton = container.querySelector<HTMLButtonElement>('button[data-docs-layout="docs"]');
    expect(docsButton?.getAttribute('aria-pressed')).toBe('true');
  });

  it('calls onChange with the chosen layout id on click', async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(<DocsLayoutPicker onChange={onChange} value="docs" />);
    });

    const notebookButton = container.querySelector<HTMLButtonElement>('button[data-docs-layout="notebook"]');
    if (!notebookButton) throw new Error('notebook button missing');

    await act(async () => {
      notebookButton.click();
    });

    expect(onChange).toHaveBeenCalledWith('notebook');
  });
});
