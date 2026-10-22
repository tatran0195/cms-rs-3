/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LinkSettingsDialog } from './link-settings-dialog';

const mockMutateAsync = vi.fn().mockResolvedValue({});

vi.mock('@cms/sdk/react', () => ({
  useUpdateLanguage: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  useUpdateProjectConfig: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
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

describe('LinkSettingsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders link inputs in create mode', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(<LinkSettingsDialog projectId="proj-1" languageId="lang-en" existingLinks={[]} open={true} onOpenChange={vi.fn()} />);
    });

    expect(document.querySelector('#link-label')).not.toBeNull();
    expect(document.querySelector('#link-href')).not.toBeNull();
  });

  it('renders delete button for existing link', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <LinkSettingsDialog
          projectId="proj-1"
          languageId="lang-en"
          link={{ label: 'Changelog', href: '/changelog' }}
          existingLinks={[{ label: 'Changelog', href: '/changelog' }]}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );
    });

    const deleteBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Delete Link'));
    expect(deleteBtn).toBeDefined();
  });
});
