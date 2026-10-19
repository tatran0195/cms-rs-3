import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FUMADOCS_LAYOUT_OPTIONS,
  formatPropSummary,
  type FumadocsLayoutOptions,
  type PropsTablePath,
} from './types';

describe('theme props types and helpers', () => {
  it('provides default Fumadocs layout options', () => {
    expect(DEFAULT_FUMADOCS_LAYOUT_OPTIONS).toEqual({
      nav: { title: 'My Docs', transparentMode: 'none' },
      themeSwitch: { enabled: true, mode: 'light-dark' },
      searchToggle: { enabled: true },
      sidebar: { collapsible: true },
    });
  });

  it('formats object property summary properly', () => {
    const nav: FumadocsLayoutOptions['nav'] = { title: 'My Docs' };
    expect(formatPropSummary(nav)).toBe('{ title }');

    const themeSwitch: FumadocsLayoutOptions['themeSwitch'] = { enabled: true, mode: 'light-dark' };
    expect(formatPropSummary(themeSwitch)).toBe('{ enabled, mode }');

    const searchToggle: FumadocsLayoutOptions['searchToggle'] = { enabled: true };
    expect(formatPropSummary(searchToggle)).toBe('{ enabled }');

    const sidebar: FumadocsLayoutOptions['sidebar'] = { collapsible: true };
    expect(formatPropSummary(sidebar)).toBe('{ collapsible }');
  });

  it('validates navigation path type check', () => {
    const rootPath: PropsTablePath = [];
    const navPath: PropsTablePath = ['nav'];
    const palettePath: PropsTablePath = ['palette'];
    expect(rootPath).toHaveLength(0);
    expect(navPath[0]).toBe('nav');
    expect(palettePath[0]).toBe('palette');
  });
});
