// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { editorStore } from './editor-store';

describe('EditorStore atomic state management', () => {
  beforeEach(() => {
    editorStore.setState({
      syncStatus: 'idle',
      view: 'content',
      editorMode: 'visual',
      sidebarCollapsed: false,
      sidebarWidth: 260,
      railOpen: false,
    });
  });

  it('updates syncStatus and notifies listeners atomically', () => {
    let notified = false;
    const unsub = editorStore.subscribe(() => {
      notified = true;
    });

    editorStore.setSyncStatus('saving');
    expect(editorStore.getState().syncStatus).toBe('saving');
    expect(notified).toBe(true);

    unsub();
  });

  it('clamps and persists sidebar width correctly', () => {
    editorStore.setSidebarWidth(100); // Below 200 min
    expect(editorStore.getState().sidebarWidth).toBe(200);

    editorStore.setSidebarWidth(800); // Above 520 max
    expect(editorStore.getState().sidebarWidth).toBe(520);
  });

  it('updates editorMode and persists preference', () => {
    editorStore.setEditorMode('markdown');
    expect(editorStore.getState().editorMode).toBe('markdown');
    expect(window.localStorage.getItem('cms.editor.contentMode')).toBe('markdown');
  });
});
