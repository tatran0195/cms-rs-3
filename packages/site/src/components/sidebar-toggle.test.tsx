// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SidebarProvider } from '../context/sidebar-context';
import { SidebarToggle } from './sidebar-toggle';

// @ts-expect-error react act test env
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('SidebarToggle', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders toggle button when collapsible is true', () => {
    act(() => {
      root.render(
        <SidebarProvider collapsible={true}>
          <SidebarToggle />
        </SidebarProvider>,
      );
    });

    const btn = container.querySelector<HTMLButtonElement>('[data-sidebar-toggle="true"]');
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute('aria-label')).toBe('Collapse sidebar (Ctrl+B)');

    act(() => {
      btn?.click();
    });

    expect(btn?.getAttribute('aria-label')).toBe('Expand sidebar (Ctrl+B)');
  });

  it('renders nothing when collapsible is false', () => {
    act(() => {
      root.render(
        <SidebarProvider collapsible={false}>
          <SidebarToggle />
        </SidebarProvider>,
      );
    });

    const btn = container.querySelector('[data-sidebar-toggle="true"]');
    expect(btn).toBeNull();
  });
});
