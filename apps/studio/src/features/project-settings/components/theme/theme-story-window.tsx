import { cn } from '@cms/design-system/lib/utils';
import {
  type DocsLayoutId,
  type ResolvedTheme,
  THEME_TOKEN_CSS_VARIABLES,
  type ThemeColorKey,
  type ThemeColorTokens,
  type ThemeComponents,
  type ThemeLayout,
} from '@cms/shared/themes';
import { DocumentationThemeProvider, LiveDocsLayoutPreview } from '@cms/site';
import type { ProjectConfig } from '@cms/validators';
import { type CSSProperties, useMemo, useState } from 'react';

export interface ThemeStoryWindowProps {
  layoutId: DocsLayoutId;
  effectiveConfig: ProjectConfig;
  resolvedTheme: ResolvedTheme;
  resolvedColors?: {
    light: ThemeColorTokens;
    dark: ThemeColorTokens;
  };
  resolvedLayout?: ThemeLayout;
  resolvedComponents?: ThemeComponents;
  appearance: 'light' | 'dark' | 'system';
  onAppearanceChange?: (appearance: 'light' | 'dark' | 'system') => void;
  options?: Partial<ThemeLayout>;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  className?: string;
}

export function ThemeStoryWindow({
  layoutId,
  effectiveConfig,
  resolvedTheme,
  resolvedColors,
  resolvedLayout,
  resolvedComponents,
  appearance,
  onAppearanceChange,
  options: _options,
  isFullscreen = false,
  onToggleFullscreen,
  className,
}: ThemeStoryWindowProps) {
  const [activePath, setActivePath] = useState('');

  const currentLayout = resolvedLayout ?? resolvedTheme.layout;
  const currentComponents = resolvedComponents ?? resolvedTheme.components;

  const effectiveTheme: ResolvedTheme = useMemo(
    () => ({
      ...resolvedTheme,
      layout: currentLayout,
      components: currentComponents,
    }),
    [resolvedTheme, currentLayout, currentComponents],
  );

  const draftThemeVariables = useMemo(() => {
    const isDark = appearance === 'dark';
    const activeColors = resolvedColors ? (isDark ? resolvedColors.dark : resolvedColors.light) : undefined;
    const vars: Record<string, string> = {};

    if (activeColors) {
      for (const [key, value] of Object.entries(activeColors)) {
        const cssVar = THEME_TOKEN_CSS_VARIABLES[key as ThemeColorKey];
        if (cssVar && value) {
          vars[cssVar] = value;
        }
      }
    }

    const radius = currentLayout.radius ?? 'rounded';
    const radiusValue = radius === 'pill' ? '9999px' : radius === 'sharp' ? '0px' : '0.625rem';
    vars['--radius'] = radiusValue;

    return vars as CSSProperties;
  }, [appearance, resolvedColors, currentLayout]);

  return (
    <div
      className={cn(
        'relative overflow-hidden flex flex-col',
        isFullscreen ? 'flex-1 min-h-0 size-full p-0 bg-background' : 'px-3 py-3.5 sm:px-5 sm:py-4 bg-[#181615]',
        className,
      )}
      style={
        isFullscreen
          ? undefined
          : {
              backgroundImage: 'radial-gradient(circle, #e29f372b 1.25px, transparent 1.25px)',
              backgroundSize: '16px 16px',
            }
      }
    >
      {/* macOS Window Chrome Container */}
      <div
        className={cn(
          'relative overflow-hidden bg-background transition-colors flex flex-col min-h-0',
          isFullscreen ? 'flex-1 size-full rounded-none border-0 shadow-none' : 'rounded-xl border border-border/80 shadow-2xl',
        )}
      >
        {/* macOS Window Header */}
        <div className="flex h-8.5 shrink-0 items-center justify-between border-b border-border/70 bg-muted px-3.5 select-none">
          <div className="flex items-center gap-2">
            <span data-window-control="close" className="size-2.5 rounded-full bg-[#ff5f57] border border-black/10 inline-block" />
            <span data-window-control="minimize" className="size-2.5 rounded-full bg-[#febc2e] border border-black/10 inline-block" />
            <button
              type="button"
              data-window-control="maximize"
              onClick={onToggleFullscreen}
              className="size-2.5 rounded-full bg-[#28c840] border border-black/10 inline-block cursor-pointer hover:opacity-80 transition-opacity"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            />
          </div>
          <div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-background/60 px-2.5 py-0.5 text-[10.5px] font-mono text-muted-foreground">
            <span>
              https://docs.local/preview/{layoutId}
              {activePath ? `/${activePath.replace(/^\/+/, '')}` : ''}
            </span>
          </div>
          <div className="size-2.5" />
        </div>

        {/* Live Docs Template Rendering Viewport */}
        <DocumentationThemeProvider
          appearance={appearance === 'dark' ? 'dark' : 'light'}
          className="size-full overflow-hidden text-sm flex-1 flex flex-col min-h-0 relative [transform:translateZ(0)]"
          context="studio-preview"
          direction="ltr"
          style={{
            ...draftThemeVariables,
            transform: 'translateZ(0)',
          }}
          theme={effectiveTheme}
        >
          <div className={cn('overflow-y-auto', isFullscreen ? 'flex-1 min-h-0 size-full' : 'min-h-[380px] max-h-[460px]')}>
            <LiveDocsLayoutPreview
              layoutId={layoutId}
              activePath={activePath}
              onNavigate={setActivePath}
              theme={effectiveTheme}
              brandTitle={(effectiveConfig as any)?.branding?.title}
              appearance={appearance}
              onAppearanceChange={onAppearanceChange}
            />
          </div>
        </DocumentationThemeProvider>
      </div>
    </div>
  );
}
