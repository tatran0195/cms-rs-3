// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectRolesSection } from './project-roles-section';

const roles = [
  {
    id: 'role-1',
    project_id: 'p-1',
    name: 'Content Author',
    description: 'Can edit and publish pages',
    is_default: false,
    permissions: {
      pages: { create: true, edit: true, publish: true },
    },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'role-2',
    project_id: 'p-1',
    name: 'Project Default',
    description: 'Baseline project permissions',
    is_default: true,
    permissions: {
      pages: { read: true },
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
      workspace: { resources: [], actions: [] },
      project: {
        resources: [
          { key: 'pages', actions: ['create', 'read', 'edit', 'delete', 'publish'] },
        ],
        actions: ['create', 'read', 'edit', 'delete', 'publish'],
      },
    },
    isPending: false,
  }),
  useProjectRoles: () => ({
    data: roles,
    isPending: false,
  }),
  useCreateProjectRole: () => mutation,
  useUpdateProjectRole: () => mutation,
  useDeleteProjectRole: () => mutation,
}));

describe('ProjectRolesSection', () => {
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

  it('renders roles table with names, descriptions, and badges', async () => {
    const root = createRoot(container);
    await act(async () => root.render(<ProjectRolesSection projectId="p-1" />));

    expect(container.textContent).toContain('Content Author');
    expect(container.textContent).toContain('Can edit and publish pages');
    expect(container.textContent).toContain('Project Default');
    expect(container.textContent).toContain('Default');
    expect(container.textContent).toContain('3 granted');
    expect(container.textContent).toContain('1 granted');

    act(() => root.unmount());
  });
});
