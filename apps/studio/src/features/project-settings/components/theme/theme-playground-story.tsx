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
import { Maximize, Minimize, Moon, SlidersHorizontal, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ThemePropsTable } from './theme-props-table';
import { ThemeStoryWindow } from './theme-story-window';
import type { PropsTablePath } from './types';

export interface ThemePlaygroundStoryProps {
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
  onReset: () => void;
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
      {/* Top Controls Toolbar */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/70 bg-card px-4 text-xs select-none">
        {/* Left: Title & Docs Layout selector */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground tracking-tight">Preview Playground</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-[10px] text-primary">{layoutDisplayName}</span>
          </div>

          <div className="h-4 w-px bg-border/70" />

          {/* Docs Layout Mode Picker */}
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Layout:</span>
            <Select
              value={activeLayout}
              onValueChange={(val) => {
                if (!val) return;
                onThemeConfigChange((prev) => ({
                  ...prev,
                  layout: {
                    ...(prev.layout ?? {}),
                    docsLayout: val as DocsLayoutId,
                  },
                }));
              }}
            >
              <SelectTrigger aria-label="Select Docs Layout" className="h-7 min-w-[6.5rem] border-border/80 bg-background text-xs shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCS_LAYOUT_IDS.map((layout) => (
                  <SelectItem key={layout} value={layout} className="text-xs">
                    {t(`settings.theme.layout.${layout}.name`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Right: Fullscreen and Appearance toggle */}
        <div className="flex items-center gap-1.5">
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
            className="inline-flex size-7 items-center justify-center rounded-md border border-border/70 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
          >
            {previewMode === 'dark' ? <Sun className="size-3.5 text-amber-400" /> : <Moon className="size-3.5" />}
          </button>

          {/* Fullscreen Button */}
          <button
            type="button"
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            onClick={toggleFullscreen}
            className="inline-flex size-7 items-center justify-center rounded-md border border-border/70 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
          >
            {isFullscreen ? <Minimize className="size-3.5" /> : <Maximize className="size-3.5" />}
          </button>
        </div>
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
          className={cn('h-[280px] border-t border-border border-x-0 border-b-0 rounded-none', isFullscreen && 'shrink-0')}
        />
      )}
    </div>
  );
}

// Backwards-compatibility alias
export const ThemeFumadocsStory = ThemePlaygroundStory;
export type ThemeFumadocsStoryProps = ThemePlaygroundStoryProps;
