// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceRolesSection } from './WorkspaceRolesSection';

const roles = [
  {
    id: 'org-role-1',
    name: 'DevOps Lead',
    description: 'Manages API keys and audit logs',
    is_default: false,
    permissions: {
      api_keys: { create: true, read: true, delete: true },
      audit_logs: { read: true },
    },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'org-role-2',
    name: 'Standard Workspace Role',
    description: 'Baseline workspace member',
    is_default: true,
    permissions: {
      projects: { read: true },
    },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

const mutation = { isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() };

vi.mock('@cms/design-system/components/ui/confirm', () => ({
  useConfirm: () => vi.fn(async () => false),
}));

vi.mock('@/hooks/api', () => ({
  usePermissionCatalog: () => ({
    data: {
      workspace: {
        resources: [
          { key: 'api_keys', actions: ['create', 'read', 'delete'] },
          { key: 'audit_logs', actions: ['read'] },
        ],
        actions: ['create', 'read', 'edit', 'delete'],
      },
      project: { resources: [], actions: [] },
    },
    isPending: false,
  }),
  useWorkspaceRoles: () => ({
    data: roles,
    isPending: false,
  }),
  useCreateWorkspaceRole: () => mutation,
  useUpdateWorkspaceRole: () => mutation,
  useDeleteWorkspaceRole: () => mutation,
}));

describe('WorkspaceRolesSection', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
    vi.clearAllMocks();
  });

  it('renders workspace roles table with correct metadata and counts', async () => {
    const root = createRoot(container);
    await act(async () => root.render(<WorkspaceRolesSection />));

    expect(container.textContent).toContain('DevOps Lead');
    expect(container.textContent).toContain('Manages API keys and audit logs');
    expect(container.textContent).toContain('Standard Workspace Role');
    expect(container.textContent).toContain('Default');
    expect(container.textContent).toContain('4 granted');
    expect(container.textContent).toContain('1 granted');

    act(() => root.unmount());
  });
});
