import { Button } from '@cms/design-system/components/ui/button';
import { useT } from '@cms/i18n/react';
import type { Project } from '@cms/sdk';
import { useUpdateProjectConfig } from '@cms/sdk/react';
import {
  type cmsThemeConfig,
  resolveTheme,
  THEME_PRESETS,
  THEME_SCHEMA_VERSION,
  type ThemeOwnedProjectConfig,
  type ThemePresetId,
  themeContrastIssues,
} from '@cms/shared/themes';
import { DocumentationStudioPreviewLayout, DocumentationThemeProvider, projectThemeStyle, projectThemeVariables } from '@cms/site';
import type { ProjectConfig } from '@cms/validators';
import { LayoutTemplate, RotateCcw, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { SaveBar, SectionHeader } from './shared';
import { DEFAULT_FUMADOCS_LAYOUT_OPTIONS, type FumadocsLayoutOptions, ThemeFumadocsStory, ThemePresetsAndExchange } from './theme';

type Appearance = 'light' | 'dark' | 'system';
type PreviewMode = 'light' | 'dark';

interface ThemeDraft {
  theme: cmsThemeConfig;
  appearance: Appearance;
}

const fullPresetTheme = (preset: ThemePresetId): cmsThemeConfig => {
  const definition = THEME_PRESETS[preset];
  return {
    version: THEME_SCHEMA_VERSION,
    preset,
    metadata: definition.metadata,
    colors: {
      light: { ...definition.colors.light },
      dark: { ...definition.colors.dark },
    },
    layout: { ...definition.layout },
    components: { ...definition.components },
  };
};

const initialDraft = (project: Project): ThemeDraft => {
  const resolved = resolveTheme(project.config as ThemeOwnedProjectConfig | null);
  return {
    theme: project.config?.theme
      ? {
          ...project.config.theme,
          layout: {
            ...resolved.layout,
            ...(project.config.theme.layout ?? {}),
          },
        }
      : {
          version: THEME_SCHEMA_VERSION,
          preset: resolved.id,
          metadata: resolved.metadata,
          layout: resolved.layout,
        },
    appearance: project.config?.styling?.theme ?? 'light',
  };
};

export function ThemePreview({ config, mode, rtl }: { config: ProjectConfig; mode: PreviewMode; rtl?: boolean }) {
  const theme = resolveTheme(config as ThemeOwnedProjectConfig);
  return (
    <DocumentationThemeProvider
      appearance={mode}
      className="overflow-hidden rounded-xl border border-border text-sm shadow-sm"
      context="studio-preview"
      direction={rtl ? 'rtl' : 'ltr'}
      style={{
        ...projectThemeVariables(config, mode),
        ...projectThemeStyle(config),
      }}
      theme={theme}
    >
      <DocumentationStudioPreviewLayout
        header={
          <div className="border-border border-b bg-card" data-theme-region="header-shell">
            <div className="flex items-center gap-2 px-3 py-2.5" data-theme-region="header">
              <span className="grid size-6 place-items-center rounded-md bg-primary font-semibold text-primary-foreground">N</span>
              <span className="font-semibold">Product Docs</span>
            </div>
          </div>
        }
        navigation={
          <nav aria-label="Documentation navigation">
            <p className="mb-2 px-2 font-semibold">Start</p>
            <button className="mb-1 block w-full rounded-md bg-primary/10 px-2 py-1.5 text-start font-medium text-primary" type="button">
              Overview
            </button>
          </nav>
        }
        content={
          <article className="min-w-0 p-5" data-theme-region="article" id="preview-content">
            <h3 className="font-semibold text-xl">Theme Preview</h3>
            <p className="mt-2 text-muted-foreground leading-relaxed">Live documentation preview rendered with current project variables.</p>
          </article>
        }
      />
    </DocumentationThemeProvider>
  );
}

export function ThemeSection({ project }: { project: Project }) {
  const t = useT();
  const updateConfig = useUpdateProjectConfig(project.id);
  const saved = useMemo(() => initialDraft(project), [project]);
  const [draft, setDraft] = useState<ThemeDraft>(saved);
  const [history, setHistory] = useState<ThemeDraft[]>([]);
  const [layoutOptions, setLayoutOptions] = useState<FumadocsLayoutOptions>(DEFAULT_FUMADOCS_LAYOUT_OPTIONS);

  const change = (next: ThemeDraft | ((current: ThemeDraft) => ThemeDraft)) => {
    setHistory((items) => [...items.slice(-19), draft]);
    setDraft(typeof next === 'function' ? next(draft) : next);
  };

  const config = {
    ...(project.config ?? {}),
    theme: draft.theme,
    styling: { ...(project.config?.styling ?? {}), theme: draft.appearance },
  } satisfies ProjectConfig;

  const resolved = resolveTheme(config as ThemeOwnedProjectConfig);
  const contrastIssues = themeContrastIssues(resolved);
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(saved);

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (contrastIssues.length > 0) {
      toast.error(t('settings.theme.contrastBlocked'));
      return;
    }
    updateConfig.mutate(
      {
        config: {
          ...(project.config ?? {}),
          theme: draft.theme,
          styling: {
            ...(project.config?.styling ?? {}),
            theme: draft.appearance,
          },
        },
      },
      {
        onSuccess: () => {
          setHistory([]);
          toast.success(t('settings.theme.savedDraft'));
        },
        onError: () => toast.error(t('settings.saveError')),
      },
    );
  };

  return (
    <form onSubmit={save} className="space-y-6">
      <SectionHeader icon={<LayoutTemplate className="size-4" />} title={t('settings.theme.title')} />

      {/* Draft Hint Banner */}
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm">
        <strong>{t('settings.theme.draftTitle')}</strong>
        <p className="mt-1 text-muted-foreground">{t('settings.theme.draftHint')}</p>
      </div>

      {/* Main Fumadocs Story Preview & Interactive Props Table */}
      <ThemeFumadocsStory
        config={config}
        themeConfig={draft.theme}
        onThemeConfigChange={(next) =>
          change((curr) => ({
            ...curr,
            theme: typeof next === 'function' ? next(curr.theme) : next,
          }))
        }
        resolvedTheme={resolved}
        resolvedColors={resolved.colors}
        resolvedLayout={resolved.layout}
        resolvedComponents={resolved.components}
        appearance={draft.appearance}
        onAppearanceChange={(appearance) =>
          change((curr) => ({
            ...curr,
            appearance,
          }))
        }
        layoutOptions={layoutOptions}
        onLayoutOptionsChange={setLayoutOptions}
        onReset={() => {
          change({
            theme: fullPresetTheme(resolved.id),
            appearance: draft.appearance,
          });
          setLayoutOptions(DEFAULT_FUMADOCS_LAYOUT_OPTIONS);
        }}
      />

      {/* Contrast Warning if any */}
      {contrastIssues.length > 0 && (
        <div className="rounded-lg border border-destructive/35 bg-destructive/8 p-3 text-destructive text-xs" role="alert">
          <strong>{t('settings.theme.contrastTitle')}</strong>
          <ul className="mt-1 list-disc ps-5">
            {contrastIssues.map((issue) => (
              <li key={`${issue.mode}-${issue.pair}`}>
                <span dir="ltr">{`${issue.mode}: ${issue.pair} ${issue.ratio.toFixed(2)}:1 < ${issue.required}:1`}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-border border-y py-4">
        <Button disabled={!hasChanges || updateConfig.isPending || contrastIssues.length > 0} type="submit">
          {updateConfig.isPending ? t('common.saving') : t('common.save')}
        </Button>
        <Button
          disabled={history.length === 0}
          onClick={() => {
            const previous = history.at(-1);
            if (previous) {
              setDraft(previous);
              setHistory((items) => items.slice(0, -1));
            }
          }}
          type="button"
          variant="outline"
        >
          <Undo2 className="size-4" /> {t('settings.theme.undo')}
        </Button>
        <Button
          disabled={!hasChanges}
          onClick={() => {
            setDraft(saved);
            setHistory([]);
            setLayoutOptions(DEFAULT_FUMADOCS_LAYOUT_OPTIONS);
          }}
          type="button"
          variant="outline"
        >
          {t('common.cancel')}
        </Button>
        <Button
          onClick={() => {
            change({
              theme: fullPresetTheme(resolved.id),
              appearance: draft.appearance,
            });
            setLayoutOptions(DEFAULT_FUMADOCS_LAYOUT_OPTIONS);
          }}
          type="button"
          variant="outline"
        >
          <RotateCcw className="size-4" /> {t('settings.theme.reset')}
        </Button>
      </div>

      {/* Secondary Presets Gallery & JSON Theme Exchange */}
      <ThemePresetsAndExchange
        project={project}
        activePreset={resolved.id}
        onSelectPreset={(presetId) =>
          change((curr) => ({
            ...curr,
            theme: {
              ...fullPresetTheme(presetId),
              layout: {
                ...fullPresetTheme(presetId).layout,
                ...(curr.theme.layout?.docsLayout ? { docsLayout: curr.theme.layout.docsLayout } : {}),
              },
            },
            appearance: curr.appearance,
          }))
        }
        onApplyTheme={(importedTheme, importedAppearance) => {
          change({
            theme: importedTheme,
            appearance: importedAppearance ?? draft.appearance,
          });
          setHistory([]);
        }}
      />

      <SaveBar disabled={!hasChanges || contrastIssues.length > 0} isSubmitting={updateConfig.isPending} />
    </form>
  );
}
