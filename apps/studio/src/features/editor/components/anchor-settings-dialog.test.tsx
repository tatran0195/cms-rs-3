/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnchorSettingsDialog } from './anchor-settings-dialog';

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

describe('AnchorSettingsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders anchor inputs in create mode', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(<AnchorSettingsDialog projectId="proj-1" languageId="lang-en" existingAnchors={[]} open={true} onOpenChange={vi.fn()} />);
    });

    expect(document.querySelector('#anchor-label')).not.toBeNull();
    expect(document.querySelector('#anchor-href')).not.toBeNull();
  });

  it('renders delete button for existing anchor', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <AnchorSettingsDialog
          projectId="proj-1"
          languageId="lang-en"
          anchor={{ label: 'Community', href: 'https://community.example.com' }}
          existingAnchors={[{ label: 'Community', href: 'https://community.example.com' }]}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );
    });

    const deleteBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Delete Anchor'));
    expect(deleteBtn).toBeDefined();
  });
});
