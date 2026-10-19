import { type ReactNode, useId } from 'react';
import { cn } from '@cms/design-system/lib/utils';
import type {
  DocsLayoutId,
  ThemeColorKey,
  ThemeColorTokens,
  ThemeComponents,
  ThemeLayout,
  cmsThemeConfig,
} from '@cms/shared/themes';
import { ArrowLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { ThemePaletteEditor } from './theme-palette-editor';
import {
  formatPropSummary,
  type FumadocsLayoutOptions,
  type PropsTablePath,
  type PropsTablePathCategory,
} from './types';

export interface ThemePropsTableProps {
  path: PropsTablePath;
  onNavigate: (path: PropsTablePath) => void;
  layoutOptions: FumadocsLayoutOptions;
  onLayoutOptionsChange: (
    options: FumadocsLayoutOptions | ((prev: FumadocsLayoutOptions) => FumadocsLayoutOptions),
  ) => void;
  themeConfig: cmsThemeConfig;
  onThemeConfigChange: (
    config: cmsThemeConfig | ((prev: cmsThemeConfig) => cmsThemeConfig),
  ) => void;
  resolvedColors: {
    light: ThemeColorTokens;
    dark: ThemeColorTokens;
  };
  resolvedLayout: ThemeLayout;
  resolvedComponents: ThemeComponents;
  onReset: () => void;
  className?: string;
}

export function ThemePropsTable({
  path,
  onNavigate,
  layoutOptions,
  onLayoutOptionsChange,
  themeConfig,
  onThemeConfigChange,
  resolvedColors,
  resolvedLayout,
  resolvedComponents,
  onReset,
  className,
}: ThemePropsTableProps) {
  const currentCategory = path[0];

  const setNavProp = <K extends keyof FumadocsLayoutOptions['nav']>(
    key: K,
    val: FumadocsLayoutOptions['nav'][K],
  ) => {
    onLayoutOptionsChange((prev) => ({
      ...prev,
      nav: { ...prev.nav, [key]: val },
    }));
  };

  const setThemeSwitchProp = <K extends keyof FumadocsLayoutOptions['themeSwitch']>(
    key: K,
    val: FumadocsLayoutOptions['themeSwitch'][K],
  ) => {
    onLayoutOptionsChange((prev) => ({
      ...prev,
      themeSwitch: { ...prev.themeSwitch, [key]: val },
    }));
  };

  const setSearchToggleProp = (enabled: boolean) => {
    onLayoutOptionsChange((prev) => ({
      ...prev,
      searchToggle: { enabled },
    }));
  };

  const setSidebarProp = (collapsible: boolean) => {
    onLayoutOptionsChange((prev) => ({
      ...prev,
      sidebar: { collapsible },
    }));
  };

  const setLayoutPart = <K extends keyof ThemeLayout>(key: K, value: ThemeLayout[K]) => {
    onThemeConfigChange((prev) => ({
      ...prev,
      layout: {
        ...(prev.layout ?? {}),
        [key]: value,
      },
    }));
  };

  const setComponentPart = <K extends keyof ThemeComponents>(
    key: K,
    value: ThemeComponents[K],
  ) => {
    onThemeConfigChange((prev) => ({
      ...prev,
      components: {
        ...(prev.components ?? {}),
        [key]: value,
      },
    }));
  };

  const handleColorChange = (mode: 'light' | 'dark', key: ThemeColorKey, value: string) => {
    onThemeConfigChange((prev) => ({
      ...prev,
      colors: {
        ...prev.colors,
        [mode]: {
          ...(prev.colors?.[mode] ?? {}),
          [key]: value,
        },
      },
    }));
  };

  return (
    <div
      className={cn(
        'not-prose overflow-hidden rounded-xl border border-border bg-card text-card-foreground',
        className,
      )}
    >
      {/* Breadcrumbs Navigation Header */}
      <nav
        aria-label="Props navigation"
        className="sticky top-0 z-10 flex h-10 shrink-0 items-center gap-1 border-b border-border/70 ps-4 pe-2 text-[0.8125rem] bg-card/95 backdrop-blur-xs"
      >
        {currentCategory && (
          <button
            type="button"
            onClick={() => onNavigate([])}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="size-3.5" />
          </button>
        )}
        <ol className="flex min-w-0 items-center gap-1">
          <li>
            {currentCategory ? (
              <button
                type="button"
                onClick={() => onNavigate([])}
                className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer font-medium transition-colors"
              >
                Props
              </button>
            ) : (
              <span className="px-1.5 py-0.5 text-foreground font-medium">Props</span>
            )}
          </li>
          {currentCategory && (
            <li className="flex items-center gap-1">
              <ChevronRight className="size-3.5 text-muted-foreground/50 shrink-0" />
              <span className="font-mono font-medium text-foreground px-1.5 py-0.5">
                {currentCategory}
              </span>
            </li>
          )}
        </ol>

        <button
          type="button"
          onClick={onReset}
          className="ms-auto inline-flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
          title="Reset Props"
          aria-label="Reset Props"
        >
          <RotateCcw className="size-3.5" />
        </button>
      </nav>

      {/* Main Content Area */}
      <div className="flex flex-col max-h-[520px] overflow-y-auto min-h-[220px]">
        {/* ROOT PROPS TABLE VIEW */}
        {!currentCategory && (
          <div className="divide-y divide-border/60">
            <NavRow
              id="nav"
              name="nav"
              summary={formatPropSummary(layoutOptions.nav)}
              type="object"
              onNavigate={() => onNavigate(['nav'])}
            />
            <NavRow
              id="themeSwitch"
              name="themeSwitch"
              summary={formatPropSummary(layoutOptions.themeSwitch)}
              type="object"
              onNavigate={() => onNavigate(['themeSwitch'])}
            />
            <NavRow
              id="searchToggle"
              name="searchToggle"
              summary={formatPropSummary(layoutOptions.searchToggle)}
              type="object"
              onNavigate={() => onNavigate(['searchToggle'])}
            />
            <NavRow
              id="sidebar"
              name="sidebar"
              summary={formatPropSummary(layoutOptions.sidebar)}
              type="object"
              onNavigate={() => onNavigate(['sidebar'])}
            />
            <NavRow
              id="palette"
              name="palette"
              summary={formatPropSummary(resolvedColors.light)}
              type="object"
              onNavigate={() => onNavigate(['palette'])}
            />
            <NavRow
              id="layout"
              name="layout"
              summary={formatPropSummary(resolvedLayout)}
              type="object"
              onNavigate={() => onNavigate(['layout'])}
            />
            <NavRow
              id="components"
              name="components"
              summary={formatPropSummary(resolvedComponents)}
              type="object"
              onNavigate={() => onNavigate(['components'])}
            />
          </div>
        )}

        {/* DRILL-DOWN: NAV */}
        {currentCategory === 'nav' && (
          <div className="divide-y divide-border/60">
            <StringRow
              name="title"
              value={layoutOptions.nav.title}
              onChange={(v) => setNavProp('title', v)}
              placeholder="Docs title"
            />
            <EnumRow
              name="transparentMode"
              value={layoutOptions.nav.transparentMode ?? 'none'}
              options={['none', 'top', 'always']}
              onChange={(v) =>
                setNavProp('transparentMode', v as 'none' | 'top' | 'always')
              }
            />
          </div>
        )}

        {/* DRILL-DOWN: THEME SWITCH */}
        {currentCategory === 'themeSwitch' && (
          <div className="divide-y divide-border/60">
            <BooleanRow
              name="enabled"
              value={layoutOptions.themeSwitch.enabled}
              onChange={(v) => setThemeSwitchProp('enabled', v)}
            />
            <EnumRow
              name="mode"
              value={layoutOptions.themeSwitch.mode ?? 'light-dark'}
              options={['light-dark', 'light-dark-system']}
              onChange={(v) =>
                setThemeSwitchProp('mode', v as 'light-dark' | 'light-dark-system')
              }
            />
          </div>
        )}

        {/* DRILL-DOWN: SEARCH TOGGLE */}
        {currentCategory === 'searchToggle' && (
          <div className="divide-y divide-border/60">
            <BooleanRow
              name="enabled"
              value={layoutOptions.searchToggle.enabled}
              onChange={setSearchToggleProp}
            />
          </div>
        )}

        {/* DRILL-DOWN: SIDEBAR */}
        {currentCategory === 'sidebar' && (
          <div className="divide-y divide-border/60">
            <BooleanRow
              name="collapsible"
              value={layoutOptions.sidebar.collapsible}
              onChange={setSidebarProp}
            />
          </div>
        )}

        {/* DRILL-DOWN: PALETTE */}
        {currentCategory === 'palette' && (
          <ThemePaletteEditor
            colors={resolvedColors}
            onColorChange={handleColorChange}
          />
        )}

        {/* DRILL-DOWN: LAYOUT */}
        {currentCategory === 'layout' && (
          <div className="divide-y divide-border/60">
            <EnumRow
              name="docsLayout"
              value={resolvedLayout.docsLayout ?? 'docs'}
              options={['docs', 'glass', 'notebook', 'flux', 'spacious']}
              onChange={(v) => setLayoutPart('docsLayout', v as DocsLayoutId)}
            />
            <EnumRow
              name="shell"
              value={resolvedLayout.shell}
              options={['reference', 'editorial', 'console']}
              onChange={(v) => setLayoutPart('shell', v as ThemeLayout['shell'])}
            />
            <EnumRow
              name="density"
              value={resolvedLayout.density}
              options={['compact', 'comfortable', 'relaxed']}
              onChange={(v) => setLayoutPart('density', v as ThemeLayout['density'])}
            />
            <EnumRow
              name="contentWidth"
              value={resolvedLayout.contentWidth}
              options={['focused', 'balanced', 'wide']}
              onChange={(v) => setLayoutPart('contentWidth', v as ThemeLayout['contentWidth'])}
            />
            <EnumRow
              name="header"
              value={resolvedLayout.header}
              options={['inline', 'stacked', 'floating']}
              onChange={(v) => setLayoutPart('header', v as ThemeLayout['header'])}
            />
            <EnumRow
              name="sidebar"
              value={resolvedLayout.sidebar}
              options={['bordered', 'soft', 'rail']}
              onChange={(v) => setLayoutPart('sidebar', v as ThemeLayout['sidebar'])}
            />
            <EnumRow
              name="navigation"
              value={resolvedLayout.navigation}
              options={['tree', 'sectioned', 'compact']}
              onChange={(v) => setLayoutPart('navigation', v as ThemeLayout['navigation'])}
            />
            <EnumRow
              name="radius"
              value={resolvedLayout.radius}
              options={['sharp', 'rounded', 'pill']}
              onChange={(v) => setLayoutPart('radius', v as ThemeLayout['radius'])}
            />
          </div>
        )}

        {/* DRILL-DOWN: COMPONENTS */}
        {currentCategory === 'components' && (
          <div className="divide-y divide-border/60">
            <EnumRow
              name="codeBlocks"
              value={resolvedComponents.codeBlocks}
              options={['system', 'dim', 'vivid']}
              onChange={(v) =>
                setComponentPart('codeBlocks', v as ThemeComponents['codeBlocks'])
              }
            />
            <EnumRow
              name="callouts"
              value={resolvedComponents.callouts}
              options={['soft', 'outline', 'solid']}
              onChange={(v) =>
                setComponentPart('callouts', v as ThemeComponents['callouts'])
              }
            />
            <EnumRow
              name="cards"
              value={resolvedComponents.cards}
              options={['bordered', 'lifted', 'flat']}
              onChange={(v) =>
                setComponentPart('cards', v as ThemeComponents['cards'])
              }
            />
            <EnumRow
              name="tabs"
              value={resolvedComponents.tabs}
              options={['underline', 'pills', 'boxed']}
              onChange={(v) =>
                setComponentPart('tabs', v as ThemeComponents['tabs'])
              }
            />
            <EnumRow
              name="tables"
              value={resolvedComponents.tables}
              options={['lines', 'rows', 'cards']}
              onChange={(v) =>
                setComponentPart('tables', v as ThemeComponents['tables'])
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   INTERNAL ROW COMPONENTS MATCHING FUMADOCS SPEC
   ========================================================================= */

function NavRow({
  id,
  name,
  summary,
  type,
  onNavigate,
}: {
  id: string;
  name: string;
  summary: string;
  type: string;
  onNavigate: () => void;
}) {
  return (
    <div className="grid @sm:grid-cols-[minmax(9rem,1fr)_minmax(0,2fr)]">
      <div className="flex min-w-0 items-center gap-1 py-2.5 ps-4 pe-3">
        <span className="truncate font-mono text-[0.8125rem] text-foreground font-medium">
          {name}
        </span>
      </div>
      <div className="flex min-h-9 items-stretch text-[0.8125rem] transition-colors @sm:border-s @sm:border-border/60 hover:bg-muted/30">
        <button
          type="button"
          data-prop-id={id}
          onClick={onNavigate}
          className="group/nav flex min-w-0 flex-1 items-center ps-3 text-start outline-none cursor-pointer"
        >
          <span className="min-w-0 flex-1 truncate pe-2 font-mono text-xs text-muted-foreground">
            {summary}
          </span>
          <span className="shrink-0 font-mono text-xs text-muted-foreground pe-1">
            {type}
          </span>
          <span className="flex w-7 shrink-0 items-center justify-center">
            <ChevronRight className="size-3.5 text-muted-foreground transition-transform duration-200 group-hover/nav:translate-x-0.5" />
          </span>
        </button>
      </div>
    </div>
  );
}

function BooleanRow({
  name,
  value,
  onChange,
}: {
  name: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="grid @sm:grid-cols-[minmax(9rem,1fr)_minmax(0,2fr)] hover:bg-muted/20 transition-colors">
      <div className="flex min-w-0 items-center gap-1 py-2 ps-4 pe-3">
        <span className="truncate font-mono text-[0.8125rem] text-foreground font-medium">
          {name}
        </span>
      </div>
      <div className="flex min-h-9 items-center justify-between px-3 @sm:border-s @sm:border-border/60">
        <div className="flex items-center gap-1">
          {[true, false].map((option) => (
            <button
              key={String(option)}
              type="button"
              aria-pressed={value === option}
              onClick={() => onChange(option)}
              className={cn(
                'h-6 rounded px-2.5 font-mono text-xs transition-colors cursor-pointer',
                value === option
                  ? 'bg-primary text-primary-foreground font-medium shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {String(option)}
            </button>
          ))}
        </div>
        <span className="font-mono text-xs text-muted-foreground/70">boolean</span>
      </div>
    </div>
  );
}

function StringRow({
  name,
  value,
  onChange,
  placeholder,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="grid @sm:grid-cols-[minmax(9rem,1fr)_minmax(0,2fr)] hover:bg-muted/20 transition-colors">
      <div className="flex min-w-0 items-center gap-1 py-2 ps-4 pe-3">
        <label
          htmlFor={id}
          className="truncate font-mono text-[0.8125rem] text-foreground font-medium"
        >
          {name}
        </label>
      </div>
      <div className="flex min-h-9 items-center justify-between px-3 @sm:border-s @sm:border-border/60">
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground/60"
        />
        <span className="font-mono text-xs text-muted-foreground/70">string</span>
      </div>
    </div>
  );
}

function EnumRow<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="grid @sm:grid-cols-[minmax(9rem,1fr)_minmax(0,2fr)] hover:bg-muted/20 transition-colors">
      <div className="flex min-w-0 items-center gap-1 py-2 ps-4 pe-3">
        <label
          htmlFor={id}
          className="truncate font-mono text-[0.8125rem] text-foreground font-medium"
        >
          {name}
        </label>
      </div>
      <div className="flex min-h-9 items-center justify-between px-3 @sm:border-s @sm:border-border/60">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          className="min-w-0 flex-1 bg-transparent font-mono text-xs text-foreground outline-none cursor-pointer"
        >
          {options.map((opt) => (
            <option key={opt} value={opt} className="bg-popover text-popover-foreground">
              {opt}
            </option>
          ))}
        </select>
        <span className="font-mono text-xs text-muted-foreground/70">enum</span>
      </div>
    </div>
  );
}
