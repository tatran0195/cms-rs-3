/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TabSettingsDialog } from './tab-settings-dialog';

const mockMutateAsync = vi.fn().mockResolvedValue({});

vi.mock('@cms/sdk/react', () => ({
  useUpdateLanguage: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
  useUpdateProjectConfig: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

vi.mock('@cms/i18n/react', () => ({
  useT: () => (key: string) => key,
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Array<ReturnType<typeof createRoot>> = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }
  document.body.replaceChildren();
});

describe('TabSettingsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders create mode inputs and auto-slugifies base path', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <TabSettingsDialog
          projectId="proj-1"
          languageId="lang-en"
          existingTabs={[]}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );
    });

    const nameInput = document.querySelector('#tab-name') as HTMLInputElement;
    expect(nameInput).not.toBeNull();

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      nativeInputValueSetter?.call(nameInput, 'API Reference');
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const pathInput = document.querySelector('#tab-href') as HTMLInputElement;
    expect(pathInput.value).toBe('/api-reference');
  });

  it('renders edit mode with delete button for existing tab', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <TabSettingsDialog
          projectId="proj-1"
          languageId="lang-en"
          tab={{ label: 'Docs', href: '/docs' }}
          existingTabs={[{ label: 'Docs', href: '/docs' }]}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );
    });

    const deleteBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Delete Tab'),
    );
    expect(deleteBtn).toBeDefined();
  });
});
