// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GlassLayoutTemplate } from './glass-layout';

describe('GlassLayoutTemplate', () => {
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

  it('renders ReaderLayout with translucent glass floating shell', () => {
    act(() => {
      root.render(
        GlassLayoutTemplate.ReaderLayout({
          header: <header data-testid="hdr">Header</header>,
          navigation: <nav data-testid="nav">Navigation</nav>,
          content: <main data-testid="cnt">Content</main>,
        }),
      );
    });

    const shell = container.querySelector('[data-documentation-layout="fumadocs-glass"]');
    expect(shell).not.toBeNull();
    const sidebar = container.querySelector('.fumadocs-glass-sidebar');
    expect(sidebar).not.toBeNull();
  });

  it('renders PageLayout with glassmorphic accents', () => {
    act(() => {
      root.render(
        GlassLayoutTemplate.PageLayout({
          article: <article data-testid="art">Article</article>,
          tableOfContents: <aside data-testid="toc">TOC</aside>,
        }),
      );
    });

    const pageShell = container.querySelector('[data-documentation-layout="fumadocs-glass-page"]');
    expect(pageShell).not.toBeNull();
  });
});
