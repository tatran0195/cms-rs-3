import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TableOfContents, type TocHeading } from './toc';

describe('TableOfContents', () => {
  const headings: TocHeading[] = [
    { id: 'intro', text: 'Introduction', depth: 2 },
    { id: 'install', text: 'Installation', depth: 2 },
    { id: 'npm', text: 'Using NPM', depth: 3 },
    { id: 'config', text: 'Advanced Configuration', depth: 4 },
  ];

  it('filters headings according to depth prop', () => {
    const markup = renderToStaticMarkup(<TableOfContents headings={headings} label="On this page" depth={2} />);

    expect(markup).toContain('Introduction');
    expect(markup).toContain('Installation');
    expect(markup).not.toContain('Using NPM');
    expect(markup).not.toContain('Advanced Configuration');
  });

  it('renders clerk style with track line and no redundant inner sticky styles', () => {
    const markup = renderToStaticMarkup(<TableOfContents headings={headings} label="On this page" style="clerk" depth={3} />);

    expect(markup).toContain('data-toc-style="clerk"');
    expect(markup).toContain('data-toc-item="clerk"');
    expect(markup).not.toContain('sticky top-[calc');
  });

  it('renders block style with block item attributes', () => {
    const markup = renderToStaticMarkup(<TableOfContents headings={headings} label="On this page" style="block" depth={3} />);

    expect(markup).toContain('data-toc-style="block"');
    expect(markup).toContain('data-toc-item="block"');
  });

  it('renders normal style with normal item attributes', () => {
    const markup = renderToStaticMarkup(<TableOfContents headings={headings} label="On this page" style="normal" depth={3} />);

    expect(markup).toContain('data-toc-style="normal"');
    expect(markup).toContain('data-toc-item="normal"');
  });

  it('supports multi-heading active range with activeIds prop', () => {
    const markup = renderToStaticMarkup(
      <TableOfContents headings={headings} label="On this page" style="clerk" depth={3} activeIds={['intro', 'install']} />,
    );

    expect(markup).toContain('data-active="true"');
    expect(markup).toContain('Introduction');
    expect(markup).toContain('Installation');
  });

  it('supports single controlled activeId prop', () => {
    const markup = renderToStaticMarkup(
      <TableOfContents headings={headings} label="On this page" style="clerk" depth={3} activeId="install" />,
    );

    expect(markup).toContain('data-active="true"');
    expect(markup).toContain('Installation');
  });
});
