// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SpaciousLayoutTemplate } from './spacious-layout';

describe('SpaciousLayoutTemplate', () => {
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

  it('renders ReaderLayout with inset spacious container', () => {
    act(() => {
      root.render(
        SpaciousLayoutTemplate.ReaderLayout({
          header: <header data-testid="hdr">Header</header>,
          navigation: <nav data-testid="nav">Navigation</nav>,
          content: <main data-testid="cnt">Content</main>,
        }),
      );
    });

    const shell = container.querySelector('[data-documentation-layout="fumadocs-spacious"]');
    expect(shell).not.toBeNull();
    const panel = container.querySelector('.fumadocs-spacious-panel');
    expect(panel).not.toBeNull();
  });

  it('renders PageLayout with relaxed measure', () => {
    act(() => {
      root.render(
        SpaciousLayoutTemplate.PageLayout({
          article: <article data-testid="art">Article</article>,
          tableOfContents: <aside data-testid="toc">TOC</aside>,
        }),
      );
    });

    const pageShell = container.querySelector('[data-documentation-layout="fumadocs-spacious-page"]');
    expect(pageShell).not.toBeNull();
  });
});
