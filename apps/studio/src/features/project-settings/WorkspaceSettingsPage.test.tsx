// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  user: { id: 'u1', email: 'user@example.com' },
  members: [
    {
      id: 'm1',
      role: 'member',
      user: { id: 'u1', email: 'user@example.com' },
    },
  ],
}));

vi.mock('@/features/auth', () => ({
  useSession: () => ({ data: { user: mockState.user } }),
  useUpdateUser: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useChangeEmail: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRequestEmailChange: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSendVerificationOtp: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/api', () => ({
  useMembers: () => ({
    data: { members: mockState.members, invitations: [] },
    isPending: false,
  }),
  useWorkspaceSettings: () => ({
    data: { name: 'Acme', slug: 'acme', project_count: 1, member_count: 1 },
    isPending: false,
  }),
  useUpdateWorkspaceSettings: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useInviteMember: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveMember: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateMemberRole: () => ({ mutate: vi.fn(), isPending: false }),
  useProjects: () => ({ data: [] }),
  useWorkspaceRoles: () => ({ data: [], isPending: false }),
}));

vi.mock('@cms/i18n/react', () => ({
  useT: () => (key: string) => key,
  useLocale: () => ({ locale: 'en', t: (key: string) => key }),
}));

vi.mock('@cms/design-system/theme', () => ({
  useTheme: () => ({ theme: 'light', resolvedTheme: 'light', setTheme: vi.fn() }),
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { WorkspaceSettingsPage } from './WorkspaceSettingsPage';

describe('WorkspaceSettingsPage', () => {
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

  it('hides Workspace section for non-admin members', async () => {
    mockState.members = [
      {
        id: 'm1',
        role: 'member',
        user: { id: 'u1', email: 'user@example.com' },
      },
    ];

    await act(async () => {
      root.render(<WorkspaceSettingsPage tab="account" onTabChange={vi.fn()} />);
    });

    expect(container.textContent).toContain('Account');
    expect(container.textContent).not.toContain('Workspace');
    expect(container.textContent).not.toContain('Danger Zone');
  });

  it('shows Workspace section with all tabs for admins or owners', async () => {
    mockState.members = [
      {
        id: 'm1',
        role: 'admin',
        user: { id: 'u1', email: 'user@example.com' },
      },
    ];

    await act(async () => {
      root.render(<WorkspaceSettingsPage tab="account" onTabChange={vi.fn()} />);
    });

    expect(container.textContent).toContain('Account');
    expect(container.textContent).toContain('Workspace');
    expect(container.textContent).toContain('General');
    expect(container.textContent).toContain('Roles & Permissions');
    expect(container.textContent).toContain('Danger Zone');
  });

  it('falls back to Account tab when a member attempts to access workspace-general directly', async () => {
    mockState.members = [
      {
        id: 'm1',
        role: 'member',
        user: { id: 'u1', email: 'user@example.com' },
      },
    ];

    await act(async () => {
      root.render(<WorkspaceSettingsPage tab="workspace-general" onTabChange={vi.fn()} />);
    });

    // Content falls back to AccountTab (which contains Profile)
    expect(container.querySelector('#ws-name')).toBeNull();
  });
});
