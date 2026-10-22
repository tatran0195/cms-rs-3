// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeImportDialog } from './theme-import-dialog';

// @ts-expect-error configure react act environment for jsdom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mutation = {
  isPending: false,
  mutate: vi.fn(),
};

vi.mock('@cms/i18n/react', () => ({
  useT: () => (key: string) => key,
  translateFn: (key: string) => key,
}));

vi.mock('@cms/sdk/react', () => ({
  useImportProjectTheme: () => mutation,
}));

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
  descriptor?.set?.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('ThemeImportDialog', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.replaceChildren();
    vi.clearAllMocks();
  });

  it('renders dialog when open', async () => {
    await act(async () => {
      root.render(
        <ThemeImportDialog
          projectId="test-proj"
          open={true}
          onOpenChange={vi.fn()}
          onApplyTheme={vi.fn()}
        />,
      );
    });

    expect(document.body.textContent).toContain('settings.theme.importTitle');
    expect(document.body.textContent).toContain('settings.theme.importHint');
  });

  it('triggers preview when valid JSON is pasted', async () => {
    await act(async () => {
      root.render(
        <ThemeImportDialog
          projectId="test-proj"
          open={true}
          onOpenChange={vi.fn()}
          onApplyTheme={vi.fn()}
        />,
      );
    });

    const textarea = document.body.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).toBeDefined();

    const sampleJson = JSON.stringify({
      kind: 'cms-theme',
      version: 1,
      metadata: { name: 'Custom Pasted' },
      config: {},
    });

    await act(async () => {
      setTextareaValue(textarea, sampleJson);
    });

    expect(mutation.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        template: expect.objectContaining({ kind: 'cms-theme' }),
        mode: 'merge',
        apply: false,
      }),
      expect.anything(),
    );
  });
});
