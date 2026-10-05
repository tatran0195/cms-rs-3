import { describe, expect, it } from 'vitest';
import { extractHeadingsSync, parseFrontmatterSync } from './ast-worker';
import { astWorkerClient } from './ast-worker-client';

describe('AST Worker & Synchronous Fallback', () => {
  it('correctly parses frontmatter and separates content', () => {
    const raw = `---
title: "Document Title"
description: 'Page description'
published: true
---
# Main Content Heading
Paragraph text goes here.`;

    const parsed = parseFrontmatterSync(raw);
    expect(parsed.frontmatter).toEqual({
      title: 'Document Title',
      description: 'Page description',
      published: 'true',
    });
    expect(parsed.content.trim()).toBe('# Main Content Heading\nParagraph text goes here.');
  });

  it('handles markdown without frontmatter gracefully', () => {
    const raw = '# Just Markdown\nNo frontmatter here.';
    const parsed = parseFrontmatterSync(raw);
    expect(parsed.frontmatter).toEqual({});
    expect(parsed.content).toBe(raw);
  });

  it('extracts markdown headings up to level 6 and generates slug IDs', () => {
    const raw = `
# Title 1
Some introductory text.

## Section 2: Advanced Guide!
Content.

### Subsection 2.1
Subcontent.
`;
    const headings = extractHeadingsSync(raw);
    expect(headings).toHaveLength(3);
    expect(headings[0]).toEqual({
      level: 1,
      text: 'Title 1',
      id: 'title-1',
    });
    expect(headings[1]).toEqual({
      level: 2,
      text: 'Section 2: Advanced Guide!',
      id: 'section-2-advanced-guide',
    });
    expect(headings[2]).toEqual({
      level: 3,
      text: 'Subsection 2.1',
      id: 'subsection-21',
    });
  });

  it('astWorkerClient parses correctly via fallback in test environment', async () => {
    const res = await astWorkerClient.parseFrontmatter(`---
author: Linus
---
Hello World`);
    expect(res.frontmatter.author).toBe('Linus');
    expect(res.content).toBe('Hello World');
  });
});
