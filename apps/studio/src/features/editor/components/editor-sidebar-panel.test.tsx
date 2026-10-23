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

const mockPages: PageNode[] = [
  { id: 'p1', title: 'Docs Intro', slug: 'intro', path: '/docs/intro', kind: 'PAGE', parentId: null, position: 0 },
  { id: 'p2', title: 'API Auth', slug: 'auth', path: '/api/auth', kind: 'PAGE', parentId: null, position: 1 },
  { id: 'p3', title: 'Other Page', slug: 'other', path: '/other', kind: 'PAGE', parentId: null, position: 2 },
] as unknown as PageNode[];

vi.mock('@cms/sdk/react', () => ({
  usePages: () => ({
    data: mockPages,
    isPending: false,
    isPlaceholderData: false,
    isFetching: false,
  }),
  useReorderPages: () => ({
    mutate: vi.fn(),
  }),
  useUpdatePage: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
  }),
  useUpdateLanguage: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useUpdateProjectConfig: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
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

const mockLanguages: Language[] = [
  {
    id: 'en',
    code: 'en',
    label: 'English',
    isDefault: true,
    direction: 'LTR',
    position: 0,
    config: {
      navbar: {
        tabs: [
          { label: 'Documentation', href: '/docs' },
          { label: 'API Reference', href: '/api' },
        ],
        anchors: [{ label: 'Community Forum', href: 'https://community.example.com' }],
      },
    },
  } as unknown as Language,
];

describe('EditorSidebarPanel', () => {
  it('renders root tab sections grouping pages by path prefix', async () => {
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
        />,
      );
    });

    expect(container.textContent).toContain('Documentation');
    expect(container.textContent).toContain('API Reference');
    expect(container.textContent).toContain('Community Forum');
  });

  it('renders unified creation button', async () => {
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
        />,
      );
    });

    const addBtn = container.querySelector('[aria-label="Add content or navigation"]');
    expect(addBtn).not.toBeNull();
  });

  it('renders pinned footer actions for site configuration and new page', async () => {
    const onOpenSiteConfig = vi.fn();
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
          onOpenSiteConfig={onOpenSiteConfig}
        />,
      );
    });

    const configBtn = container.querySelector('button[aria-label="Site configuration"]');
    expect(configBtn).not.toBeNull();
    configBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onOpenSiteConfig).toHaveBeenCalledTimes(1);

    const newPageBtn = container.querySelector('button[aria-label="New page"]');
    expect(newPageBtn).not.toBeNull();
  });

  it('correctly extracts tab prefixes and matches the most specific tab first', async () => {
    const { getTabPrefix, findTabForPage } = await import('./editor-sidebar-panel');

    const tabDocs = { label: 'Level 1 - Docs', href: '/getting-started' };
    const tabNotes = { label: 'Level 1 - Release Notes', href: '/getting-started#notes' };
    const tabExt = { label: 'External', href: 'https://docs.example.com' };

    expect(getTabPrefix(tabDocs)).toBe('getting-started');
    expect(getTabPrefix(tabNotes)).toBe('getting-started-notes');
    expect(getTabPrefix(tabExt)).toBe('external');

    const pageNotes = { path: '/getting-started-notes-untitled', slug: 'getting-started-notes-untitled' };
    const pageDocs = { path: '/getting-started', slug: 'getting-started' };

    const matchedNotes = findTabForPage(pageNotes, [tabDocs, tabNotes]);
    expect(matchedNotes?.label).toBe('Level 1 - Release Notes');

    const matchedDocs = findTabForPage(pageDocs, [tabDocs, tabNotes]);
    expect(matchedDocs?.label).toBe('Level 1 - Docs');
  });
});
