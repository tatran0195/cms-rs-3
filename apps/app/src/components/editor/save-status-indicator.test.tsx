/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SaveStatusIndicator } from './save-status-indicator';
import { editorStore } from '@/stores/editor-store';

vi.mock('@cms/i18n/react', () => ({ useT: () => (key: string) => key }));
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

function renderIndicator() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(<SaveStatusIndicator />);
  });
  return container;
}

describe('SaveStatusIndicator', () => {
  it('renders empty container when idle', () => {
    act(() => {
      editorStore.setSyncStatus('idle');
    });
    const container = renderIndicator();
    expect(container.textContent).toBe('');
  });

  it('renders saving indicator when saving', () => {
    act(() => {
      editorStore.setSyncStatus('saving');
    });
    const container = renderIndicator();
    expect(container.textContent).toContain('editor.savingShort');
    const roleElem = container.querySelector("[role='status']");
    expect(roleElem).not.toBeNull();
  });

  it('renders saved indicator when saved', () => {
    act(() => {
      editorStore.setSyncStatus('saved');
    });
    const container = renderIndicator();
    expect(container.textContent).toContain('editor.savedShort');
    const roleElem = container.querySelector("[role='status']");
    expect(roleElem).not.toBeNull();
  });
});
