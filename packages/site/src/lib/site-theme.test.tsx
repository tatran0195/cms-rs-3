import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  DocumentationPageLayout,
  DocumentationProjectPreviewLayout,
  DocumentationReaderLayout,
  DocumentationStudioPreviewLayout,
  DocumentationThemeProvider,
} from '../components/documentation-theme-provider';
import { projectThemeCss, projectThemeVariables, resolveProjectTheme, siteThemeNoFlashScript } from './site-theme';

describe('published theme projection', () => {
  it('projects a preset and semantic overrides onto the stable CSS interface', () => {
    const config = {
      theme: {
        preset: 'signal' as const,
        colors: { light: { surface: '#fefefe' } },
      },
      styling: { primaryColor: '#3300aa' },
      typography: { bodyFont: 'Inter', codeFont: 'Geist Mono' },
    };
    const theme = resolveProjectTheme(config);
    const variables = projectThemeVariables(config, 'light') as Record<string, string>;
    expect(theme.id).toBe('signal');
    expect(variables['--theme-surface']).toBe('#fefefe');
    expect(variables['--primary']).toBe(theme.colors.light.accent);
    expect(projectThemeCss(config)).toContain("font-family:'Geist Mono'");
  });

  it('does not interpolate an unsafe font into CSS', () => {
    const css = projectThemeCss({
      typography: { headingFont: "Inter';}body{display:none}/*" },
    });
    expect(css).not.toContain('display:none');
  });

  it('JSON-encodes the per-site before-paint appearance bootstrap', () => {
    const projectId = 'project";</script><script>alert(1)</script>\u2028';
    const script = siteThemeNoFlashScript(projectId, 'system');
    expect(script).toContain('localStorage.getItem(k)');
    expect(script).toContain("classList.remove('light','dark')");
    expect(script).toContain('classList.add(r)');
    expect(script).toContain('\\u003c/script\\u003e\\u003cscript\\u003ealert(1)');
    expect(script).not.toContain('</script>');
    expect(script).not.toContain('\u2028');
    expect(script).toContain('\\u2028');
    expect(script).not.toContain(`+"${projectId}"`);
  });

  it('accepts bounded Unicode family names', () => {
    const css = projectThemeCss({ typography: { headingFont: 'גופן עברי' } });
    expect(css).toContain("font-family:'גופן עברי','Segoe UI'");
  });

  it('keeps pre-v1 projects on their existing design-system palette', () => {
    const css = projectThemeCss({ styling: { primaryColor: '#c2410c' } });
    expect(css).toContain('--theme-canvas:var(--background)');
    expect(css).toContain('--primary:#c2410c');
    expect(css).not.toContain('--background:#f8fafc');
  });

  it.each(['harbor', 'manuscript', 'signal'] as const)('renders the %s preset without altering system layout defaults', (preset) => {
    const theme = resolveProjectTheme({ theme: { preset } });
    const markup = renderToStaticMarkup(
      <DocumentationThemeProvider className="flex" context="reader" direction="ltr" theme={theme}>
        <DocumentationReaderLayout
          banner={<div>banner</div>}
          content={<main>article</main>}
          footer={<footer>footer</footer>}
          header={<header>header</header>}
          navigation={<nav>navigation</nav>}
          overlays={<div>search</div>}
        />
        <DocumentationPageLayout article={<article>page</article>} tableOfContents={<nav>outline</nav>} />
        <DocumentationProjectPreviewLayout
          content={<main>project content</main>}
          mobileNavigation={<nav>mobile</nav>}
          navigation={<nav>project navigation</nav>}
        />
        <DocumentationStudioPreviewLayout
          content={<main>studio content</main>}
          header={<header>studio header</header>}
          navigation={<nav>studio navigation</nav>}
        />
      </DocumentationThemeProvider>,
    );

    // Preset only changes colors and components; layout remains default docs layout
    expect(theme.id).toBe(preset);
    expect(theme.layout.docsLayout).toBe('docs');
    expect(theme.layout.shell).toBe('reference');
    expect(markup).toContain(`data-theme-id="${preset}"`);
    expect(markup).toContain('data-documentation-layout="docs"');
    expect(markup).toContain('data-documentation-template="docs"');
    expect(markup).toContain('data-documentation-layout="docs-preview"');
    expect(markup).toContain('data-documentation-layout="docs-studio"');
  });

  it('allows customizing docsLayout independently of the color preset', () => {
    const theme = resolveProjectTheme({
      theme: { preset: 'manuscript', layout: { docsLayout: 'flux' } },
    });
    const markup = renderToStaticMarkup(
      <DocumentationThemeProvider context="reader" direction="rtl" theme={theme}>
        <DocumentationReaderLayout content={<main />} header={<header />} navigation={<nav />} />
      </DocumentationThemeProvider>,
    );

    expect(theme.id).toBe('manuscript');
    expect(markup).toContain('data-theme-id="manuscript"');
    expect(markup).toContain('data-documentation-layout="flux"');
    expect(markup).toContain('data-documentation-template="flux"');
    expect(markup).toContain('dir="rtl"');
  });
});
