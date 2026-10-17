// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FluxLayoutTemplate } from './flux-layout';

describe('FluxLayoutTemplate', () => {
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

  it('renders ReaderLayout with streamlined minimalist flux shell', () => {
    act(() => {
      root.render(
        FluxLayoutTemplate.ReaderLayout({
          header: <header data-testid="hdr">Header</header>,
          navigation: <nav data-testid="nav">Navigation</nav>,
          content: <main data-testid="cnt">Content</main>,
        }),
      );
    });

    const shell = container.querySelector('[data-documentation-layout="fumadocs-flux"]');
    expect(shell).not.toBeNull();
    const rail = container.querySelector('.fumadocs-flux-rail');
    expect(rail).not.toBeNull();
  });

  it('renders PageLayout with distraction-free layout', () => {
    act(() => {
      root.render(
        FluxLayoutTemplate.PageLayout({
          article: <article data-testid="art">Article</article>,
          tableOfContents: <aside data-testid="toc">TOC</aside>,
        }),
      );
    });

    const pageShell = container.querySelector('[data-documentation-layout="fumadocs-flux-page"]');
    expect(pageShell).not.toBeNull();
  });
});
