// @vitest-environment jsdom

import type { Project } from '@cms/sdk';
import { THEME_PRESETS } from '@cms/shared/themes';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeSection } from './theme-section';

const translations: Record<string, string> = {
  'settings.theme.title': 'Theme',
  'settings.theme.draftTitle': 'Theme Draft',
  'settings.theme.draftHint': 'Changes are applied in preview before saving.',
  'settings.theme.layout.docs.name': 'Docs Layout',
  'settings.theme.layout.glass.name': 'Glass Layout',
  'settings.theme.layout.notebook.name': 'Notebook Layout',
  'settings.theme.layout.flux.name': 'Flux Layout',
  'settings.theme.layout.spacious.name': 'Spacious Layout',
  'settings.theme.gallery': 'Preset Gallery',
  'settings.theme.galleryHint': 'Quick baseline themes',
  'settings.theme.preset.harbor.name': 'Harbor',
  'settings.theme.preset.harbor.description': 'Clean harbor theme',
  'settings.theme.preset.manuscript.name': 'Manuscript',
  'settings.theme.preset.manuscript.description': 'Warm editorial theme',
  'settings.theme.preset.signal.name': 'Signal',
  'settings.theme.preset.signal.description': 'High contrast tech theme',
  'settings.theme.exchange': 'Theme Exchange',
  'common.save': 'Save Changes',
  'common.saving': 'Saving...',
  'settings.theme.undo': 'Undo',
  'settings.theme.reset': 'Reset',
  'common.cancel': 'Cancel',
};

const mutation = { isPending: false, mutate: vi.fn() };

vi.mock('@cms/i18n/react', () => ({
  useT: () => (key: string) => translations[key] ?? key,
  translateFn: (key: string) => translations[key] ?? key,
}));

vi.mock('@cms/sdk/react', () => ({
  useUpdateProjectConfig: () => mutation,
  useImportProjectTheme: () => mutation,
  useExportProjectTheme: () => mutation,
}));

vi.mock('@cms/site', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cms/site')>();
  return {
    ...actual,
    projectThemeVariables: () => ({}),
    projectThemeStyle: () => ({}),
    DocumentationThemeProvider: ({
      children,
      theme,
      direction,
    }: {
      children: ReactNode;
      theme: { id: string; layout: { shell: string; docsLayout?: string } };
      direction: string;
    }) => (
      <div data-docs-layout={theme.layout.docsLayout} data-preset={theme.id} data-shell={theme.layout.shell} data-testid="preview" dir={direction}>
        {children}
      </div>
    ),
    DocumentationStudioPreviewLayout: ({ header, navigation, content }: Record<'header' | 'navigation' | 'content', ReactNode>) => (
      <div>
        {header}
        {navigation}
        {content}
      </div>
    ),
  };
});

const project: Project = {
  id: 'project-a',
  name: 'Docs',
  slug: 'docs',
  description: null,
  icon: null,
  config: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const preview = () => document.querySelector<HTMLElement>('[data-testid="preview"]');

describe('ThemeSection with Fumadocs Story & Props Table', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.getAnimations = Element.prototype.getAnimations || (() => []);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(<ThemeSection project={project} />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.replaceChildren();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the Fumadocs Story preview and root Props Table rows', () => {
    // Props navigation root is rendered
    expect(container.textContent).toContain('Props');
    expect(container.textContent).toContain('nav');
    expect(container.textContent).toContain('themeSwitch');
    expect(container.textContent).toContain('searchToggle');
    expect(container.textContent).toContain('sidebar');
    expect(container.textContent).toContain('palette');
    expect(container.textContent).toContain('layout');
    expect(container.textContent).toContain('components');

    // macOS window frame controls
    expect(container.querySelector('[data-window-control="close"]')).toBeDefined();
    expect(container.querySelector('[data-window-control="minimize"]')).toBeDefined();
    expect(container.querySelector('[data-window-control="maximize"]')).toBeDefined();
  });

  it('switches docs layout via story header layout selector', async () => {
    const trigger = container.querySelector<HTMLButtonElement>('[data-slot="select-trigger"][aria-label="Select Docs Layout"]');
    if (!trigger) throw new Error('missing layout select trigger');

    await act(async () => {
      trigger.click();
    });

    const item =
      document.querySelector<HTMLElement>('[data-slot="select-item"][data-value="glass"]') ??
      [...document.querySelectorAll<HTMLElement>('[data-slot="select-item"]')].find((el) => el.textContent?.toLowerCase().includes('glass'));
    if (!item) throw new Error('missing glass select item');

    await act(async () => {
      item.click();
    });

    expect(preview()?.dataset.docsLayout).toBe('glass');
  });

  it('navigates into nested props and toggles values', async () => {
    const sidebarRow = container.querySelector<HTMLButtonElement>('button[data-prop-id="sidebar"]');
    if (!sidebarRow) throw new Error('missing sidebar prop button');

    await act(async () => sidebarRow.click());

    // Should now show breadcrumb and collapsible field
    expect(container.textContent).toContain('collapsible');

    // Toggle collapsible to false
    const falseBtn = [...container.querySelectorAll<HTMLButtonElement>('button')].find((btn) => btn.textContent === 'false');
    expect(falseBtn).toBeDefined();

    await act(async () => falseBtn?.click());
    expect(falseBtn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('switches baseline preset and updates preview', async () => {
    const signalBtn = container.querySelector<HTMLButtonElement>('button[data-preset-id="signal"]');
    if (!signalBtn) throw new Error('missing signal preset button');

    await act(async () => signalBtn.click());

    expect(preview()?.dataset.preset).toBe('signal');
    expect(preview()?.dataset.shell).toBe(THEME_PRESETS.signal.layout.shell);
  });

  it('saves the updated theme draft when save is clicked', async () => {
    const trigger = container.querySelector<HTMLButtonElement>('[data-slot="select-trigger"][aria-label="Select Docs Layout"]');
    if (!trigger) throw new Error('missing layout select trigger');

    await act(async () => {
      trigger.click();
    });

    const item =
      document.querySelector<HTMLElement>('[data-slot="select-item"][data-value="notebook"]') ??
      [...document.querySelectorAll<HTMLElement>('[data-slot="select-item"]')].find((el) => el.textContent?.toLowerCase().includes('notebook'));
    if (!item) throw new Error('missing notebook select item');

    await act(async () => {
      item.click();
    });

    const submitBtn = container.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (!submitBtn) throw new Error('missing submit button');
    expect(submitBtn.disabled).toBe(false);

    await act(async () => submitBtn.click());

    expect(mutation.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          theme: expect.objectContaining({
            layout: expect.objectContaining({
              docsLayout: 'notebook',
            }),
          }),
        }),
      }),
      expect.anything(),
    );
  });
});
