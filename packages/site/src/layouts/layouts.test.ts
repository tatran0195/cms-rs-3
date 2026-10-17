import { describe, expect, it } from 'vitest';
import { getDocsLayoutTemplate } from './index';
import { DOCS_LAYOUT_IDS } from '@cms/shared/themes';

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
});
