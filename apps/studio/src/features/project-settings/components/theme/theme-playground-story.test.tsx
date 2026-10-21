// @vitest-environment jsdom

import { resolveTheme } from '@cms/shared/themes';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemePlaygroundStory } from './theme-playground-story';

// @ts-expect-error configure react act environment for jsdom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@cms/i18n/react', () => ({
  useT: () => (key: string) => key,
}));

vi.mock('@cms/site', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cms/site')>();
  return {
    ...actual,
    projectThemeVariables: () => ({}),
    projectThemeStyle: () => ({}),
  };
});

describe('ThemePlaygroundStory Fullscreen Toggle', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const harbor = resolveTheme({ theme: { preset: 'harbor' } });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('toggles fullscreen on and then collapses back on second click', async () => {
    await act(async () => {
      root.render(
        <ThemePlaygroundStory
          config={{}}
          themeConfig={{}}
          onThemeConfigChange={vi.fn()}
          resolvedTheme={harbor}
          resolvedColors={harbor.colors}
          resolvedLayout={harbor.layout}
          resolvedComponents={harbor.components}
          appearance="light"
          onAppearanceChange={vi.fn()}
          onReset={vi.fn()}
        />,
      );
    });

    const storyContainer = container.firstElementChild as HTMLElement;
    expect(storyContainer).not.toBeNull();
    expect(storyContainer.className).toContain('rounded-2xl');
    expect(storyContainer.className).not.toContain('fixed inset-0');

    const fullscreenBtn = container.querySelector('button[title="Fullscreen"]') as HTMLButtonElement;
    expect(fullscreenBtn).not.toBeNull();

    // First click: Enter fullscreen
    await act(async () => {
      fullscreenBtn.click();
    });

    expect(storyContainer.className).toContain('fixed inset-0');
    expect(storyContainer.className).toContain('h-screen w-screen');

    // Second click: Exit fullscreen
    const exitFullscreenBtn = container.querySelector('button[title="Exit Fullscreen"]') as HTMLButtonElement;
    expect(exitFullscreenBtn).not.toBeNull();

    await act(async () => {
      exitFullscreenBtn.click();
    });

    expect(storyContainer.className).not.toContain('fixed inset-0');
    expect(storyContainer.className).toContain('rounded-2xl');
  });
});
