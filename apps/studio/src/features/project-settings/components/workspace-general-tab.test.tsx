// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/api', () => ({
  useWorkspaceSettings: () => ({
    data: { name: 'Acme Corp', slug: 'acme-corp', project_count: 5, member_count: 12 },
    isPending: false,
  }),
  useUpdateWorkspaceSettings: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('@cms/i18n/react', () => ({
  useT: () => (key: string) => key,
}));

import { WorkspaceGeneralTab } from './workspace-general-tab';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('WorkspaceGeneralTab', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders workspace profile fields and stats', async () => {
    await act(async () => {
      root.render(<WorkspaceGeneralTab />);
    });

    const nameInput = container.querySelector<HTMLInputElement>('#ws-name');
    expect(nameInput?.value).toBe('Acme Corp');

    const slugInput = container.querySelector<HTMLInputElement>('#ws-slug');
    expect(slugInput?.value).toBe('acme-corp');

    expect(container.textContent).toContain('5');
    expect(container.textContent).toContain('12');
  });
});
