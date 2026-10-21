// @vitest-environment jsdom

import { resolveTheme } from '@cms/shared/themes';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemePropsTable } from './theme-props-table';

// @ts-expect-error configure react act environment for jsdom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('ThemePropsTable', () => {
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

  it('renders all root props rows', async () => {
    const handleNavigate = vi.fn();
    await act(async () => {
      root.render(
        <ThemePropsTable
          path={[]}
          onNavigate={handleNavigate}
          themeConfig={{}}
          onThemeConfigChange={vi.fn()}
          resolvedColors={harbor.colors}
          resolvedLayout={harbor.layout}
          resolvedComponents={harbor.components}
          onReset={vi.fn()}
        />,
      );
    });

    expect(container.textContent).toContain('layout');
    expect(container.textContent).toContain('header');
    expect(container.textContent).toContain('sidebar');
    expect(container.textContent).toContain('themeSwitch');
    expect(container.textContent).toContain('toc');
    expect(container.textContent).toContain('palette');
    expect(container.textContent).toContain('components');
  });

  it('navigates into a category on row click', async () => {
    const handleNavigate = vi.fn();
    await act(async () => {
      root.render(
        <ThemePropsTable
          path={[]}
          onNavigate={handleNavigate}
          themeConfig={{}}
          onThemeConfigChange={vi.fn()}
          resolvedColors={harbor.colors}
          resolvedLayout={harbor.layout}
          resolvedComponents={harbor.components}
          onReset={vi.fn()}
        />,
      );
    });

    const headerRow = container.querySelector('button[data-prop-id="header"]');
    expect(headerRow).toBeDefined();

    await act(async () => {
      (headerRow as HTMLElement)?.click();
    });

    expect(handleNavigate).toHaveBeenCalledWith(['header']);
  });

  it('renders breadcrumb and allows navigation back to root', async () => {
    const handleNavigate = vi.fn();
    await act(async () => {
      root.render(
        <ThemePropsTable
          path={['sidebar']}
          onNavigate={handleNavigate}
          themeConfig={{}}
          onThemeConfigChange={vi.fn()}
          resolvedColors={harbor.colors}
          resolvedLayout={harbor.layout}
          resolvedComponents={harbor.components}
          onReset={vi.fn()}
        />,
      );
    });

    // In sidebar drill-down, should show sidebarCollapsible
    expect(container.textContent).toContain('sidebarCollapsible');

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
