// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  user: { id: 'u1', email: 'owner@example.com' },
  members: [
    {
      id: 'm1',
      role: 'owner',
      user: { id: 'u1', email: 'owner@example.com' },
    },
    {
      id: 'm2',
      role: 'admin',
      user: { id: 'u2', email: 'admin@example.com' },
    },
  ],
}));

vi.mock('@/features/auth', () => ({
  useSession: () => ({ data: { user: mockState.user } }),
}));

vi.mock('@/hooks/api', () => ({
  useMembers: () => ({
    data: { members: mockState.members, invitations: [] },
    isPending: false,
  }),
  useWorkspaceSettings: () => ({
    data: { name: 'Acme Corp', slug: 'acme-corp' },
    isPending: false,
  }),
}));

vi.mock('../services/settings-api', () => ({
  useTransferWorkspaceOwnership: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteWorkspace: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@cms/i18n/react', () => ({
  useT: () => (key: string) => key,
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { WorkspaceDangerTab } from './workspace-danger-tab';

describe('WorkspaceDangerTab', () => {
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

  it('renders active transfer and delete buttons for the workspace Owner', async () => {
    mockState.user = { id: 'u1', email: 'owner@example.com' };

    await act(async () => {
      root.render(<WorkspaceDangerTab />);
    });

    expect(container.textContent).not.toContain('Only the workspace owner can transfer ownership.');
    expect(container.textContent).not.toContain('Only the workspace owner can delete the workspace.');
    expect(container.textContent).toContain('Transfer Ownership');
    expect(container.textContent).toContain('Delete Workspace');
  });

  it('renders disabled informational notice for an Admin', async () => {
    mockState.user = { id: 'u2', email: 'admin@example.com' };

    await act(async () => {
      root.render(<WorkspaceDangerTab />);
    });

    expect(container.textContent).toContain('Only the workspace owner can transfer ownership.');
    expect(container.textContent).toContain('Only the workspace owner can delete the workspace.');
  });
});
