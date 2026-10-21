import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { NavNode } from '../types';
import { isVersionIndependentNavNode, SiteNav } from './site-nav';

describe('SiteNav', () => {
  it('keeps synthetic OpenAPI navigation outside branch URL prefixes', () => {
    expect(isVersionIndependentNavNode({ id: 'openapi:hash' })).toBe(true);
    expect(isVersionIndependentNavNode({ id: 'page_123' })).toBe(false);
  });

  it('renders active nav item with primary pill styling and data-active attribute', () => {
    const nodes: NavNode[] = [
      {
        id: 'intro',
        kind: 'PAGE',
        title: 'Introduction',
        path: 'intro',
        icon: null,
        tag: null,
        children: [],
      },
      {
        id: 'getting-started',
        kind: 'PAGE',
        title: 'Getting Started',
        path: 'getting-started',
        icon: null,
        tag: null,
        children: [],
      },
    ];

    const markup = renderToStaticMarkup(<SiteNav nodes={nodes} projectId="proj-1" currentPath="getting-started" />);

    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('data-active="true"');
    expect(markup).toContain('bg-primary/10');
    expect(markup).toContain('text-primary');
    expect(markup).toContain('data-active="false"');
  });

  it('renders top-level section groups and nested items with correct indentation', () => {
    const nodes: NavNode[] = [
      {
        id: 'guide-group',
        kind: 'GROUP',
        title: 'User Guide',
        path: '',
        icon: null,
        tag: null,
        children: [
          {
            id: 'overview',
            kind: 'PAGE',
            title: 'Overview',
            path: 'guide/overview',
            icon: null,
            tag: 'New',
            children: [],
          },
        ],
      },
    ];

    const markup = renderToStaticMarkup(<SiteNav nodes={nodes} projectId="proj-1" currentPath="guide/overview" />);

    expect(markup).toContain('User Guide');
    expect(markup).toContain('Overview');
    expect(markup).toContain('New');
    expect(markup).toContain('data-active="true"');
  });
});
