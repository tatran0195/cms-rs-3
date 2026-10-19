import { Button } from '@cms/design-system/components/ui/button';
import { Textarea } from '@cms/design-system/components/ui/textarea';
import { cn } from '@cms/design-system/lib/utils';
import { useT } from '@cms/i18n/react';
import type { Project, ProjectThemeImportResult } from '@cms/sdk';
import { useExportProjectTheme, useImportProjectTheme } from '@cms/sdk/react';
import { type cmsThemeConfig, MAX_THEME_TEMPLATE_BYTES, THEME_PRESET_IDS, THEME_PRESETS, type ThemePresetId } from '@cms/shared/themes';
import { ChevronDown, Download, FileJson, Sparkles, Upload } from 'lucide-react';
import { type ChangeEvent, useRef, useState } from 'react';
import { toast } from 'sonner';

export interface ThemePresetsAndExchangeProps {
  project: Project;
  activePreset: ThemePresetId;
  onSelectPreset: (presetId: ThemePresetId) => void;
  onApplyTheme: (theme: cmsThemeConfig, appearance?: 'light' | 'dark' | 'system') => void;
  className?: string;
}

function PresetThumbnail({ presetId }: { presetId: ThemePresetId }) {
  const colors = THEME_PRESETS[presetId].colors.light;
  if (presetId === 'manuscript') {
    return (
      <span
        className="mb-2.5 flex h-14 flex-col overflow-hidden rounded-lg border border-border/80 p-1"
        style={{ background: colors.muted }}
        aria-hidden
      >
        <span className="mx-auto mt-1 h-1.5 w-12 rounded-full" style={{ background: colors.accent }} />
        <span className="mx-2 mt-1.5 h-1.5 border-y" style={{ borderColor: colors.border, background: colors.canvas }} />
        <span
          className="mx-auto mt-1 flex h-6 w-2/3 flex-col gap-0.5 border px-1 py-1 shadow-2xs"
          style={{ borderColor: colors.border, background: colors.canvas }}
        >
          <span className="h-0.5 w-1/2 rounded-full" style={{ background: colors.foreground }} />
          <span className="h-0.5 w-full rounded-full" style={{ background: colors.border }} />
        </span>
      </span>
    );
  }
  if (presetId === 'signal') {
    return (
      <span
        className="mb-2.5 grid h-14 grid-cols-[28%_1fr] grid-rows-[10px_1fr] gap-px overflow-hidden rounded-lg border border-border/80 p-1"
        style={{ background: colors.code }}
        aria-hidden
      >
        <span className="col-span-2 flex items-center gap-1 border px-1" style={{ borderColor: colors.border, background: colors.surface }}>
          <span className="size-1 rounded-full" style={{ background: colors.accent }} />
          <span className="h-0.5 w-8 rounded-full" style={{ background: colors.mutedForeground }} />
        </span>
        <span className="flex flex-col gap-0.5 border p-0.5" style={{ borderColor: colors.border, background: colors.code }}>
          <span className="h-0.5 w-full" style={{ background: colors.accent }} />
          <span className="h-0.5 w-2/3" style={{ background: colors.mutedForeground }} />
        </span>
        <span className="flex flex-col gap-0.5 border p-1" style={{ borderColor: colors.border, background: colors.canvas }}>
          <span className="h-1 w-1/2" style={{ background: colors.foreground }} />
          <span className="h-0.5 w-full" style={{ background: colors.border }} />
        </span>
      </span>
    );
  }
  return (
    <span className="mb-2.5 grid h-14 grid-cols-[25%_1fr_16%] grid-rows-[10px_1fr] overflow-hidden rounded-lg border border-border/80" aria-hidden>
      <span className="col-span-3 border-b flex items-center px-1" style={{ borderColor: colors.border, background: colors.canvas }}>
        <span className="block h-1 w-8 rounded-full" style={{ background: colors.accent }} />
      </span>
      <span className="border-e" style={{ borderColor: colors.border, background: colors.muted }} />
      <span className="flex flex-col gap-0.5 p-1" style={{ background: colors.canvas }}>
        <span className="h-1 w-1/2 rounded-full" style={{ background: colors.foreground }} />
        <span className="h-0.5 w-full rounded-full" style={{ background: colors.border }} />
      </span>
      <span className="border-s" style={{ borderColor: colors.border, background: colors.surface }} />
    </span>
  );
}

const downloadText = (fileName: string, contents: string) => {
  const href = URL.createObjectURL(new Blob([contents], { type: 'application/json;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(href);
};

export function ThemePresetsAndExchange({ project, activePreset, onSelectPreset, onApplyTheme, className }: ThemePresetsAndExchangeProps) {
  const t = useT();
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [importText, setImportText] = useState('');
  const [importTemplate, setImportTemplate] = useState<unknown>();
  const [importPreview, setImportPreview] = useState<ProjectThemeImportResult>();
  const fileInput = useRef<HTMLInputElement>(null);

  const exportProjectTheme = useExportProjectTheme(project.id);
  const importProjectTheme = useImportProjectTheme(project.id);

  const handleExport = () => {
    exportProjectTheme.mutate(undefined, {
      onSuccess: ({ json }) => {
        downloadText(`${project.slug || 'cms'}-theme.json`, json);
        toast.success(t('settings.theme.exported'));
      },
      onError: () => toast.error(t('settings.theme.exportError')),
    });
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportText('');
    setImportTemplate(undefined);
    setImportPreview(undefined);
    if (file.size > MAX_THEME_TEMPLATE_BYTES) {
      toast.error(t('settings.theme.import.tooLarge'));
      return;
    }
    const text = await file.text();
    setImportText(text);
    try {
      setImportTemplate(JSON.parse(text) as unknown);
    } catch {
      toast.error(t('settings.theme.import.invalidJson'));
    }
  };

  const parseImportText = () => {
    if (new TextEncoder().encode(importText).byteLength > MAX_THEME_TEMPLATE_BYTES) {
      toast.error(t('settings.theme.import.tooLarge'));
      return;
    }
    try {
      const template = JSON.parse(importText) as unknown;
      setImportTemplate(template);
      setImportPreview(undefined);
      importProjectTheme.mutate(
        { template, mode: importMode, apply: false },
        {
          onSuccess: (result) => setImportPreview(result),
          onError: (err) => toast.error(err instanceof Error ? err.message : t('settings.theme.import.previewError')),
        },
      );
    } catch {
      toast.error(t('settings.theme.import.invalidJson'));
    }
  };

  const applyImport = () => {
    if (!importTemplate) return;
    importProjectTheme.mutate(
      { template: importTemplate, mode: importMode, apply: true },
      {
        onSuccess: (result) => {
          setImportPreview(result);
          onApplyTheme(result.template.config.theme ?? {}, result.template.config.styling?.theme);
          toast.success(t('settings.theme.import.applied'));
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : t('settings.theme.import.applyError')),
      },
    );
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Presets Gallery Card */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="size-4 text-primary" />
          <h3 className="font-semibold text-sm">{t('settings.theme.gallery')}</h3>
          <span className="text-xs text-muted-foreground ms-auto">{t('settings.theme.galleryHint')}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {THEME_PRESET_IDS.map((id) => {
            const active = activePreset === id;
            return (
              <button
                key={id}
                type="button"
                data-preset-id={id}
                aria-pressed={active}
                onClick={() => onSelectPreset(id)}
                className={cn(
                  'cursor-pointer rounded-xl border p-3 text-start outline-none transition focus-visible:ring-2 focus-visible:ring-ring/50 shadow-2xs',
                  active ? 'border-primary bg-primary/5 ring-1 ring-primary/40' : 'border-border hover:border-primary/40 bg-background/50',
                )}
              >
                <PresetThumbnail presetId={id} />
                <span className="block font-semibold text-xs text-foreground">{t(`settings.theme.preset.${id}.name`)}</span>
                <span className="mt-1 block text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                  {t(`settings.theme.preset.${id}.description`)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Collapsible JSON Theme Exchange */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-2xs">
        <button
          type="button"
          onClick={() => setExchangeOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-start text-xs font-semibold text-foreground hover:bg-muted/30 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <FileJson className="size-4 text-primary" />
            <span>{t('settings.theme.exchange')}</span>
            <span className="font-normal text-muted-foreground">— Export or import theme JSON templates</span>
          </div>
          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform duration-200', exchangeOpen && 'rotate-180')} />
        </button>

        {exchangeOpen && (
          <div className="border-t border-border/70 p-4 space-y-4 bg-muted/10">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-card p-3">
                <h4 className="font-semibold text-xs text-foreground">{t('settings.theme.exportTitle')}</h4>
                <p className="mt-1 text-[11.5px] text-muted-foreground">{t('settings.theme.exportHint')}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 cursor-pointer"
                  disabled={exportProjectTheme.isPending}
                  onClick={handleExport}
                  type="button"
                >
                  <Download className="size-3.5" />
                  <span>{t('settings.theme.export')}</span>
                </Button>
              </div>

              <div className="rounded-lg border border-border bg-card p-3">
                <h4 className="font-semibold text-xs text-foreground">{t('settings.theme.importTitle')}</h4>
                <p className="mt-1 text-[11.5px] text-muted-foreground">{t('settings.theme.importHint')}</p>
                <input ref={fileInput} type="file" accept="application/json,.json" className="sr-only" onChange={handleFile} />
                <Button size="sm" variant="outline" className="mt-3 cursor-pointer" onClick={() => fileInput.current?.click()} type="button">
                  <Upload className="size-3.5" />
                  <span>{t('settings.theme.chooseFile')}</span>
                </Button>
              </div>
            </div>

            <Textarea
              value={importText}
              onChange={(e) => {
                setImportText(e.target.value);
                setImportTemplate(undefined);
                setImportPreview(undefined);
              }}
              placeholder={t('settings.theme.importPlaceholder')}
              className="font-mono text-xs min-h-[90px]"
            />

            <div className="flex items-center gap-2">
              <div className="flex rounded-md border border-border bg-background p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setImportMode('merge')}
                  className={cn(
                    'px-2 py-0.5 rounded cursor-pointer transition-colors',
                    importMode === 'merge' ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t('settings.theme.merge')}
                </button>
                <button
                  type="button"
                  onClick={() => setImportMode('replace')}
                  className={cn(
                    'px-2 py-0.5 rounded cursor-pointer transition-colors',
                    importMode === 'replace' ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t('settings.theme.replace')}
                </button>
              </div>

              <Button
                size="sm"
                variant="outline"
                disabled={!importText.trim() || importProjectTheme.isPending}
                onClick={parseImportText}
                type="button"
              >
                {t('settings.theme.previewImport')}
              </Button>

              {importPreview && (
                <Button size="sm" disabled={importProjectTheme.isPending} onClick={applyImport} type="button">
                  {t('settings.theme.applyImport')}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
