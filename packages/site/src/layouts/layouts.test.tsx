import { DOCS_LAYOUT_IDS } from '@cms/shared/themes';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getDocsLayoutTemplate } from './index';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from './page';

describe('DocsLayout registry', () => {
  it('provides a valid template for all 5 layout IDs', () => {
    for (const id of DOCS_LAYOUT_IDS) {
      const template = getDocsLayoutTemplate(id);
      expect(template.id).toBe(id);
      expect(typeof template.ReaderLayout).toBe('function');
      expect(typeof template.PageLayout).toBe('function');
      expect(typeof template.StudioPreviewLayout).toBe('function');
      expect(typeof template.ProjectPreviewLayout).toBe('function');
    }
  });

  it('renders document page with Fumadocs DocsPage, DocsTitle, DocsDescription, and DocsBody hierarchy', () => {
    const markup = renderToStaticMarkup(
      <DocsPage>
        <DocsTitle>Quickstart Guide</DocsTitle>
        <DocsDescription>Learn how to get started in 5 minutes.</DocsDescription>
        <DocsBody>
          <p>Welcome to our developer platform.</p>
        </DocsBody>
      </DocsPage>,
    );

    expect(markup).toContain('id="nd-page"');
    expect(markup).toContain('<h1 class="text-[1.75em] font-semibold tracking-tight md:text-4xl">Quickstart Guide</h1>');
    expect(markup).toContain('<p class="mb-8 text-lg text-fd-muted-foreground">Learn how to get started in 5 minutes.</p>');
    expect(markup).toContain('<div class="prose flex-1 min-w-0 w-full"><p>Welcome to our developer platform.</p></div>');
  });
});
