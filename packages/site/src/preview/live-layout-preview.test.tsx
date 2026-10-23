/** @vitest-environment jsdom */

import { resolveTheme } from '@cms/shared/themes';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentationThemeProvider } from '../components/documentation-theme-provider';
import { LiveDocsLayoutPreview } from './live-layout-preview';

describe('LiveDocsLayoutPreview', () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    const activeRoot = root;
    if (activeRoot) {
      act(() => activeRoot.unmount());
    }
    container?.remove();
    container = null;
    root = null;
  });

  const theme = resolveTheme({} as any);

  it.each(['notebook', 'glass', 'flux', 'spacious', 'docs'] as const)('renders real layout for %s without error', (layoutId) => {
    act(() => {
      root!.render(
        <DocumentationThemeProvider theme={theme} context="studio-preview" direction="ltr">
          <LiveDocsLayoutPreview layoutId={layoutId} activePath="" onNavigate={vi.fn()} theme={theme} />
        </DocumentationThemeProvider>,
      );
    });

    expect(container?.textContent).toContain('Docs Preview');
    expect(container?.textContent).toContain('Overview');
  });

  it('renders interactive tabs content when activePath is components/tabs', () => {
    act(() => {
      root!.render(
        <DocumentationThemeProvider theme={theme} context="studio-preview" direction="ltr">
          <LiveDocsLayoutPreview layoutId="notebook" activePath="components/tabs" onNavigate={vi.fn()} theme={theme} />
        </DocumentationThemeProvider>,
      );
    });

    expect(container?.textContent).toContain('Tabs Component');
    expect(container?.textContent).toContain('TypeScript');
  });
});
