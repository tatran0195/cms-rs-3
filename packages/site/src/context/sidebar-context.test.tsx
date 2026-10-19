// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SidebarProvider, useSidebar } from './sidebar-context';

// @ts-expect-error react act test env
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function TestSidebarConsumer({ onState }: { onState: (state: ReturnType<typeof useSidebar>) => void }) {
  const state = useSidebar();
  onState(state);
  return (
    <div>
      <span data-testid="collapsed">{String(state.collapsed)}</span>
      <button type="button" onClick={state.toggleCollapsed} data-testid="toggle">
        Toggle
      </button>
    </div>
  );
}

describe('SidebarProvider', () => {
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

  it('toggles collapsed state via button click', () => {
    act(() => {
      root.render(
        <SidebarProvider collapsible={true}>
          <TestSidebarConsumer
            onState={() => {
              /* noop */
            }}
          />
        </SidebarProvider>,
      );
    });

    const toggleBtn = container.querySelector<HTMLButtonElement>('[data-testid="toggle"]');
    const collapsedEl = container.querySelector('[data-testid="collapsed"]');
    expect(collapsedEl?.textContent).toBe('false');

    act(() => {
      toggleBtn?.click();
    });
    expect(collapsedEl?.textContent).toBe('true');

    act(() => {
      toggleBtn?.click();
    });
    expect(collapsedEl?.textContent).toBe('false');
  });

  it('toggles collapsed state via Ctrl+B shortcut', () => {
    act(() => {
      root.render(
        <SidebarProvider collapsible={true}>
          <TestSidebarConsumer
            onState={() => {
              /* noop */
            }}
          />
        </SidebarProvider>,
      );
    });

    const collapsedEl = container.querySelector('[data-testid="collapsed"]');
    expect(collapsedEl?.textContent).toBe('false');

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true }));
    });
    expect(collapsedEl?.textContent).toBe('true');

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true }));
    });
    expect(collapsedEl?.textContent).toBe('false');
  });

  it('does not toggle when collapsible is false', () => {
    act(() => {
      root.render(
        <SidebarProvider collapsible={false}>
          <TestSidebarConsumer
            onState={() => {
              /* noop */
            }}
          />
        </SidebarProvider>,
      );
    });

    const toggleBtn = container.querySelector<HTMLButtonElement>('[data-testid="toggle"]');
    const collapsedEl = container.querySelector('[data-testid="collapsed"]');
    expect(collapsedEl?.textContent).toBe('false');

    act(() => {
      toggleBtn?.click();
    });
    expect(collapsedEl?.textContent).toBe('false');

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true }));
    });
    expect(collapsedEl?.textContent).toBe('false');
  });
});
