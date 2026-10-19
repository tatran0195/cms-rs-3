// @vitest-environment jsdom

import { THEME_PRESETS } from '@cms/shared/themes';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeStoryWindow } from './theme-story-window';
import { DEFAULT_FUMADOCS_LAYOUT_OPTIONS } from './types';

// @ts-expect-error configure react act environment for jsdom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@cms/site', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cms/site')>();
  return {
    ...actual,
    projectThemeVariables: () => ({}),
    projectThemeStyle: () => ({}),
  };
});

describe('ThemeStoryWindow', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const harbor = THEME_PRESETS.harbor;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders macOS window controls and URL pill', async () => {
    await act(async () => {
      root.render(
        <ThemeStoryWindow
          layoutId="glass"
          effectiveConfig={{}}
          resolvedTheme={harbor}
          appearance="light"
          options={DEFAULT_FUMADOCS_LAYOUT_OPTIONS}
        />
      );
    });

    const closeDot = container.querySelector('[data-window-control="close"]');
    const minDot = container.querySelector('[data-window-control="minimize"]');
    const maxDot = container.querySelector('[data-window-control="maximize"]');

    expect(closeDot).toBeDefined();
    expect(minDot).toBeDefined();
    expect(maxDot).toBeDefined();

    expect(container.textContent).toContain('https://docs.local/preview/glass');
  });

  it('renders content slots corresponding to layout options', async () => {
    await act(async () => {
      root.render(
        <ThemeStoryWindow
          layoutId="docs"
          effectiveConfig={{}}
          resolvedTheme={harbor}
          appearance="light"
          options={{
            ...DEFAULT_FUMADOCS_LAYOUT_OPTIONS,
            nav: { title: 'Customized Docs' },
          }}
        />
      );
    });

    expect(container.textContent).toContain('Customized Docs');
    expect(container.textContent).toContain('Overview');
  });
});
