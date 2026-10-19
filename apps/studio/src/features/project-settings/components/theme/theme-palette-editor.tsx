import { cn } from '@cms/design-system/lib/utils';
import { THEME_COLOR_KEYS, type ThemeColorKey, type ThemeColorTokens, themeContrastIssues } from '@cms/shared/themes';
import { AlertCircle, Moon, Sun } from 'lucide-react';
import { useState } from 'react';

export interface ThemePaletteEditorProps {
  colors: {
    light: ThemeColorTokens;
    dark: ThemeColorTokens;
  };
  mode?: 'light' | 'dark';
  onModeChange?: (mode: 'light' | 'dark') => void;
  onColorChange: (mode: 'light' | 'dark', key: ThemeColorKey, value: string) => void;
  className?: string;
}

export function ThemePaletteEditor({ colors, mode: controlledMode, onModeChange, onColorChange, className }: ThemePaletteEditorProps) {
  const [internalMode, setInternalMode] = useState<'light' | 'dark'>('light');
  const activeMode = controlledMode ?? internalMode;

  const setMode = (next: 'light' | 'dark') => {
    if (onModeChange) onModeChange(next);
    else setInternalMode(next);
  };

  const currentTokens = colors[activeMode];
  const contrastIssues = themeContrastIssues({
    id: 'custom' as never,
    metadata: { name: 'Custom', description: '' },
    colors,
    layout: {} as never,
    components: {} as never,
  }).filter((issue) => issue.mode === activeMode);

  return (
    <div className={cn('flex flex-col text-[0.8125rem]', className)}>
      {/* Mode Switcher Header */}
      <div className="flex h-10 items-center justify-between border-b border-border/70 px-4 bg-muted/20">
        <span className="font-mono text-xs text-muted-foreground">Mode</span>
        <div className="flex items-center gap-1 rounded-md border border-border/60 bg-background/80 p-0.5">
          <button
            type="button"
            aria-pressed={activeMode === 'light'}
            onClick={() => setMode('light')}
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-mono transition-colors cursor-pointer',
              activeMode === 'light' ? 'bg-primary text-primary-foreground font-medium shadow-2xs' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Sun className="size-3" />
            <span>Light</span>
          </button>
          <button
            type="button"
            aria-pressed={activeMode === 'dark'}
            onClick={() => setMode('dark')}
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-mono transition-colors cursor-pointer',
              activeMode === 'dark' ? 'bg-primary text-primary-foreground font-medium shadow-2xs' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Moon className="size-3" />
            <span>Dark</span>
          </button>
        </div>
      </div>

      {/* Contrast Warning Banner if any */}
      {contrastIssues.length > 0 && (
        <div className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-destructive text-xs">
          <AlertCircle className="size-3.5 shrink-0" />
          <span>
            {contrastIssues.length} contrast {contrastIssues.length === 1 ? 'issue' : 'issues'} in {activeMode} mode (AA minimum)
          </span>
        </div>
      )}

      {/* Color Token Rows */}
      <div className="flex flex-col divide-y divide-border/60">
        {THEME_COLOR_KEYS.map((key) => {
          const value = currentTokens[key] ?? '#000000';
          const issue = contrastIssues.find((ci) => ci.pair.includes(key));

          return (
            <div key={key} className="grid @sm:grid-cols-[minmax(9rem,1fr)_minmax(0,2fr)] hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-1.5 py-2 ps-4 pe-3">
                <label htmlFor={`palette-color-${key}`} className="truncate font-mono text-[0.8125rem] text-foreground font-medium">
                  {key}
                </label>
                {issue && (
                  <span title={`Contrast warning: ${issue.ratio.toFixed(1)}:1`} className="inline-block size-1.5 rounded-full bg-destructive" />
                )}
              </div>
              <div className="flex min-h-9 items-center justify-between gap-3 px-3 py-1.5 @sm:border-s @sm:border-border/60">
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  {/* Swatch & Native Color Picker */}
                  <label className="relative size-6 shrink-0 cursor-pointer overflow-hidden rounded-md border border-border/80 shadow-2xs transition-transform hover:scale-105">
                    <span className="absolute inset-0 block" style={{ backgroundColor: value }} />
                    <input
                      id={`palette-color-${key}`}
                      type="color"
                      value={value.startsWith('#') && value.length === 7 ? value : '#000000'}
                      onChange={(e) => onColorChange(activeMode, key, e.target.value)}
                      className="sr-only"
                      aria-label={`${key} color picker`}
                    />
                  </label>

                  {/* Hex Text Input */}
                  <input
                    type="text"
                    spellCheck={false}
                    autoComplete="off"
                    value={value}
                    onChange={(e) => onColorChange(activeMode, key, e.target.value)}
                    className="flex-1 min-w-0 font-mono text-xs text-foreground bg-transparent outline-none placeholder:text-muted-foreground/60"
                    placeholder="#hex"
                    aria-label={`${key} color hex`}
                  />
                </div>

                <span className="shrink-0 font-mono text-[11px] text-muted-foreground/80 select-none">color</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
