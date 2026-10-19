// @vitest-environment jsdom

import type { Project } from '@cms/sdk';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemePresetsAndExchange } from './theme-presets-and-exchange';

// @ts-expect-error configure react act environment for jsdom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mutation = { isPending: false, mutate: vi.fn() };

vi.mock('@cms/i18n/react', () => ({
  useT: () => (key: string) => key,
  translateFn: (key: string) => key,
}));

vi.mock('@cms/sdk/react', () => ({
  useExportProjectTheme: () => mutation,
  useImportProjectTheme: () => mutation,
}));

const mockProject: Project = {
  id: 'test-project',
  name: 'Test Project',
  slug: 'test-project',
  organizationId: 'test-org',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  config: {},
};

describe('ThemePresetsAndExchange', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders presets list', async () => {
    const handleSelectPreset = vi.fn();
    await act(async () => {
      root.render(
        <ThemePresetsAndExchange
          project={mockProject}
          activePreset="harbor"
          onSelectPreset={handleSelectPreset}
          onApplyTheme={vi.fn()}
        />
      );
    });

    expect(container.textContent).toContain('settings.theme.preset.harbor.name');
    expect(container.textContent).toContain('settings.theme.preset.manuscript.name');
    expect(container.textContent).toContain('settings.theme.preset.signal.name');
  });

  it('triggers onSelectPreset when a preset button is clicked', async () => {
    const handleSelectPreset = vi.fn();
    await act(async () => {
      root.render(
        <ThemePresetsAndExchange
          project={mockProject}
          activePreset="harbor"
          onSelectPreset={handleSelectPreset}
          onApplyTheme={vi.fn()}
        />
      );
    });

    const manuscriptBtn = container.querySelector('button[data-preset-id="manuscript"]');
    expect(manuscriptBtn).toBeDefined();

    await act(async () => {
      (manuscriptBtn as HTMLElement)?.click();
    });

    expect(handleSelectPreset).toHaveBeenCalledWith('manuscript');
  });
});
