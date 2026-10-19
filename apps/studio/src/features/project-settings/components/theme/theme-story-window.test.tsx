// @vitest-environment jsdom

import { THEME_PRESETS } from '@cms/shared/themes';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeStoryWindow } from './theme-story-window';

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
      root.render(<ThemeStoryWindow layoutId="glass" effectiveConfig={{}} resolvedTheme={harbor} appearance="light" />);
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
          effectiveConfig={{
            branding: { title: 'Customized Docs' } as any,
          }}
          resolvedTheme={harbor}
          appearance="light"
        />,
      );
    });

    expect(container.textContent).toContain('Customized Docs');
    expect(container.textContent).toContain('Overview');
  });

  it('renders interactive component elements with data-theme-component attributes', async () => {
    await act(async () => {
      root.render(<ThemeStoryWindow layoutId="docs" effectiveConfig={{}} resolvedTheme={harbor} appearance="light" />);
    });

    const cards = container.querySelectorAll('[data-theme-component="card"]');
    const tabsList = container.querySelector('[data-theme-component="tabs-list"]');
    const tabs = container.querySelectorAll('[data-theme-component="tab"]');
    const tabPanel = container.querySelector('[data-theme-component="tab-panel"]');
    const callout = container.querySelector('[data-theme-component="callout"]');
    const code = container.querySelector('[data-theme-component="code"]');

    expect(cards.length).toBeGreaterThanOrEqual(2);
    expect(tabsList).not.toBeNull();
    expect(tabs.length).toBeGreaterThanOrEqual(3);
    expect(tabPanel).not.toBeNull();
    expect(callout).not.toBeNull();
    expect(code).not.toBeNull();

    // Active tab has data-state="active"
    const activeTab = container.querySelector('[data-theme-component="tab"][data-state="active"]');
    expect(activeTab).not.toBeNull();
    expect(activeTab?.textContent).toBe('npm');
  });

  it('supports interactive sidebar navigation switching pages and updating preview content', async () => {
    await act(async () => {
      root.render(<ThemeStoryWindow layoutId="docs" effectiveConfig={{}} resolvedTheme={harbor} appearance="light" />);
    });

    // Find Cards in the sidebar navigation
    const cardsNavButton = Array.from(container.querySelectorAll('button')).find((btn) => btn.textContent?.includes('Cards'));
    expect(cardsNavButton).toBeDefined();

    await act(async () => {
      cardsNavButton?.click();
    });

    expect(container.textContent).toContain('https://docs.local/preview/docs/cards');
    expect(container.textContent).toContain('Cards Component');
  });

  it('renders light-dark-system segmented theme switcher and handles interactive toggling', async () => {
    const handleAppearanceChange = vi.fn();
    await act(async () => {
      root.render(
        <ThemeStoryWindow
          layoutId="docs"
          effectiveConfig={{}}
          resolvedTheme={harbor}
          resolvedLayout={{
            ...harbor.layout,
            themeSwitchEnabled: true,
            themeSwitchMode: 'light-dark-system',
          }}
          appearance="light"
          onAppearanceChange={handleAppearanceChange}
        />,
      );
    });

    const segmented = container.querySelector('[data-theme-switcher="segmented-system"]');
    expect(segmented).not.toBeNull();

    const systemBtn = container.querySelector('button[aria-label="System theme"]');
    const lightBtn = container.querySelector('button[aria-label="Light theme"]');
    const darkBtn = container.querySelector('button[aria-label="Dark theme"]');

    expect(systemBtn).not.toBeNull();
    expect(lightBtn).not.toBeNull();
    expect(darkBtn).not.toBeNull();

    // Click dark button
    await act(async () => {
      (darkBtn as HTMLElement)?.click();
    });
    expect(handleAppearanceChange).toHaveBeenCalledWith('dark');

    // Click system button
    await act(async () => {
      (systemBtn as HTMLElement)?.click();
    });
    expect(handleAppearanceChange).toHaveBeenCalledWith('system');
  });

  it('renders light-dark segmented toggle switcher', async () => {
    const handleAppearanceChange = vi.fn();
    await act(async () => {
      root.render(
        <ThemeStoryWindow
          layoutId="docs"
          effectiveConfig={{}}
          resolvedTheme={harbor}
          resolvedLayout={{
            ...harbor.layout,
            themeSwitchEnabled: true,
            themeSwitchMode: 'light-dark',
          }}
          appearance="light"
          onAppearanceChange={handleAppearanceChange}
        />,
      );
    });

    const segmented = container.querySelector('[data-theme-switcher="segmented-light-dark"]');
    expect(segmented).not.toBeNull();
  });

  it('renders single toggle button switcher', async () => {
    const handleAppearanceChange = vi.fn();
    await act(async () => {
      root.render(
        <ThemeStoryWindow
          layoutId="docs"
          effectiveConfig={{}}
          resolvedTheme={harbor}
          resolvedLayout={{
            ...harbor.layout,
            themeSwitchEnabled: true,
            themeSwitchMode: 'button',
          }}
          appearance="light"
          onAppearanceChange={handleAppearanceChange}
        />,
      );
    });

    const toggleBtn = container.querySelector('[data-theme-switcher="toggle-button"]');
    expect(toggleBtn).not.toBeNull();

    await act(async () => {
      (toggleBtn as HTMLElement)?.click();
    });
    expect(handleAppearanceChange).toHaveBeenCalledWith('dark');
  });

  it('applies theme layout styles to the draft view header (floating, stacked, inline, radius, density)', async () => {
    // 1. Floating header
    await act(async () => {
      root.render(
        <ThemeStoryWindow
          layoutId="docs"
          effectiveConfig={{}}
          resolvedTheme={harbor}
          resolvedLayout={{
            ...harbor.layout,
            header: 'floating',
            radius: 'pill',
            density: 'relaxed',
          }}
          appearance="light"
        />,
      );
    });

    const floatingHeader = container.querySelector('header[data-theme-region="header"][data-theme-header="floating"]');
    expect(floatingHeader).not.toBeNull();
    expect(floatingHeader?.getAttribute('data-theme-radius')).toBe('pill');
    expect(floatingHeader?.getAttribute('data-theme-density')).toBe('relaxed');

    // Pill radius applied to brand icon
    const brandIcon = floatingHeader?.querySelector('span.rounded-full');
    expect(brandIcon).not.toBeNull();

    // 2. Stacked header
    await act(async () => {
      root.render(
        <ThemeStoryWindow
          layoutId="docs"
          effectiveConfig={{}}
          resolvedTheme={harbor}
          resolvedLayout={{
            ...harbor.layout,
            header: 'stacked',
            radius: 'sharp',
            density: 'compact',
          }}
          appearance="light"
        />,
      );
    });

    const stackedHeader = container.querySelector('header[data-theme-region="header"][data-theme-header="stacked"]');
    expect(stackedHeader).not.toBeNull();
    expect(stackedHeader?.getAttribute('data-theme-radius')).toBe('sharp');
    expect(stackedHeader?.getAttribute('data-theme-density')).toBe('compact');
  });

  it('renders flux layout with contained navigation panel inside preview viewport', async () => {
    await act(async () => {
      root.render(<ThemeStoryWindow layoutId="flux" effectiveConfig={{}} resolvedTheme={harbor} appearance="light" />);
    });

    const fluxShell = container.querySelector('#nd-flux-layout');
    expect(fluxShell).not.toBeNull();
    expect(fluxShell?.getAttribute('data-documentation-layout')).toBe('flux');

    const navPanel = container.querySelector('aside[data-flux-nav-panel="true"]');
    expect(navPanel).not.toBeNull();

    // Verify preview viewport container establishes containing block
    const themeProvider = container.querySelector('.cms-site-chrome');
    expect(themeProvider).not.toBeNull();
    expect(themeProvider?.className).toContain('[transform:translateZ(0)]');
    expect((themeProvider as HTMLElement)?.style.transform).toBe('translateZ(0)');
  });
});
