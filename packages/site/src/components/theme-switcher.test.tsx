// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeSwitcher } from './theme-switcher';

// @ts-expect-error react act test env
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('ThemeSwitcher', () => {
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

  it('renders nothing when enabled is false', () => {
    act(() => {
      root.render(<ThemeSwitcher enabled={false} appearance="light" onChange={vi.fn()} />);
    });
    expect(container.firstChild).toBeNull();
  });

  it('renders 3 segmented buttons for light-dark-system', () => {
    const handleChange = vi.fn();
    act(() => {
      root.render(<ThemeSwitcher mode="light-dark-system" appearance="system" onChange={handleChange} />);
    });

    const segmented = container.querySelector('[data-theme-switcher="segmented-system"]');
    expect(segmented).not.toBeNull();

    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(3);

    act(() => {
      buttons[1]?.click(); // click light
    });
    expect(handleChange).toHaveBeenCalledWith('light');

    act(() => {
      buttons[2]?.click(); // click dark
    });
    expect(handleChange).toHaveBeenCalledWith('dark');
  });

  it('renders 2 segmented buttons for light-dark', () => {
    const handleChange = vi.fn();
    act(() => {
      root.render(<ThemeSwitcher mode="light-dark" appearance="light" onChange={handleChange} />);
    });

    const segmented = container.querySelector('[data-theme-switcher="segmented-light-dark"]');
    expect(segmented).not.toBeNull();

    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(2);

    act(() => {
      buttons[1]?.click(); // click dark
    });
    expect(handleChange).toHaveBeenCalledWith('dark');
  });

  it('renders toggle button for button mode', () => {
    const handleChange = vi.fn();
    act(() => {
      root.render(<ThemeSwitcher mode="button" appearance="light" onChange={handleChange} />);
    });

    const btn = container.querySelector('[data-theme-switcher="toggle-button"]');
    expect(btn).not.toBeNull();

    act(() => {
      (btn as HTMLButtonElement)?.click();
    });
    expect(handleChange).toHaveBeenCalledWith('dark');
  });
});
