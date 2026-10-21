import { describe, expect, it } from 'vitest';
import { cleanAnchorRows, cleanRows, normalizeTabs } from './navbar-utils';

describe('navbar-utils', () => {
  describe('cleanRows', () => {
    it('filters out empty and whitespace-only rows', () => {
      const rows = [
        { label: 'Docs', href: '/docs', external: false },
        { label: '   ', href: '   ' },
        { label: 'Blog', href: 'https://example.com/blog', external: true },
      ];
      expect(cleanRows(rows)).toEqual([
        { label: 'Docs', href: '/docs', external: false },
        { label: 'Blog', href: 'https://example.com/blog', external: true },
      ]);
    });
  });

  describe('cleanAnchorRows', () => {
    it('filters empty rows and strips empty icon strings', () => {
      const rows = [
        { label: 'GitHub', href: 'https://github.com', icon: 'github', external: true },
        { label: 'Discord', href: '/chat', icon: '  ' },
        { label: '   ', href: '' },
      ];
      expect(cleanAnchorRows(rows)).toEqual([
        { label: 'GitHub', href: 'https://github.com', icon: 'github', external: true },
        { label: 'Discord', href: '/chat', icon: undefined, external: undefined },
      ]);
    });
  });

  describe('normalizeTabs', () => {
    it('normalizes raw json objects and recursively preserves items', () => {
      const raw = [
        {
          label: 'Guides',
          href: '/guides',
          external: false,
          items: [
            { label: 'Quickstart', href: '/guides/quickstart' },
            { label: 'Advanced', href: '/guides/advanced', external: true, items: [] },
          ],
        },
        null,
        { label: 'API Reference' },
      ];

      expect(normalizeTabs(raw)).toEqual([
        {
          label: 'Guides',
          href: '/guides',
          external: false,
          items: [
            { label: 'Quickstart', href: '/guides/quickstart', external: false, items: undefined },
            { label: 'Advanced', href: '/guides/advanced', external: true, items: undefined },
          ],
        },
        { label: '', href: '', external: false, items: undefined },
        { label: 'API Reference', href: '', external: false, items: undefined },
      ]);
    });
  });
});
