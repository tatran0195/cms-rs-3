// @vitest-environment jsdom

import { THEME_PRESETS } from '@cms/shared/themes';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemePaletteEditor } from './theme-palette-editor';

// @ts-expect-error configure react act environment for jsdom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('ThemePaletteEditor', () => {
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

  it('renders color token rows for active mode', async () => {
    const handleColorChange = vi.fn();
    const handleModeChange = vi.fn();

    await act(async () => {
      root.render(<ThemePaletteEditor colors={harbor.colors} mode="light" onColorChange={handleColorChange} onModeChange={handleModeChange} />);
    });

    expect(container.textContent).toContain('accent');
    expect(container.textContent).toContain('canvas');
    expect(container.textContent).toContain('surface');
  });

  it('allows mode toggling between light and dark', async () => {
    const handleModeChange = vi.fn();
    await act(async () => {
      root.render(<ThemePaletteEditor colors={harbor.colors} mode="light" onColorChange={vi.fn()} onModeChange={handleModeChange} />);
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const darkBtn = buttons.find((btn) => btn.textContent?.includes('Dark'));
    expect(darkBtn).toBeDefined();

    await act(async () => {
      darkBtn?.click();
    });

    expect(handleModeChange).toHaveBeenCalledWith('dark');
  });

  it('triggers onColorChange when hex value is modified', async () => {
    const handleColorChange = vi.fn();
    await act(async () => {
      root.render(<ThemePaletteEditor colors={harbor.colors} mode="light" onColorChange={handleColorChange} onModeChange={vi.fn()} />);
    });

    const accentInput = container.querySelector('input[aria-label="accent color hex"]') as HTMLInputElement;
    expect(accentInput).toBeDefined();

    await act(async () => {
      setInputValue(accentInput, '#ff0055');
    });

    expect(handleColorChange).toHaveBeenCalledWith('light', 'accent', '#ff0055');
  });
});
