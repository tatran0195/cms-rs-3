// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DocsStandardLayoutTemplate } from './docs-layout';

describe('DocsStandardLayoutTemplate', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders ReaderLayout with standard fumadocs structure and data attribute', () => {
    act(() => {
      root.render(
        DocsStandardLayoutTemplate.ReaderLayout({
          header: <header data-testid="hdr">Header</header>,
          navigation: <nav data-testid="nav">Navigation</nav>,
          content: <main data-testid="cnt">Content</main>,
        }),
      );
    });

    const shell = container.querySelector('[data-documentation-layout="fumadocs-docs"]');
    expect(shell).not.toBeNull();
    const sidebar = container.querySelector('[data-theme-region="sidebar"]');
    expect(sidebar).not.toBeNull();
    expect(container.querySelector('[data-testid="hdr"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="nav"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="cnt"]')).not.toBeNull();
  });

  it('renders PageLayout with two-column article and TOC structure', () => {
    act(() => {
      root.render(
        DocsStandardLayoutTemplate.PageLayout({
          article: <article data-testid="art">Article</article>,
          tableOfContents: <aside data-testid="toc">TOC</aside>,
        }),
      );
    });

    const pageShell = container.querySelector('[data-documentation-layout="fumadocs-docs-page"]');
    expect(pageShell).not.toBeNull();
    expect(container.querySelector('[data-testid="art"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="toc"]')).not.toBeNull();
  });
});
