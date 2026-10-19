import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@cms/design-system/components/ui/select';
import { cn } from '@cms/design-system/lib/utils';
import { useT } from '@cms/i18n/react';
import {
  type cmsThemeConfig,
  DOCS_LAYOUT_IDS,
  type DocsLayoutId,
  type ResolvedTheme,
  resolveDocsLayout,
  type ThemeColorTokens,
  type ThemeComponents,
  type ThemeLayout,
} from '@cms/shared/themes';
import type { ProjectConfig } from '@cms/validators';
import { Maximize, Minimize, Moon, Sun } from 'lucide-react';
import { useRef, useState } from 'react';
import { ThemePropsTable } from './theme-props-table';
import { ThemeStoryWindow } from './theme-story-window';
import type { FumadocsLayoutOptions, PropsTablePath } from './types';

export interface ThemeFumadocsStoryProps {
  config: ProjectConfig;
  themeConfig: cmsThemeConfig;
  onThemeConfigChange: (config: cmsThemeConfig | ((prev: cmsThemeConfig) => cmsThemeConfig)) => void;
  resolvedTheme: ResolvedTheme;
  resolvedColors: {
    light: ThemeColorTokens;
    dark: ThemeColorTokens;
  };
  resolvedLayout: ThemeLayout;
  resolvedComponents: ThemeComponents;
  appearance: 'light' | 'dark' | 'system';
  onAppearanceChange: (appearance: 'light' | 'dark' | 'system') => void;
  layoutOptions: FumadocsLayoutOptions;
  onLayoutOptionsChange: (options: FumadocsLayoutOptions | ((prev: FumadocsLayoutOptions) => FumadocsLayoutOptions)) => void;
  onReset: () => void;
  className?: string;
}

export function ThemeFumadocsStory({
  config,
  themeConfig,
  onThemeConfigChange,
  resolvedTheme,
  resolvedColors,
  resolvedLayout,
  resolvedComponents,
  appearance,
  onAppearanceChange,
  layoutOptions,
  onLayoutOptionsChange,
  onReset,
  className,
}: ThemeFumadocsStoryProps) {
  const t = useT();
  const [tablePath, setTablePath] = useState<PropsTablePath>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeLayout: DocsLayoutId = resolveDocsLayout(resolvedLayout.docsLayout);
  const previewMode: 'light' | 'dark' = appearance === 'dark' ? 'dark' : 'light';

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      if (containerRef.current?.requestFullscreen) {
        containerRef.current.requestFullscreen().catch(() => {
          setIsFullscreen(true);
        });
      } else {
        setIsFullscreen(true);
      }
    } else if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {
        setIsFullscreen(false);
      });
    } else {
      setIsFullscreen(false);
    }
  };

  const layoutDisplayName = t(`settings.theme.layout.${activeLayout}.name`);

  return (
    <div
      ref={containerRef}
      className={cn(
        'not-prose overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-all',
        isFullscreen && 'fixed inset-0 z-50 rounded-none overflow-y-auto bg-background p-4 sm:p-6',
        className,
      )}
    >
      {/* Top Story Header Bar */}
      <div className="flex h-10 items-center justify-between border-b border-border/70 ps-4 pe-2 bg-card">
        {/* Layout Name */}
        <p className="truncate text-[0.8125rem] font-semibold text-foreground tracking-tight">{layoutDisplayName}</p>

        {/* Header Right Actions */}
        <div className="flex items-center gap-1.5 ms-auto">
          {/* Layout Quick Selector with unified system design */}
          <Select
            value={activeLayout}
            onValueChange={(val) => {
              if (val) {
                onThemeConfigChange((prev) => ({
                  ...prev,
                  layout: {
                    ...(prev.layout ?? {}),
                    docsLayout: val as DocsLayoutId,
                  },
                }));
              }
            }}
          >
            <SelectTrigger
              aria-label="Select Docs Layout"
              size="sm"
              className="h-7 w-auto min-w-32 border-border/70 bg-transparent text-xs font-medium"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {DOCS_LAYOUT_IDS.map((id) => (
                <SelectItem key={id} value={id} className="text-xs">
                  {t(`settings.theme.layout.${id}.name`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Theme Mode Toggle in Header */}
          <button
            type="button"
            aria-label="Toggle preview theme"
            title="Toggle preview theme"
            onClick={() => onAppearanceChange(previewMode === 'dark' ? 'light' : 'dark')}
            className="inline-flex size-7 items-center justify-center rounded-md border border-border/70 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
          >
            {previewMode === 'dark' ? <Sun className="size-3.5 text-amber-400" /> : <Moon className="size-3.5" />}
          </button>

          {/* Fullscreen Button */}
          <button
            type="button"
            aria-label="Fullscreen"
            title="Fullscreen"
            onClick={toggleFullscreen}
            className="inline-flex size-7 items-center justify-center rounded-md border border-border/70 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
          >
            {isFullscreen ? <Minimize className="size-3.5" /> : <Maximize className="size-3.5" />}
          </button>
        </div>
      </div>

      {/* Story Window with macOS Chrome */}
      <ThemeStoryWindow
        layoutId={activeLayout}
        effectiveConfig={config}
        resolvedTheme={resolvedTheme}
        appearance={previewMode}
        options={layoutOptions}
      />

      {/* Interactive Props Table */}
      <ThemePropsTable
        path={tablePath}
        onNavigate={setTablePath}
        layoutOptions={layoutOptions}
        onLayoutOptionsChange={onLayoutOptionsChange}
        themeConfig={themeConfig}
        onThemeConfigChange={onThemeConfigChange}
        resolvedColors={resolvedColors}
        resolvedLayout={resolvedLayout}
        resolvedComponents={resolvedComponents}
        onReset={() => {
          setTablePath([]);
          onReset();
        }}
      />
    </div>
  );
}
