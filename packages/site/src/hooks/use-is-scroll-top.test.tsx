// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useIsScrollTop } from './use-is-scroll-top';

// @ts-expect-error react act test env
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function TestComponent({
  enabled,
  threshold,
  onValue,
}: {
  enabled?: boolean;
  threshold?: number;
  onValue: (v: boolean | undefined) => void;
}) {
  const isTop = useIsScrollTop({ enabled, threshold });
  onValue(isTop);
  return <div data-is-top={String(isTop)} />;
}

describe('useIsScrollTop', () => {
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

  it('returns true when scrollY is below threshold', () => {
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true });
    let val: boolean | undefined;
    act(() => {
      root.render(<TestComponent enabled={true} threshold={10} onValue={(v) => (val = v)} />);
    });
    expect(val).toBe(true);
  });

  it('returns false when scrollY exceeds threshold', () => {
    Object.defineProperty(window, 'scrollY', { value: 50, writable: true });
    let val: boolean | undefined;
    act(() => {
      root.render(<TestComponent enabled={true} threshold={10} onValue={(v) => (val = v)} />);
    });
    expect(val).toBe(false);
  });

  it('updates reactively when scroll event fires', () => {
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true });
    let val: boolean | undefined;
    act(() => {
      root.render(<TestComponent enabled={true} threshold={10} onValue={(v) => (val = v)} />);
    });
    expect(val).toBe(true);

    act(() => {
      Object.defineProperty(window, 'scrollY', { value: 20, writable: true });
      window.dispatchEvent(new Event('scroll'));
    });

    expect(val).toBe(false);

    act(() => {
      Object.defineProperty(window, 'scrollY', { value: 5, writable: true });
      window.dispatchEvent(new Event('scroll'));
    });

    expect(val).toBe(true);
  });

  it('returns undefined when disabled', () => {
    let val: boolean | undefined;
    act(() => {
      root.render(<TestComponent enabled={false} onValue={(v) => (val = v)} />);
    });
    expect(val).toBeUndefined();
  });
});
