import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DocsStandardLayoutTemplate } from './docs-layout';

describe('DocsStandardLayoutTemplate', () => {
  it('renders ReaderLayout with standard fumadocs structure and data attribute', () => {
    const markup = renderToStaticMarkup(
      DocsStandardLayoutTemplate.ReaderLayout({
        header: <header data-testid="hdr">Header</header>,
        navigation: <nav data-testid="nav">Navigation</nav>,
        content: <main data-testid="cnt">Content</main>,
      }),
    );

    expect(markup).toContain('id="nd-docs-layout"');
    expect(markup).toContain('data-documentation-layout="docs"');
    expect(markup).toContain('id="nd-sidebar"');
    expect(markup).toContain('Header');
    expect(markup).toContain('Navigation');
    expect(markup).toContain('Content');
    expect(markup).toContain('var(--fd-sidebar-col)');
  });

  it('renders PageLayout with #nd-page and TOC structure', () => {
    const markup = renderToStaticMarkup(
      DocsStandardLayoutTemplate.PageLayout({
        article: <article data-testid="art">Article</article>,
        tableOfContents: <aside data-testid="toc">TOC</aside>,
      }),
    );

    expect(markup).toContain('data-documentation-layout="docs-page"');
    expect(markup).toContain('id="nd-page"');
    expect(markup).toContain('Article');
    expect(markup).toContain('TOC');
  });
});
