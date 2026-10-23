import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@cms/design-system/components/ui/select';
import { cn } from '@cms/design-system/lib/utils';
import { useT } from '@cms/i18n/react';
import {
  DOCS_LAYOUT_IDS,
  type DocsLayoutId,
  type ResolvedTheme,
  resolveDocsLayout,
  type ThemeColorTokens,
  type ThemeComponents,
  type ThemeConfig,
  type ThemeLayout,
  type ThemePresetId,
} from '@cms/shared/themes';
import type { ProjectConfig } from '@cms/validators';
import { Maximize, Minimize, Moon, SlidersHorizontal, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ThemePropsTable } from './theme-props-table';
import { ThemeStoryWindow } from './theme-story-window';
import type { PropsTablePath } from './types';

export interface ThemePlaygroundStoryProps {
  config: ProjectConfig;
  themeConfig: ThemeConfig;
  onThemeConfigChange: (config: ThemeConfig | ((prev: ThemeConfig) => ThemeConfig)) => void;
  resolvedTheme: ResolvedTheme;
  resolvedColors: {
    light: ThemeColorTokens;
    dark: ThemeColorTokens;
  };
  resolvedLayout: ThemeLayout;
  resolvedComponents: ThemeComponents;
  appearance: 'light' | 'dark' | 'system';
  onAppearanceChange: (appearance: 'light' | 'dark' | 'system') => void;
  onReset: () => void;
  projectId?: string;
  activePreset?: ThemePresetId;
  onSelectPreset?: (presetId: ThemePresetId) => void;
  onExport?: () => void;
  onImportTheme?: (theme: ThemeConfig, appearance?: 'light' | 'dark' | 'system') => void;
  isExporting?: boolean;
  className?: string;
}

export function ThemePlaygroundStory({
  config,
  themeConfig,
  onThemeConfigChange,
  resolvedTheme,
  resolvedColors,
  resolvedLayout,
  resolvedComponents,
  appearance,
  onAppearanceChange,
  onReset,
  projectId,
  activePreset,
  onSelectPreset,
  onExport,
  onImportTheme,
  isExporting,
  className,
}: ThemePlaygroundStoryProps) {
  const t = useT();
  const [tablePath, setTablePath] = useState<PropsTablePath>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showProps, setShowProps] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Synchronize fullscreen state with document and handle Escape key
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = Boolean(
        document.fullscreenElement &&
          containerRef.current &&
          (document.fullscreenElement === containerRef.current || containerRef.current.contains(document.fullscreenElement)),
      );
      setIsFullscreen(isFs);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {
            /* ignore */
          });
        }
        setIsFullscreen(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);

  const activeLayout: DocsLayoutId = resolveDocsLayout(resolvedLayout.docsLayout);
  const previewMode: 'light' | 'dark' = appearance === 'dark' ? 'dark' : 'light';

  const toggleFullscreen = async () => {
    const isCurrentlyFullscreen = Boolean(isFullscreen || document.fullscreenElement);
    if (isCurrentlyFullscreen) {
      if (document.fullscreenElement && document.exitFullscreen) {
        try {
          await document.exitFullscreen();
        } catch {
          // ignore error if exitFullscreen fails
        }
      }
      setIsFullscreen(false);
    } else if (containerRef.current?.requestFullscreen) {
      try {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } catch {
        // Fall back to CSS fullscreen if Fullscreen API is blocked/unsupported
        setIsFullscreen(true);
      }
    } else {
      setIsFullscreen(true);
    }
  };

  const layoutDisplayName = t(`settings.theme.layout.${activeLayout}.name`);

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all flex flex-col',
        isFullscreen ? 'fixed inset-0 z-50 rounded-none border-0 h-screen w-screen' : 'w-full',
        className,
      )}
    >
      {/* Top Controls Toolbar — mirrors Fumadocs WithControl */}
      <div className="flex h-10 shrink-0 items-center justify-end gap-1 border-b border-border/70 bg-card ps-4 pe-1.5 text-xs select-none">
        {/* Left: Display Name */}
        <p className="me-auto truncate text-[0.8125rem] font-medium text-card-foreground">
          {layoutDisplayName}
        </p>

        {/* Right: Layout / Variant Picker */}
        <Select
          value={activeLayout}
          onValueChange={(val) => {
            if (!val) return;
            onThemeConfigChange((prev: ThemeConfig) => ({
              ...prev,
              layout: {
                ...(prev.layout ?? {}),
                docsLayout: val as DocsLayoutId,
              },
            }));
          }}
        >
          <SelectTrigger
            data-testid="docs-layout-select-trigger"
            aria-label="Select Docs Layout"
            className="h-7 w-auto max-w-64 gap-1.5 border-0 bg-transparent px-2 text-xs hover:bg-accent focus:ring-0 focus-visible:ring-2 shadow-none"
          >
            <span className="text-muted-foreground">Layout</span>
            <SelectValue className="truncate font-medium" />
          </SelectTrigger>
          <SelectContent align="end">
            {DOCS_LAYOUT_IDS.map((layout) => (
              <SelectItem data-testid={`layout-option-${layout}`} key={layout} value={layout} className="text-xs">
                {t(`settings.theme.layout.${layout}.name`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isFullscreen && (
          <button
            type="button"
            onClick={() => setShowProps(!showProps)}
            aria-label={showProps ? 'Hide Props Table' : 'Show Props Table'}
            title={showProps ? 'Hide Props Table' : 'Show Props Table'}
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium cursor-pointer transition-colors',
              showProps ? 'bg-primary text-primary-foreground border-primary' : 'border-border/70 bg-card text-foreground hover:bg-muted',
            )}
          >
            <SlidersHorizontal className="size-3.5" />
            <span>Props</span>
          </button>
        )}

        {/* Light/Dark preview mode button */}
        <button
          type="button"
          aria-label={`Toggle Preview: ${previewMode === 'dark' ? 'Light' : 'Dark'}`}
          title={`Preview mode: ${previewMode}`}
          onClick={() => onAppearanceChange(previewMode === 'dark' ? 'light' : 'dark')}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
        >
          {previewMode === 'dark' ? <Sun className="size-3.5 text-amber-400" /> : <Moon className="size-3.5" />}
        </button>

        {/* Fullscreen Button */}
        <button
          type="button"
          aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          onClick={toggleFullscreen}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
        >
          {isFullscreen ? <Minimize className="size-3.5" /> : <Maximize className="size-3.5" />}
        </button>
      </div>

      {/* Story Window with Window Frame */}
      <ThemeStoryWindow
        layoutId={activeLayout}
        effectiveConfig={config}
        resolvedTheme={resolvedTheme}
        resolvedColors={resolvedColors}
        resolvedLayout={resolvedLayout}
        resolvedComponents={resolvedComponents}
        appearance={appearance}
        onAppearanceChange={onAppearanceChange}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
      />

      {/* Interactive Props Table */}
      {(!isFullscreen || showProps) && (
        <ThemePropsTable
          path={tablePath}
          onNavigate={setTablePath}
          themeConfig={themeConfig}
          onThemeConfigChange={onThemeConfigChange}
          resolvedColors={resolvedColors}
          resolvedLayout={resolvedLayout}
          resolvedComponents={resolvedComponents}
          onReset={() => {
            setTablePath([]);
            onReset();
          }}
          projectId={projectId}
          activePreset={activePreset}
          onSelectPreset={onSelectPreset}
          onExport={onExport}
          onImportTheme={onImportTheme}
          isExporting={isExporting}
          className={cn('h-[280px] border-t border-border border-x-0 border-b-0 rounded-none', isFullscreen && 'shrink-0')}
        />
      )}
    </div>
  );
}

// Backwards-compatibility alias
export const ThemeFumadocsStory = ThemePlaygroundStory;
export type ThemeFumadocsStoryProps = ThemePlaygroundStoryProps;
