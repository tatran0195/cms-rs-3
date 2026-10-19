// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TableOfContents, type TocHeading } from './toc';

// @ts-expect-error react act test env
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('TableOfContents', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const headings: TocHeading[] = [
    { id: 'intro', text: 'Introduction', depth: 2 },
    { id: 'install', text: 'Installation', depth: 2 },
    { id: 'npm', text: 'Using NPM', depth: 3 },
    { id: 'config', text: 'Advanced Configuration', depth: 4 },
  ];

  it('filters headings according to depth prop', () => {
    act(() => {
      root.render(<TableOfContents headings={headings} label="On this page" depth={2} />);
    });

    expect(container.textContent).toContain('Introduction');
    expect(container.textContent).toContain('Installation');
    expect(container.textContent).not.toContain('Using NPM');
    expect(container.textContent).not.toContain('Advanced Configuration');
  });

  it('renders clerk style with track line', () => {
    act(() => {
      root.render(<TableOfContents headings={headings} label="On this page" style="clerk" depth={3} />);
    });

    const rootEl = container.querySelector('[data-toc-style="clerk"]');
    expect(rootEl).not.toBeNull();
    // SVG track lines are present
    const trackLines = container.querySelectorAll('svg line');
    expect(trackLines.length).toBe(3);
    const activeItem = container.querySelector('[data-active="true"]');
    expect(activeItem).not.toBeNull();
  });

  it('renders block style with block item attributes', () => {
    act(() => {
      root.render(<TableOfContents headings={headings} label="On this page" style="block" depth={3} />);
    });

    const rootEl = container.querySelector('[data-toc-style="block"]');
    expect(rootEl).not.toBeNull();
    const blockItems = container.querySelectorAll('[data-toc-item="block"]');
    expect(blockItems.length).toBe(3);
  });

  it('renders normal style with normal item attributes', () => {
    act(() => {
      root.render(<TableOfContents headings={headings} label="On this page" style="normal" depth={3} />);
    });

    const rootEl = container.querySelector('[data-toc-style="normal"]');
    expect(rootEl).not.toBeNull();
    const normalItems = container.querySelectorAll('[data-toc-item="normal"]');
    expect(normalItems.length).toBe(3);
  });

  it('supports multi-heading active range with activeIds prop', () => {
    act(() => {
      root.render(<TableOfContents headings={headings} label="On this page" style="clerk" depth={3} activeIds={['intro', 'install']} />);
    });

    const activeItems = container.querySelectorAll('[data-active="true"]');
    expect(activeItems.length).toBe(2);
    expect(activeItems[0]?.textContent).toContain('Introduction');
    expect(activeItems[1]?.textContent).toContain('Installation');
  });

  it('supports single controlled activeId prop', () => {
    act(() => {
      root.render(<TableOfContents headings={headings} label="On this page" style="clerk" depth={3} activeId="install" />);
    });

    const activeItems = container.querySelectorAll('[data-active="true"]');
    expect(activeItems.length).toBe(1);
    expect(activeItems[0]?.textContent).toContain('Installation');
  });
});
