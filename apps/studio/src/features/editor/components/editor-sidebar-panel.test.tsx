/** @vitest-environment jsdom */
import type { Language, PageNode } from '@cms/sdk';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorSidebarPanel } from './editor-sidebar-panel';

vi.mock('@cms/i18n/react', () => ({
  useT: () => (key: string) => {
    if (key === 'common.loading') return 'Loading...';
    if (key === 'editor.noPagesYet') return 'No pages yet';
    if (key === 'editor.newPage') return 'New Page';
    if (key === 'editor.pages') return 'Pages';
    return key;
  },
}));

vi.mock('@cms/sdk/react', () => ({
  usePages: () => ({
    data: [{ id: 'p1', title: 'Home', slug: 'home', path: '/home', kind: 'PAGE', parentId: null, position: 0 }] as PageNode[],
    isPending: false,
    isPlaceholderData: false,
    isFetching: false,
  }),
  useReorderPages: () => ({
    mutate: vi.fn(),
  }),
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Array<ReturnType<typeof createRoot>> = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }
  document.body.replaceChildren();
});

const mockLanguages: Language[] = [{ id: 'en', code: 'en', label: 'English', isDefault: true, direction: 'LTR', position: 0 } as Language];

describe('EditorSidebarPanel', () => {
  it('renders pages tree when pages are loaded', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <EditorSidebarPanel
          projectId="proj-1"
          activeBranchId="b-main"
          selectedId="p1"
          languages={mockLanguages}
          languagesPending={false}
          activeLanguageId="en"
          onSelectLanguage={vi.fn()}
          onSelectPage={vi.fn()}
          onAddPage={vi.fn()}
          onAddGroup={vi.fn()}
          onOpenPageSettings={vi.fn()}
          onManageNavbar={vi.fn()}
        />,
      );
    });

    expect(container.querySelector('[data-page-id="p1"]')).not.toBeNull();
  });
});
