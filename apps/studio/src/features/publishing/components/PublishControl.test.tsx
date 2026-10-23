/** @vitest-environment jsdom */

import type { Project } from '@cms/sdk';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublishControl } from './PublishControl';

vi.mock('@cms/i18n/react', () => ({
  useT: () => (key: string) => key,
}));

vi.mock('@cms/sdk/react', () => ({
  useDeployments: () => ({ data: [] }),
}));

vi.mock('./PublishModal', () => ({
  PublishModal: () => null,
}));

vi.mock('./DeployPipeline', () => ({
  DeployPipeline: () => null,
}));

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const roots: Array<ReturnType<typeof createRoot>> = [];

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  for (const root of roots) {
    act(() => root.unmount());
  }
  roots.length = 0;
  document.body.innerHTML = '';
});

describe('PublishControl', () => {
  const dummyProject: Project = {
    id: 'proj-123',
    name: 'Test Project',
    slug: 'test-project',
    icon: null,
    description: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: null,
  };

  it('renders both the publish button and dropdown trigger using the Button primitive', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(<PublishControl project={dummyProject} />);
    });

    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    const publishBtn = buttons[0];
    const triggerBtn = buttons[1];

    expect(publishBtn).toBeDefined();
    expect(triggerBtn).toBeDefined();
    // Publish button has data-slot="button", trigger has data-slot="dropdown-menu-trigger"
    expect(publishBtn?.getAttribute('data-slot')).toBe('button');
    expect(triggerBtn?.getAttribute('data-slot')).toBe('dropdown-menu-trigger');
    expect(triggerBtn?.className).toContain('h-7');
  });
});
