import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PermissionMatrix } from './PermissionMatrix';
import type { PermissionCatalog, PermissionsMatrixState } from './types';

const testCatalog: PermissionCatalog = {
  resources: [
    { key: 'pages', actions: ['create', 'read', 'edit', 'delete', 'publish'] },
    { key: 'branches', actions: ['create', 'read', 'edit', 'delete'] },
    { key: 'analytics', actions: ['read'] },
  ],
  actions: ['create', 'read', 'edit', 'delete', 'publish'],
};

describe('PermissionMatrix', () => {
  it('renders table with action headers and resource rows', () => {
    const value: PermissionsMatrixState = {};
    render(<PermissionMatrix catalog={testCatalog} value={value} readonly />);

    expect(screen.getByTestId('permission-matrix')).toBeInTheDocument();
    expect(screen.getByTestId('resource-row-pages')).toBeInTheDocument();
    expect(screen.getByTestId('resource-row-branches')).toBeInTheDocument();
    expect(screen.getByTestId('resource-row-analytics')).toBeInTheDocument();
  });

  it('renders check icons for granted actions and dashes for ungranted in readonly mode', () => {
    const value: PermissionsMatrixState = {
      pages: { read: true, create: false },
    };
    render(<PermissionMatrix catalog={testCatalog} value={value} readonly />);

    expect(screen.getByTestId('check-pages-read')).toBeInTheDocument();
    expect(screen.getByTestId('dash-pages-create')).toBeInTheDocument();
  });

  it('calls onChange when toggling individual cell checkbox in interactive mode', () => {
    const onChange = vi.fn();
    const value: PermissionsMatrixState = {
      pages: { read: true },
    };
    render(<PermissionMatrix catalog={testCatalog} value={value} onChange={onChange} />);

    const checkbox = screen.getByTestId('cell-checkbox-pages-create');
    fireEvent.click(checkbox);

    expect(onChange).toHaveBeenCalledWith({
      pages: { read: true, create: true },
    });
  });

  it('toggles column permissions in bulk across all supported resources', () => {
    const onChange = vi.fn();
    const value: PermissionsMatrixState = {};
    render(<PermissionMatrix catalog={testCatalog} value={value} onChange={onChange} />);

    const columnToggle = screen.getByTestId('column-toggle-read');
    fireEvent.click(columnToggle);

    expect(onChange).toHaveBeenCalledWith({
      pages: { read: true },
      branches: { read: true },
      analytics: { read: true },
    });
  });

  it('supports category grouping with category bulk toggles', () => {
    const onChange = vi.fn();
    const value: PermissionsMatrixState = {};
    const categories = [
      {
        id: 'content',
        label: 'Content Management',
        resources: ['pages', 'branches'],
      },
    ];

    render(<PermissionMatrix catalog={testCatalog} value={value} categories={categories} onChange={onChange} />);

    expect(screen.getByText('Content Management')).toBeInTheDocument();
    const categoryToggle = screen.getByTestId('category-toggle-content');
    fireEvent.click(categoryToggle);

    expect(onChange).toHaveBeenCalled();
  });
});
