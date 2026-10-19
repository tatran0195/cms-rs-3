import { describe, expect, it } from 'vitest';
import { formatPropSummary, type PropsTablePath } from './types';

describe('theme props types and helpers', () => {
  it('formats object property summary properly', () => {
    const layout = { docsLayout: 'docs', density: 'comfortable' };
    expect(formatPropSummary(layout)).toBe('{ docsLayout, density }');

    const themeSwitch = { enabled: true, mode: 'light-dark' };
    expect(formatPropSummary(themeSwitch)).toBe('{ enabled, mode }');

    const sidebar = { collapsible: true };
    expect(formatPropSummary(sidebar)).toBe('{ collapsible }');
  });

  it('validates navigation path type check', () => {
    const rootPath: PropsTablePath = [];
    const layoutPath: PropsTablePath = ['layout'];
    const headerPath: PropsTablePath = ['header'];
    const sidebarPath: PropsTablePath = ['sidebar'];
    const palettePath: PropsTablePath = ['palette'];
    expect(rootPath).toHaveLength(0);
    expect(layoutPath[0]).toBe('layout');
    expect(headerPath[0]).toBe('header');
    expect(sidebarPath[0]).toBe('sidebar');
    expect(palettePath[0]).toBe('palette');
  });
});
