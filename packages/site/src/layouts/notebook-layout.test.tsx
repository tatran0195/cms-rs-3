// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NotebookLayoutTemplate } from './notebook-layout';

describe('NotebookLayoutTemplate', () => {
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

  it('renders ReaderLayout with card-style notebook canvas', () => {
    act(() => {
      root.render(
        NotebookLayoutTemplate.ReaderLayout({
          header: <header data-testid="hdr">Header</header>,
          navigation: <nav data-testid="nav">Navigation</nav>,
          content: <main data-testid="cnt">Content</main>,
        }),
      );
    });

    const shell = container.querySelector('#nd-notebook-layout');
    expect(shell).not.toBeNull();
    expect(shell?.getAttribute('data-documentation-layout')).toBe('fumadocs-notebook');
    const paper = container.querySelector('.fumadocs-notebook-paper');
    expect(paper).not.toBeNull();
  });

  it('renders PageLayout with #nd-page and chapter deck layout', () => {
    act(() => {
      root.render(
        NotebookLayoutTemplate.PageLayout({
          article: <article data-testid="art">Article</article>,
          tableOfContents: <aside data-testid="toc">TOC</aside>,
        }),
      );
    });

    const pageShell = container.querySelector('[data-documentation-layout="fumadocs-notebook-page"]');
    expect(pageShell).not.toBeNull();
    const article = container.querySelector('#nd-page');
    expect(article).not.toBeNull();
    expect(container.querySelector('[data-testid="art"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="toc"]')).not.toBeNull();
  });
});
