import { describe, expect, it } from 'vitest';
import {
  applyThemeTemplateConfig,
  canonicalThemeTemplateJson,
  inspectThemeTemplateInput,
  previewThemeConfigChanges,
  resolveDocsLayout,
  resolveTheme,
  safeThemeFontFamily,
  safeThemeHex,
  THEME_PRESETS,
  themeContrastIssues,
  themeOwnedConfig,
  themeTemplateFromConfig,
} from './themes';

describe('documentation themes', () => {
  it('ships three distinct, contrast-guarded presets', () => {
    expect(Object.keys(THEME_PRESETS)).toEqual(['harbor', 'manuscript', 'signal']);
    // Presets own only color palette + components, never layout.
    for (const preset of Object.values(THEME_PRESETS)) {
      expect((preset as Record<string, unknown>).layout).toBeUndefined();
    }
    // Each preset has a unique canvas colour in both modes.
    const lightCanvases = new Set(Object.values(THEME_PRESETS).map((p) => p.colors.light.canvas));
    const darkCanvases = new Set(Object.values(THEME_PRESETS).map((p) => p.colors.dark.canvas));
    expect(lightCanvases.size).toBe(3);
    expect(darkCanvases.size).toBe(3);
    // Contrast is verified via resolveTheme (colors are unchanged when no overrides supplied).
    for (const preset of Object.values(THEME_PRESETS)) {
      expect(themeContrastIssues(resolveTheme({ theme: { preset: preset.id } }))).toEqual([]);
    }
  });

  it('migrates legacy appearance fields into the compatible default resolver', () => {
    const theme = resolveTheme({ styling: { primaryColor: '#123456', radius: 'pill' } });
    expect(theme.id).toBe('harbor');
    expect(theme.layout.radius).toBe('pill');
    expect(theme.colors.light.accent).toBe('#123456');
    expect(theme.colors.dark.accent).not.toBe('#123456');
  });

  it('exports deterministic canonical JSON', () => {
    const template = themeTemplateFromConfig({ typography: { bodyFont: 'Geist' }, theme: { preset: 'signal' } });
    const first = canonicalThemeTemplateJson(template);
    const second = canonicalThemeTemplateJson(JSON.parse(first));
    expect(second).toBe(first);
    expect(first.endsWith('\n')).toBe(true);
  });

  it('merges or replaces only theme-owned fields and previews exact changes', () => {
    const current = { seo: { title: 'Keep me' }, styling: { theme: 'dark', primaryColor: '#112233' }, theme: { preset: 'harbor' } };
    const incoming = { styling: { theme: 'light' as const }, theme: { preset: 'signal' as const } };
    const merged = applyThemeTemplateConfig(current, incoming, 'merge');
    const replaced = applyThemeTemplateConfig(current, incoming, 'replace');
    expect(merged).toMatchObject({ seo: { title: 'Keep me' }, styling: { theme: 'light', primaryColor: '#112233' } });
    expect(replaced).toEqual({ seo: { title: 'Keep me' }, ...incoming });
    expect(previewThemeConfigChanges(current, merged).map((change) => change.path)).toEqual(['styling.theme', 'theme.preset']);
    const rollbackTemplate = themeTemplateFromConfig(current);
    const rolledBack = applyThemeTemplateConfig(merged, rollbackTemplate.config, 'replace');
    expect(rolledBack.seo).toEqual(current.seo);
    expect(themeOwnedConfig(rolledBack)).toEqual(rollbackTemplate.config);
  });

  it('rejects oversized, deeply nested, and prototype-pollution payloads before parsing', () => {
    expect(inspectThemeTemplateInput({ value: 'x'.repeat(129 * 1024) })).toMatchObject({ ok: false });
    let nested: Record<string, unknown> = {};
    for (let index = 0; index < 14; index += 1) nested = { child: nested };
    expect(inspectThemeTemplateInput(nested)).toMatchObject({ ok: false });
    expect(inspectThemeTemplateInput(JSON.parse('{"kind":"cms-theme","__proto__":{"polluted":true}}'))).toEqual({
      ok: false,
      message: 'Theme template contains the unsafe key "__proto__".',
    });
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('shares strict CSS interpolation sanitizers across renderers', () => {
    expect(safeThemeHex('#AABBCC', '#000000')).toBe('#aabbcc');
    expect(safeThemeHex('#AbC', '#000000')).toBe('#aabbcc');
    expect(safeThemeHex('red;}body{display:none', '#000000')).toBe('#000000');
    expect(resolveTheme({ theme: { colors: { light: { accent: '#AbC' } } } }).colors.light).toMatchObject({
      accent: '#aabbcc',
      focus: '#aabbcc',
    });
    expect(safeThemeFontFamily(' نسق عربي ')).toBe('نسق عربي');
    expect(safeThemeFontFamily("Inter';}body{display:none}/*")).toBeUndefined();
  });

  it('resolves explicit docsLayout or falls back according to shell', () => {
    expect(resolveDocsLayout({ docsLayout: 'glass' })).toBe('glass');
    expect(resolveDocsLayout({ docsLayout: 'notebook' })).toBe('notebook');
    expect(resolveDocsLayout({ docsLayout: 'flux' })).toBe('flux');
    expect(resolveDocsLayout({ docsLayout: 'spacious' })).toBe('spacious');
    expect(resolveDocsLayout({ docsLayout: 'docs' })).toBe('docs');
    expect(resolveDocsLayout({ shell: 'editorial' })).toBe('notebook');
    expect(resolveDocsLayout({ shell: 'console' })).toBe('flux');
    expect(resolveDocsLayout({ shell: 'reference' })).toBe('docs');
    expect(resolveDocsLayout('glass')).toBe('glass');
    expect(resolveDocsLayout('spacious')).toBe('spacious');
    expect(resolveDocsLayout(undefined)).toBe('docs');
  });

  it('resolves pageWidth and contentWidth separately with full fallback support', () => {
    const customized = resolveTheme({ theme: { layout: { contentWidth: 'focused', pageWidth: 'wide' } } });
    expect(customized.layout.contentWidth).toBe('focused');
    expect(customized.layout.pageWidth).toBe('wide');

    const fullLayout = resolveTheme({ theme: { layout: { contentWidth: 'full', pageWidth: 'full' } } });
    expect(fullLayout.layout.contentWidth).toBe('full');
    expect(fullLayout.layout.pageWidth).toBe('full');

    const defaultLayout = resolveTheme({});
    expect(defaultLayout.layout.contentWidth).toBe('balanced');
    expect(defaultLayout.layout.pageWidth).toBe('balanced');
  });
});
