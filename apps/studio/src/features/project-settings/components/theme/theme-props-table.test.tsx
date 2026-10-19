// @vitest-environment jsdom

import { THEME_PRESETS } from '@cms/shared/themes';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemePropsTable } from './theme-props-table';
import { DEFAULT_FUMADOCS_LAYOUT_OPTIONS } from './types';

// @ts-expect-error configure react act environment for jsdom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('ThemePropsTable', () => {
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

  it('renders all root props rows', async () => {
    const handleNavigate = vi.fn();
    await act(async () => {
      root.render(
        <ThemePropsTable
          path={[]}
          onNavigate={handleNavigate}
          layoutOptions={DEFAULT_FUMADOCS_LAYOUT_OPTIONS}
          onLayoutOptionsChange={vi.fn()}
          themeConfig={{}}
          onThemeConfigChange={vi.fn()}
          resolvedColors={harbor.colors}
          resolvedLayout={harbor.layout}
          resolvedComponents={harbor.components}
          onReset={vi.fn()}
        />,
      );
    });

    expect(container.textContent).toContain('nav');
    expect(container.textContent).toContain('themeSwitch');
    expect(container.textContent).toContain('searchToggle');
    expect(container.textContent).toContain('sidebar');
    expect(container.textContent).toContain('palette');
    expect(container.textContent).toContain('layout');
    expect(container.textContent).toContain('components');
  });

  it('navigates into a category on row click', async () => {
    const handleNavigate = vi.fn();
    await act(async () => {
      root.render(
        <ThemePropsTable
          path={[]}
          onNavigate={handleNavigate}
          layoutOptions={DEFAULT_FUMADOCS_LAYOUT_OPTIONS}
          onLayoutOptionsChange={vi.fn()}
          themeConfig={{}}
          onThemeConfigChange={vi.fn()}
          resolvedColors={harbor.colors}
          resolvedLayout={harbor.layout}
          resolvedComponents={harbor.components}
          onReset={vi.fn()}
        />,
      );
    });

    const navRow = container.querySelector('button[data-prop-id="nav"]');
    expect(navRow).toBeDefined();

    await act(async () => {
      (navRow as HTMLElement)?.click();
    });

    expect(handleNavigate).toHaveBeenCalledWith(['nav']);
  });

  it('renders breadcrumb and allows navigation back to root', async () => {
    const handleNavigate = vi.fn();
    await act(async () => {
      root.render(
        <ThemePropsTable
          path={['sidebar']}
          onNavigate={handleNavigate}
          layoutOptions={DEFAULT_FUMADOCS_LAYOUT_OPTIONS}
          onLayoutOptionsChange={vi.fn()}
          themeConfig={{}}
          onThemeConfigChange={vi.fn()}
          resolvedColors={harbor.colors}
          resolvedLayout={harbor.layout}
          resolvedComponents={harbor.components}
          onReset={vi.fn()}
        />,
      );
    });

    // In sidebar drill-down, should show collapsible
    expect(container.textContent).toContain('collapsible');

    // Breadcrumb has Props button to navigate back
    const backBtn = container.querySelector('button[aria-label="Back"]');
    expect(backBtn).toBeDefined();

    await act(async () => {
      (backBtn as HTMLElement)?.click();
    });

    expect(handleNavigate).toHaveBeenCalledWith([]);
  });

  it('renders design system Select and Input without any native select tags', async () => {
    await act(async () => {
      root.render(
        <ThemePropsTable
          path={['layout']}
          onNavigate={vi.fn()}
          layoutOptions={DEFAULT_FUMADOCS_LAYOUT_OPTIONS}
          onLayoutOptionsChange={vi.fn()}
          themeConfig={{}}
          onThemeConfigChange={vi.fn()}
          resolvedColors={harbor.colors}
          resolvedLayout={harbor.layout}
          resolvedComponents={harbor.components}
          onReset={vi.fn()}
        />,
      );
    });

    // Zero native select tags in the entire table
    expect(container.querySelectorAll('select').length).toBe(0);

    // Design system select triggers are present
    const selectTriggers = container.querySelectorAll('[data-slot="select-trigger"]');
    expect(selectTriggers.length).toBeGreaterThan(0);
  });
});
