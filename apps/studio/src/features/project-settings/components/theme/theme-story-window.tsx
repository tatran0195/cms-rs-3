import { Alert, AlertDescription, AlertTitle } from '@cms/design-system/components/ui/alert';
import { Badge } from '@cms/design-system/components/ui/badge';
import { Button } from '@cms/design-system/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@cms/design-system/components/ui/card';
import { Input } from '@cms/design-system/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@cms/design-system/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cms/design-system/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@cms/design-system/components/ui/tabs';
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
import { DocumentationThemeProvider, projectThemeStyle, projectThemeVariables, TableOfContents, TOCPopover, type TocHeading } from '@cms/site';
import { getDocsLayoutTemplate } from '@cms/site/layouts';
import type { ProjectConfig } from '@cms/validators';
import {
  AlertTriangle,
  BookOpen,
  Copy,
  ExternalLink,
  Folder,
  Info,
  Layers,
  Lightbulb,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Rocket,
  Search,
  Sparkles,
  Sun,
} from 'lucide-react';
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

const PREVIEW_HEADINGS_BY_PAGE: Record<string, TocHeading[]> = {
  overview: [
    { id: 'overview', text: 'Overview', depth: 2 },
    { id: 'introduction', text: 'Introduction', depth: 2 },
    { id: 'installation', text: 'Installation', depth: 3 },
    { id: 'theme-configuration', text: 'Theme Configuration', depth: 3 },
  ],
  quickstart: [
    { id: 'quickstart', text: 'Quick Start', depth: 2 },
    { id: 'install-dependencies', text: 'Install Dependencies', depth: 3 },
    { id: 'select-layout', text: 'Select Documentation Layout', depth: 3 },
  ],
  cards: [
    { id: 'cards-component', text: 'Cards Component', depth: 2 },
    { id: 'card-style-modes', text: 'Card Style Modes', depth: 3 },
  ],
  tabs: [
    { id: 'tabs-component', text: 'Tabs Component', depth: 2 },
    { id: 'tab-variations', text: 'Tab Variations', depth: 3 },
  ],
  callout: [
    { id: 'callout-component', text: 'Callout Component', depth: 2 },
    { id: 'callout-note', text: 'Note', depth: 3 },
    { id: 'callout-tip', text: 'Tip', depth: 3 },
    { id: 'callout-warning', text: 'Warning', depth: 3 },
  ],
  themes: [
    { id: 'themes-and-styling', text: 'Themes & Styling', depth: 2 },
    { id: 'color-tokens', text: 'Color Tokens', depth: 3 },
  ],
  markdown: [
    { id: 'markdown-and-typography', text: 'Markdown & Typography', depth: 2 },
    { id: 'syntax-reference', text: 'Syntax Reference', depth: 3 },
  ],
  search: [
    { id: 'search-dialog', text: 'Search Dialog', depth: 2 },
    { id: 'search-results', text: 'Search Results', depth: 3 },
  ],
};

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
  const [copied, setCopied] = useState(false);
  const [codeTab, setCodeTab] = useState<'npm' | 'pnpm' | 'yarn'>('npm');
  const [activeNavId, setActiveNavId] = useState('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const template = useMemo(() => getDocsLayoutTemplate(layoutId), [layoutId]);

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const codeSnippets: Record<'npm' | 'pnpm' | 'yarn', string> = {
    npm: 'npm i fumadocs-ui fumadocs-core',
    pnpm: 'pnpm add fumadocs-ui fumadocs-core',
    yarn: 'yarn add fumadocs-ui fumadocs-core',
  };

  const currentLayout = resolvedLayout ?? resolvedTheme.layout;
  const headerTransparentMode = currentLayout.headerTransparentMode ?? 'none';
  const isNavTransparent = headerTransparentMode === 'always';
  const title =
    ((effectiveConfig?.branding as Record<string, unknown> | undefined)?.title as string) ||
    (effectiveConfig?.navbar?.ctaLabel as string) ||
    'Product Docs';
  const searchEnabled = effectiveConfig?.navbar?.showSearch !== false;
  const themeSwitchEnabled = currentLayout.themeSwitchEnabled !== false;
  const themeSwitchMode = currentLayout.themeSwitchMode ?? 'light-dark';
  const sidebarCollapsible = currentLayout.sidebarCollapsible !== false;

  const radius = currentLayout.radius ?? 'rounded';
  const radiusClass = radius === 'pill' ? 'rounded-full' : radius === 'sharp' ? 'rounded-none' : 'rounded-lg';
  const cardRadiusClass = radius === 'pill' ? 'rounded-2xl' : radius === 'sharp' ? 'rounded-none' : 'rounded-xl';

  const density = currentLayout.density ?? 'comfortable';
  const densityStyles = useMemo(() => {
    if (density === 'compact') {
      return {
        headerHeight: 'h-10',
        padding: 'px-3 sm:px-4',
        gap: 'gap-2',
        fontSize: 'text-xs',
      };
    }
    if (density === 'relaxed') {
      return {
        headerHeight: 'h-14',
        padding: 'px-5 sm:px-6',
        gap: 'gap-4 sm:gap-5',
        fontSize: 'text-sm',
      };
    }
    return {
      headerHeight: 'h-12',
      padding: 'px-4 sm:px-5',
      gap: 'gap-3 sm:gap-4',
      fontSize: 'text-sm',
    };
  }, [density]);

  // Mock slots corresponding to layout options with dynamic theme radius & styling
  const brandSlot = (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'size-6 bg-primary/20 border border-primary/40 flex items-center justify-center text-primary font-bold text-xs shadow-2xs transition-all',
          radiusClass,
        )}
      >
        {title.charAt(0) || 'D'}
      </span>
      <span className="font-semibold text-sm tracking-tight text-foreground">{title}</span>
    </div>
  );

  const searchFullSlot = searchEnabled ? (
    <div
      className={cn(
        'flex items-center gap-2 w-full px-3 py-1.5 border border-border/70 bg-background/80 text-muted-foreground text-xs shadow-2xs cursor-pointer hover:border-primary/50 transition-all',
        radiusClass,
      )}
    >
      <Search className="size-3.5 shrink-0" />
      <Input
        type="text"
        density="compact"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search docs..."
        className="h-6 border-0 bg-transparent p-0 text-xs shadow-none focus-visible:ring-0 placeholder:text-muted-foreground"
      />
      <kbd className={cn('px-1.5 py-0.5 border border-border/80 bg-muted text-[10px] font-mono shrink-0', radiusClass)}>Ctrl K</kbd>
    </div>
  ) : null;

  const searchButtonSlot = searchEnabled ? (
    <Button
      variant="outline"
      size="icon-xs"
      onClick={() => setActiveNavId('search')}
      className={cn('border-border/70 bg-background/80 shadow-2xs', radiusClass)}
      title="Search documentation"
    >
      <Search className="size-3.5" />
    </Button>
  ) : null;

  const renderThemeSwitch = () => {
    if (!themeSwitchEnabled) return null;
    const mode = themeSwitchMode;
    const effectiveAppearance = appearance === 'system' ? 'system' : appearance === 'dark' ? 'dark' : 'light';

    if (mode === 'light-dark-system') {
      return (
        <div
          data-theme-switcher="segmented-system"
          className="inline-flex items-center rounded-full border border-border/70 p-0.5 bg-muted/40 shadow-2xs transition-all"
        >
          <button
            type="button"
            aria-label="System theme"
            title="System theme"
            onClick={() => onAppearanceChange?.('system')}
            className={cn(
              'flex size-6 items-center justify-center rounded-full text-muted-foreground transition-all cursor-pointer',
              effectiveAppearance === 'system' ? 'bg-background text-foreground shadow-xs font-semibold' : 'hover:text-foreground',
            )}
          >
            <Monitor className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Light theme"
            title="Light theme"
            onClick={() => onAppearanceChange?.('light')}
            className={cn(
              'flex size-6 items-center justify-center rounded-full text-muted-foreground transition-all cursor-pointer',
              effectiveAppearance === 'light' ? 'bg-background text-foreground shadow-xs font-semibold' : 'hover:text-foreground',
            )}
          >
            <Sun className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Dark theme"
            title="Dark theme"
            onClick={() => onAppearanceChange?.('dark')}
            className={cn(
              'flex size-6 items-center justify-center rounded-full text-muted-foreground transition-all cursor-pointer',
              effectiveAppearance === 'dark' ? 'bg-background text-foreground shadow-xs font-semibold' : 'hover:text-foreground',
            )}
          >
            <Moon className="size-3.5" />
          </button>
        </div>
      );
    }

    if (mode === 'light-dark') {
      return (
        <div
          data-theme-switcher="segmented-light-dark"
          className="inline-flex items-center rounded-full border border-border/70 p-0.5 bg-muted/40 shadow-2xs transition-all"
        >
          <button
            type="button"
            aria-label="Light theme"
            title="Light theme"
            onClick={() => onAppearanceChange?.('light')}
            className={cn(
              'flex size-6 items-center justify-center rounded-full text-muted-foreground transition-all cursor-pointer',
              effectiveAppearance === 'light' ? 'bg-background text-foreground shadow-xs font-semibold' : 'hover:text-foreground',
            )}
          >
            <Sun className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Dark theme"
            title="Dark theme"
            onClick={() => onAppearanceChange?.('dark')}
            className={cn(
              'flex size-6 items-center justify-center rounded-full text-muted-foreground transition-all cursor-pointer',
              effectiveAppearance === 'dark' ? 'bg-background text-foreground shadow-xs font-semibold' : 'hover:text-foreground',
            )}
          >
            <Moon className="size-3.5" />
          </button>
        </div>
      );
    }

    if (mode === 'button') {
      return (
        <Button
          variant="outline"
          size="icon-xs"
          data-theme-switcher="toggle-button"
          aria-label={`Switch to ${effectiveAppearance === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch to ${effectiveAppearance === 'dark' ? 'light' : 'dark'} mode`}
          onClick={() => onAppearanceChange?.(effectiveAppearance === 'dark' ? 'light' : 'dark')}
          className={cn('border-border/70 bg-background/80 shadow-2xs', radiusClass)}
        >
          {effectiveAppearance === 'dark' ? <Sun className="size-3.5 text-amber-400" /> : <Moon className="size-3.5" />}
        </Button>
      );
    }

    // mode === 'dropdown'
    return (
      <Select
        value={effectiveAppearance}
        onValueChange={(val) => {
          if (val) onAppearanceChange?.(val as 'light' | 'dark' | 'system');
        }}
      >
        <SelectTrigger data-theme-switcher="dropdown" className={cn('h-7 gap-1 px-2 text-xs border-border/70 bg-background/80', radiusClass)}>
          {effectiveAppearance === 'dark' ? (
            <Moon className="size-3 text-foreground" />
          ) : effectiveAppearance === 'system' ? (
            <Monitor className="size-3 text-foreground" />
          ) : (
            <Sun className="size-3 text-amber-500" />
          )}
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value="light" className="text-xs">
            Light
          </SelectItem>
          <SelectItem value="dark" className="text-xs">
            Dark
          </SelectItem>
          <SelectItem value="system" className="text-xs">
            System
          </SelectItem>
        </SelectContent>
      </Select>
    );
  };

  const toolsSlot = (
    <div className="flex items-center gap-1.5">
      {sidebarCollapsible && (
        <Button
          variant="outline"
          size="icon-xs"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className={cn('border-border/70 bg-background/80 shadow-2xs', radiusClass)}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <PanelLeftOpen className="size-3.5" /> : <PanelLeftClose className="size-3.5" />}
        </Button>
      )}
      {renderThemeSwitch()}
    </div>
  );

  const navLinksSlot = (
    <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
      <Button
        variant="ghost"
        size="xs"
        onClick={() => setActiveNavId('overview')}
        className={cn('h-7 px-2 text-xs', activeNavId === 'overview' ? 'text-primary font-semibold' : 'text-muted-foreground hover:text-foreground')}
      >
        Docs
      </Button>
      <Button
        variant="ghost"
        size="xs"
        onClick={() => setActiveNavId('cards')}
        className={cn('h-7 px-2 text-xs', activeNavId === 'cards' ? 'text-primary font-semibold' : 'text-muted-foreground hover:text-foreground')}
      >
        Components
      </Button>
      <Button
        variant="ghost"
        size="xs"
        onClick={() => setActiveNavId('themes')}
        className={cn('h-7 px-2 text-xs', activeNavId === 'themes' ? 'text-primary font-semibold' : 'text-muted-foreground hover:text-foreground')}
      >
        Themes
      </Button>
    </div>
  );

  const navTabsSlot = (
    <div className="flex items-center gap-1">
      <Button
        variant={activeNavId === 'overview' ? 'default' : 'ghost'}
        size="xs"
        onClick={() => setActiveNavId('overview')}
        className={cn('h-7 px-3 text-xs', radiusClass)}
      >
        Framework
      </Button>
      <Button
        variant={activeNavId === 'cards' ? 'default' : 'ghost'}
        size="xs"
        onClick={() => setActiveNavId('cards')}
        className={cn('h-7 px-3 text-xs', radiusClass)}
      >
        Showcase
      </Button>
    </div>
  );

  const navAnchorsSlot = (
    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
      <span className="hover:text-foreground transition-colors cursor-pointer inline-flex items-center gap-1">
        GitHub <ExternalLink className="size-2.5 opacity-60" />
      </span>
      <span className="hover:text-foreground transition-colors cursor-pointer inline-flex items-center gap-1">
        Discord <ExternalLink className="size-2.5 opacity-60" />
      </span>
    </div>
  );

  const sidebarTreeSlot = (
    <div className={cn('space-y-4 text-xs transition-all', sidebarCollapsed && 'hidden')}>
      {/* Introduction */}
      <div>
        <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider">Introduction</div>
        <div className="mt-1 space-y-0.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveNavId('overview')}
            className={cn(
              'justify-start gap-2 w-full h-8 px-2 text-xs font-normal',
              activeNavId === 'overview'
                ? 'bg-primary/10 text-primary font-semibold hover:bg-primary/15'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <BookOpen className="size-3.5 shrink-0" />
            <span>Overview</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveNavId('quickstart')}
            className={cn(
              'justify-start gap-2 w-full h-8 px-2 text-xs font-normal',
              activeNavId === 'quickstart'
                ? 'bg-primary/10 text-primary font-semibold hover:bg-primary/15'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Rocket className="size-3.5 shrink-0" />
            <span>Quick Start</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveNavId('themes')}
            className={cn(
              'justify-start gap-2 w-full h-8 px-2 text-xs font-normal',
              activeNavId === 'themes'
                ? 'bg-primary/10 text-primary font-semibold hover:bg-primary/15'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Sparkles className="size-3.5 shrink-0" />
            <span>Themes</span>
          </Button>
        </div>
      </div>

      {/* Writing */}
      <div>
        <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider">Writing</div>
        <div className="mt-1 space-y-0.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveNavId('markdown')}
            className={cn(
              'justify-start gap-2 w-full h-8 px-2 text-xs font-normal',
              activeNavId === 'markdown'
                ? 'bg-primary/10 text-primary font-semibold hover:bg-primary/15'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Layers className="size-3.5 shrink-0" />
            <span>Markdown</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveNavId('search')}
            className={cn(
              'justify-start gap-2 w-full h-8 px-2 text-xs font-normal',
              activeNavId === 'search'
                ? 'bg-primary/10 text-primary font-semibold hover:bg-primary/15'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Search className="size-3.5 shrink-0" />
            <span>Search</span>
          </Button>
        </div>
      </div>

      {/* Components */}
      <div>
        <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider">Components</div>
        <div className="mt-1 space-y-0.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveNavId('callout')}
            className={cn(
              'justify-start gap-2 w-full h-8 px-2 text-xs font-normal',
              activeNavId === 'callout'
                ? 'bg-primary/10 text-primary font-semibold hover:bg-primary/15'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Folder className="size-3.5 shrink-0" />
            <span>Callout</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveNavId('cards')}
            className={cn(
              'justify-start gap-2 w-full h-8 px-2 text-xs font-normal',
              activeNavId === 'cards'
                ? 'bg-primary/10 text-primary font-semibold hover:bg-primary/15'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Folder className="size-3.5 shrink-0" />
            <span>Cards</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveNavId('tabs')}
            className={cn(
              'justify-start gap-2 w-full h-8 px-2 text-xs font-normal',
              activeNavId === 'tabs' ? 'bg-primary/10 text-primary font-semibold hover:bg-primary/15' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Folder className="size-3.5 shrink-0" />
            <span>Tabs</span>
          </Button>
        </div>
      </div>
    </div>
  );

  // Dynamic Content Slot based on selected navigation item
  const contentSlot = (
    <div className="space-y-6 max-w-3xl">
      {/* ── OVERVIEW PAGE ── */}
      {activeNavId === 'overview' && (
        <>
          <div>
            <h1 id="overview" className="text-2xl font-bold tracking-tight text-foreground scroll-m-4">
              Overview
            </h1>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Live documentation architecture preview with interactive component customization.
            </p>
          </div>

          <div className="space-y-3">
            <h2 id="introduction" className="text-lg font-semibold tracking-tight text-foreground scroll-m-4">
              Introduction
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This preview reflects your active documentation theme. Navigate pages in the sidebar or customize cards, tabs, and callouts in the
              interactive table below to see changes in real-time.
            </p>
          </div>

          {/* Feature Cards Grid with data-theme-component="card" */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Card
              data-theme-component="card"
              size="sm"
              role="button"
              tabIndex={0}
              onClick={() => setActiveNavId('quickstart')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveNavId('quickstart');
                }
              }}
              className="group/card cursor-pointer transition-all hover:border-primary/50"
            >
              <CardHeader className="p-4 gap-1">
                <CardTitle className="flex items-center gap-2 text-primary text-sm font-semibold">
                  <Rocket className="size-4" />
                  <span>Quick Start</span>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">Create your first docs site in minutes.</CardDescription>
              </CardHeader>
            </Card>
            <Card
              data-theme-component="card"
              size="sm"
              role="button"
              tabIndex={0}
              onClick={() => setActiveNavId('themes')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveNavId('themes');
                }
              }}
              className="group/card cursor-pointer transition-all hover:border-primary/50"
            >
              <CardHeader className="p-4 gap-1">
                <CardTitle className="flex items-center gap-2 text-primary text-sm font-semibold">
                  <Sparkles className="size-4" />
                  <span>Themes</span>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">Customize colors, typography, and layout settings.</CardDescription>
              </CardHeader>
            </Card>
          </div>

          {/* Installation block with tabs & code */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 id="installation" className="text-sm font-semibold tracking-tight text-foreground scroll-m-4">
                Installation
              </h3>
              <Button variant="ghost" size="xs" onClick={handleCopy} className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground">
                <Copy className="size-3" />
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Install the packages with your package manager:</p>

            <Tabs value={codeTab} onValueChange={(val) => setCodeTab(val as 'npm' | 'pnpm' | 'yarn')} className="space-y-2">
              <TabsList data-theme-component="tabs-list" density="compact" className="bg-transparent p-0">
                {(['npm', 'pnpm', 'yarn'] as const).map((tab) => (
                  <TabsTrigger
                    key={tab}
                    value={tab}
                    data-theme-component="tab"
                    data-state={codeTab === tab ? 'active' : 'inactive'}
                    className="cursor-pointer font-medium text-xs transition-colors"
                  >
                    {tab}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value={codeTab} data-theme-component="tab-panel">
                <div
                  data-theme-component="code"
                  className="rounded-lg border border-border/70 p-3 font-mono text-xs text-foreground bg-muted/30 select-all transition-all"
                >
                  <code>{codeSnippets[codeTab]}</code>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Callout */}
          <Alert
            data-theme-component="callout"
            role="note"
            className="my-4 transition-all"
            style={
              {
                '--callout-color': 'var(--theme-info, #1f63c4)',
                '--callout-border': 'color-mix(in oklab, var(--theme-info, #1f63c4) 38%, transparent)',
                '--callout-bg': 'color-mix(in oklab, var(--theme-info, #1f63c4) 10%, transparent)',
              } as React.CSSProperties
            }
          >
            <Info className="size-4 shrink-0 text-primary" aria-hidden />
            <AlertTitle className="font-semibold text-xs mb-0.5">Live Component Synchronization</AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground leading-relaxed">
              Changes made in the interactive table below reflect immediately in this preview.
            </AlertDescription>
          </Alert>

          {/* Interactive Properties Table Demo */}
          <div className="space-y-2 pb-6">
            <h3 id="theme-configuration" className="text-sm font-semibold tracking-tight text-foreground scroll-m-4">
              Theme Configuration
            </h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Component</TableHead>
                  <TableHead>Current Setting</TableHead>
                  <TableHead>Visual Style</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-mono text-xs">cards</TableCell>
                  <TableCell className="font-mono text-xs">{resolvedTheme.components.cards}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">Bordered / Lifted / Flat surface</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono text-xs">tabs</TableCell>
                  <TableCell className="font-mono text-xs">{resolvedTheme.components.tabs}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">Underline / Pills / Boxed tabs</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono text-xs">callouts</TableCell>
                  <TableCell className="font-mono text-xs">{resolvedTheme.components.callouts}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">Soft / Outline / Solid style</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono text-xs">codeBlocks</TableCell>
                  <TableCell className="font-mono text-xs">{resolvedTheme.components.codeBlocks}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">System / Dim / Vivid syntax theme</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono text-xs">tables</TableCell>
                  <TableCell className="font-mono text-xs">{resolvedTheme.components.tables}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">Lines / Rows / Cards layout</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* ── CARDS SHOWCASE PAGE ── */}
      {activeNavId === 'cards' && (
        <>
          <div>
            <h1 id="cards-component" className="text-2xl font-bold tracking-tight text-foreground scroll-m-4">
              Cards Component
            </h1>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Display links, navigational hubs, or feature cards with style:{' '}
              <code className="font-mono text-primary">{resolvedTheme.components.cards}</code>.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Card
              data-theme-component="card"
              size="sm"
              role="button"
              tabIndex={0}
              onClick={() => setActiveNavId('quickstart')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveNavId('quickstart');
                }
              }}
              className="group/card cursor-pointer transition-all hover:border-primary/50"
            >
              <CardHeader className="p-4 gap-1">
                <CardTitle className="flex items-center gap-2 text-primary text-sm font-semibold">
                  <Rocket className="size-4" />
                  <span>Quick Start</span>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">Get started building your documentation site.</CardDescription>
              </CardHeader>
            </Card>
            <Card
              data-theme-component="card"
              size="sm"
              role="button"
              tabIndex={0}
              onClick={() => setActiveNavId('themes')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveNavId('themes');
                }
              }}
              className="group/card cursor-pointer transition-all hover:border-primary/50"
            >
              <CardHeader className="p-4 gap-1">
                <CardTitle className="flex items-center gap-2 text-primary text-sm font-semibold">
                  <Sparkles className="size-4" />
                  <span>Theme Presets</span>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">Select from Harbor, Manuscript, or Signal presets.</CardDescription>
              </CardHeader>
            </Card>
            <Card
              data-theme-component="card"
              size="sm"
              role="button"
              tabIndex={0}
              onClick={() => setActiveNavId('tabs')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveNavId('tabs');
                }
              }}
              className="group/card cursor-pointer transition-all hover:border-primary/50"
            >
              <CardHeader className="p-4 gap-1">
                <CardTitle className="flex items-center gap-2 text-primary text-sm font-semibold">
                  <Layers className="size-4" />
                  <span>Code & Tabs</span>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">Preview tab styles in underline, pills, or boxed.</CardDescription>
              </CardHeader>
            </Card>
            <Card
              data-theme-component="card"
              size="sm"
              role="button"
              tabIndex={0}
              onClick={() => setActiveNavId('callout')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveNavId('callout');
                }
              }}
              className="group/card cursor-pointer transition-all hover:border-primary/50"
            >
              <CardHeader className="p-4 gap-1">
                <CardTitle className="flex items-center gap-2 text-primary text-sm font-semibold">
                  <Info className="size-4" />
                  <span>Callouts</span>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">Notice and admonition components.</CardDescription>
              </CardHeader>
            </Card>
          </div>

          <Alert
            data-theme-component="callout"
            role="note"
            className="my-4 transition-all"
            style={
              {
                '--callout-color': 'var(--theme-info, #1f63c4)',
                '--callout-border': 'color-mix(in oklab, var(--theme-info, #1f63c4) 38%, transparent)',
                '--callout-bg': 'color-mix(in oklab, var(--theme-info, #1f63c4) 10%, transparent)',
              } as React.CSSProperties
            }
          >
            <Lightbulb className="size-4 shrink-0 text-primary" aria-hidden />
            <AlertTitle id="card-style-modes" className="font-semibold text-xs mb-0.5 scroll-m-4">
              Card Style Modes
            </AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground leading-relaxed">
              Use <code>Props &gt; components &gt; cards</code> in the table below to toggle between <strong>bordered</strong>,{' '}
              <strong>lifted</strong>, and <strong>flat</strong> cards.
            </AlertDescription>
          </Alert>
        </>
      )}

      {/* ── TABS SHOWCASE PAGE ── */}
      {activeNavId === 'tabs' && (
        <>
          <div>
            <h1 id="tabs-component" className="text-2xl font-bold tracking-tight text-foreground scroll-m-4">
              Tabs Component
            </h1>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Switch between languages, packages, or options. Active style:{' '}
              <code className="font-mono text-primary">{resolvedTheme.components.tabs}</code>.
            </p>
          </div>

          <Tabs value={codeTab} onValueChange={(val) => setCodeTab(val as 'npm' | 'pnpm' | 'yarn')} className="space-y-4">
            <TabsList data-theme-component="tabs-list" density="compact" className="bg-transparent p-0">
              {(['npm', 'pnpm', 'yarn'] as const).map((tab) => (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  data-theme-component="tab"
                  data-state={codeTab === tab ? 'active' : 'inactive'}
                  className="cursor-pointer font-medium text-xs transition-colors"
                >
                  {tab}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value={codeTab} data-theme-component="tab-panel">
              <div
                data-theme-component="code"
                className="rounded-lg border border-border/70 p-4 font-mono text-xs text-foreground bg-muted/30 select-all transition-all"
              >
                <code>{codeSnippets[codeTab]}</code>
              </div>
            </TabsContent>
          </Tabs>

          <Alert
            data-theme-component="callout"
            role="note"
            className="my-4 transition-all"
            style={
              {
                '--callout-color': 'var(--theme-info, #1f63c4)',
                '--callout-border': 'color-mix(in oklab, var(--theme-info, #1f63c4) 38%, transparent)',
                '--callout-bg': 'color-mix(in oklab, var(--theme-info, #1f63c4) 10%, transparent)',
              } as React.CSSProperties
            }
          >
            <Info className="size-4 shrink-0 text-primary" aria-hidden />
            <AlertTitle id="tab-variations" className="font-semibold text-xs mb-0.5 scroll-m-4">
              Tab Variations
            </AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground leading-relaxed">
              Change <code>Props &gt; components &gt; tabs</code> below to preview <strong>underline</strong>, <strong>pills</strong>, or{' '}
              <strong>boxed</strong> tabs.
            </AlertDescription>
          </Alert>
        </>
      )}

      {/* ── CALLOUT SHOWCASE PAGE ── */}
      {activeNavId === 'callout' && (
        <>
          <div>
            <h1 id="callout-component" className="text-2xl font-bold tracking-tight text-foreground scroll-m-4">
              Callout Component
            </h1>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Admonition boxes for highlights, warnings, and tips. Active style:{' '}
              <code className="font-mono text-primary">{resolvedTheme.components.callouts}</code>.
            </p>
          </div>

          <div className="space-y-3">
            {/* Info Callout */}
            <Alert
              variant="info"
              data-theme-component="callout"
              role="note"
              className="transition-all"
              style={
                {
                  '--callout-color': 'var(--theme-info, #1f63c4)',
                  '--callout-border': 'color-mix(in oklab, var(--theme-info, #1f63c4) 38%, transparent)',
                  '--callout-bg': 'color-mix(in oklab, var(--theme-info, #1f63c4) 10%, transparent)',
                } as React.CSSProperties
              }
            >
              <Info className="size-4 shrink-0 text-primary" aria-hidden />
              <AlertTitle id="callout-note" className="font-semibold text-xs mb-0.5 scroll-m-4">
                Note
              </AlertTitle>
              <AlertDescription className="text-xs text-muted-foreground leading-relaxed">
                This is an informative note highlighting standard documentation recommendations.
              </AlertDescription>
            </Alert>

            {/* Tip Callout */}
            <Alert
              variant="success"
              data-theme-component="callout"
              role="note"
              className="transition-all"
              style={
                {
                  '--callout-color': 'var(--theme-success, #12744a)',
                  '--callout-border': 'color-mix(in oklab, var(--theme-success, #12744a) 38%, transparent)',
                  '--callout-bg': 'color-mix(in oklab, var(--theme-success, #12744a) 10%, transparent)',
                } as React.CSSProperties
              }
            >
              <Lightbulb className="size-4 shrink-0 text-emerald-500" aria-hidden />
              <AlertTitle id="callout-tip" className="font-semibold text-xs mb-0.5 scroll-m-4">
                Tip
              </AlertTitle>
              <AlertDescription className="text-xs text-muted-foreground leading-relaxed">
                Toggle callout styles in <code>Props &gt; components &gt; callouts</code> to test soft, outline, and solid styles.
              </AlertDescription>
            </Alert>

            {/* Warning Callout */}
            <Alert
              variant="warning"
              data-theme-component="callout"
              role="note"
              className="transition-all"
              style={
                {
                  '--callout-color': 'var(--theme-warning, #96560a)',
                  '--callout-border': 'color-mix(in oklab, var(--theme-warning, #96560a) 38%, transparent)',
                  '--callout-bg': 'color-mix(in oklab, var(--theme-warning, #96560a) 10%, transparent)',
                } as React.CSSProperties
              }
            >
              <AlertTriangle className="size-4 shrink-0 text-amber-500" aria-hidden />
              <AlertTitle id="callout-warning" className="font-semibold text-xs mb-0.5 scroll-m-4">
                Warning
              </AlertTitle>
              <AlertDescription className="text-xs text-muted-foreground leading-relaxed">
                Check contrast indicators when editing custom palette colors to ensure accessibility compliance.
              </AlertDescription>
            </Alert>
          </div>
        </>
      )}

      {/* ── QUICK START PAGE ── */}
      {activeNavId === 'quickstart' && (
        <>
          <div>
            <h1 id="quickstart" className="text-2xl font-bold tracking-tight text-foreground scroll-m-4">
              Quick Start
            </h1>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">Step-by-step guide to get your documentation library running.</p>
          </div>

          <div className="space-y-4">
            <div className="flex gap-3">
              <Badge className="size-6 p-0 font-bold rounded-full justify-center shrink-0">1</Badge>
              <div>
                <h3 id="install-dependencies" className="font-semibold text-sm text-foreground scroll-m-4">
                  Install Dependencies
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Run the package manager command below:</p>
                <div
                  data-theme-component="code"
                  className="mt-2 rounded-lg border border-border/70 p-2.5 font-mono text-xs text-foreground bg-muted/30"
                >
                  <code>pnpm add fumadocs-ui fumadocs-core</code>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Badge className="size-6 p-0 font-bold rounded-full justify-center shrink-0">2</Badge>
              <div>
                <h3 id="select-layout" className="font-semibold text-sm text-foreground scroll-m-4">
                  Select Documentation Layout
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Pick from standard Docs, Frosted Glass, Academic Notebook, Flux, or Spacious layouts.
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── THEMES PAGE ── */}
      {activeNavId === 'themes' && (
        <>
          <div>
            <h1 id="themes-and-styling" className="text-2xl font-bold tracking-tight text-foreground scroll-m-4">
              Themes & Styling
            </h1>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Active preset: <strong className="text-primary capitalize">{resolvedTheme.id}</strong>.
            </p>
          </div>

          <div className="space-y-2 mt-4">
            <h3 id="color-tokens" className="text-sm font-semibold tracking-tight text-foreground scroll-m-4">
              Color Tokens
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Card size="sm" className="p-3">
                <span className="text-xs font-medium text-muted-foreground">Canvas</span>
                <p className="font-mono text-xs font-semibold mt-1">{resolvedTheme.colors[appearance === 'dark' ? 'dark' : 'light'].canvas}</p>
              </Card>
              <Card size="sm" className="p-3">
                <span className="text-xs font-medium text-muted-foreground">Accent</span>
                <p className="font-mono text-xs font-semibold mt-1 text-primary">
                  {resolvedTheme.colors[appearance === 'dark' ? 'dark' : 'light'].accent}
                </p>
              </Card>
              <Card size="sm" className="p-3">
                <span className="text-xs font-medium text-muted-foreground">Surface</span>
                <p className="font-mono text-xs font-semibold mt-1">{resolvedTheme.colors[appearance === 'dark' ? 'dark' : 'light'].surface}</p>
              </Card>
            </div>
          </div>
        </>
      )}

      {/* ── MARKDOWN & TYPOGRAPHY PAGE ── */}
      {activeNavId === 'markdown' && (
        <>
          <div>
            <h1 id="markdown-and-typography" className="text-2xl font-bold tracking-tight text-foreground scroll-m-4">
              Markdown & Typography
            </h1>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Typography and table rendering with density: <code className="font-mono text-primary">{resolvedTheme.layout.density}</code>.
            </p>
          </div>

          <div className="typeset space-y-4">
            <h3 id="syntax-reference" className="text-sm font-semibold tracking-tight text-foreground scroll-m-4">
              Syntax Reference
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Documentation pages render Markdown with clean typographic hierarchy, responsive tables, and syntax-highlighted code.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Syntax</TableHead>
                  <TableHead>Element</TableHead>
                  <TableHead>Preview</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-mono text-xs"># Heading</TableCell>
                  <TableCell className="text-xs">h1</TableCell>
                  <TableCell className="text-xs">Top-level heading</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono text-xs">**bold**</TableCell>
                  <TableCell className="text-xs">strong</TableCell>
                  <TableCell className="text-xs">
                    <strong>Bold text</strong>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono text-xs">&gt; Quote</TableCell>
                  <TableCell className="text-xs">blockquote</TableCell>
                  <TableCell className="text-xs">Quoted callout</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* ── SEARCH PAGE ── */}
      {activeNavId === 'search' && (
        <>
          <div>
            <h1 id="search-dialog" className="text-2xl font-bold tracking-tight text-foreground scroll-m-4">
              Search Dialog
            </h1>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">Full-text Tantivy search indexing documentation pages and headers.</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-xl border border-border p-3 bg-muted/20">
              <Search className="size-4 text-muted-foreground shrink-0" />
              <Input
                density="compact"
                type="text"
                placeholder="Type to search documentation..."
                className="h-7 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0 placeholder:text-muted-foreground"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <h3 id="search-results" className="text-sm font-semibold tracking-tight text-foreground scroll-m-4">
              Search Results
            </h3>
            <Card className="divide-y divide-border/60 overflow-hidden text-xs py-0">
              <button
                type="button"
                className="w-full text-left p-3 hover:bg-muted/40 cursor-pointer transition-colors"
                onClick={() => setActiveNavId('overview')}
              >
                <div className="font-semibold text-foreground">Overview</div>
                <div className="text-muted-foreground mt-0.5">Introduction to documentation layout architecture</div>
              </button>
              <button
                type="button"
                className="w-full text-left p-3 hover:bg-muted/40 cursor-pointer transition-colors"
                onClick={() => setActiveNavId('quickstart')}
              >
                <div className="font-semibold text-foreground">Quick Start</div>
                <div className="text-muted-foreground mt-0.5">Creating your first documentation site</div>
              </button>
              <button
                type="button"
                className="w-full text-left p-3 hover:bg-muted/40 cursor-pointer transition-colors"
                onClick={() => setActiveNavId('cards')}
              >
                <div className="font-semibold text-foreground">Components &gt; Cards</div>
                <div className="text-muted-foreground mt-0.5">Visual cards in lifted, bordered, or flat styles</div>
              </button>
            </Card>
          </div>
        </>
      )}
    </div>
  );

  const headerStyle = currentLayout.header ?? 'inline';
  const headerElement = useMemo(() => {
    const isFloating = headerStyle === 'floating';
    const isStacked = headerStyle === 'stacked';

    if (isFloating) {
      return (
        <header
          data-theme-region="header"
          data-theme-header="floating"
          data-theme-density={density}
          data-theme-radius={radius}
          data-transparent-mode={headerTransparentMode}
          className={cn(
            'mx-3 sm:mx-6 my-2.5 transition-all shadow-md backdrop-blur-md border border-border/70 flex items-center justify-between',
            densityStyles.headerHeight,
            densityStyles.padding,
            densityStyles.gap,
            cardRadiusClass,
            isNavTransparent ? 'bg-transparent border-border/40 shadow-none' : 'bg-background/85',
          )}
        >
          <div className="flex items-center gap-3">
            {brandSlot}
            {navLinksSlot}
          </div>
          <div className="flex items-center gap-2">
            {searchButtonSlot}
            {toolsSlot}
          </div>
        </header>
      );
    }

    if (isStacked) {
      return (
        <header
          data-theme-region="header"
          data-theme-header="stacked"
          data-theme-density={density}
          data-theme-radius={radius}
          data-transparent-mode={headerTransparentMode}
          className={cn(
            'flex flex-col border-b border-border/60 transition-all',
            isNavTransparent ? 'bg-transparent border-transparent' : 'bg-background/85 backdrop-blur-xs',
          )}
        >
          <div className={cn('flex items-center justify-between', densityStyles.headerHeight, densityStyles.padding, densityStyles.gap)}>
            {brandSlot}
            <div className="flex-1 max-w-xs mx-4 hidden sm:block">{searchFullSlot}</div>
            <div className="flex items-center gap-2">
              <div className="sm:hidden">{searchButtonSlot}</div>
              {toolsSlot}
            </div>
          </div>
          <div
            className={cn('flex items-center gap-4 border-t border-border/40 bg-muted/20 text-xs overflow-x-auto', densityStyles.padding, 'py-1.5')}
          >
            {navLinksSlot}
          </div>
        </header>
      );
    }

    // Default 'inline' header
    return (
      <header
        data-theme-region="header"
        data-theme-header="inline"
        data-theme-density={density}
        data-theme-radius={radius}
        data-transparent-mode={headerTransparentMode}
        className={cn(
          'flex items-center justify-between border-b border-border/60 transition-all',
          densityStyles.headerHeight,
          densityStyles.padding,
          densityStyles.gap,
          isNavTransparent ? 'bg-transparent border-b-transparent' : 'bg-background/85 backdrop-blur-xs',
        )}
      >
        <div className="flex items-center gap-4">
          {brandSlot}
          {navLinksSlot}
        </div>
        <div className="flex items-center gap-2">
          {searchButtonSlot}
          {toolsSlot}
        </div>
      </header>
    );
  }, [
    headerStyle,
    density,
    radius,
    headerTransparentMode,
    densityStyles,
    cardRadiusClass,
    isNavTransparent,
    brandSlot,
    navLinksSlot,
    searchFullSlot,
    searchButtonSlot,
    toolsSlot,
  ]);

  const effectiveTheme: ResolvedTheme = useMemo(
    () => ({
      ...resolvedTheme,
      colors: resolvedColors ?? resolvedTheme.colors,
      layout: resolvedLayout ?? resolvedTheme.layout,
      components: resolvedComponents ?? resolvedTheme.components,
    }),
    [resolvedTheme, resolvedColors, resolvedLayout, resolvedComponents],
  );

  const draftThemeVariables = useMemo<CSSProperties>(() => {
    const activeAppearance = appearance === 'dark' ? 'dark' : 'light';
    const tokens = resolvedColors ? resolvedColors[activeAppearance] : resolvedTheme.colors[activeAppearance];
    const layout = currentLayout;

    const baseVariables = projectThemeVariables(effectiveConfig, activeAppearance);
    const baseStyle = projectThemeStyle(effectiveConfig);

    return {
      ...baseVariables,
      ...baseStyle,
      ...Object.fromEntries(Object.entries(tokens).map(([key, value]) => [THEME_TOKEN_CSS_VARIABLES[key as ThemeColorKey], value])),
      '--theme-primary': tokens.accent,
      '--primary': tokens.accent,
      '--theme-background': tokens.canvas,
      '--background': tokens.canvas,
      '--theme-foreground': tokens.foreground,
      '--foreground': tokens.foreground,
      '--theme-border': tokens.border,
      '--border': tokens.border,
      '--theme-card': tokens.surface,
      '--card': tokens.surface,
      '--theme-muted': tokens.muted,
      '--muted': tokens.muted,
      '--theme-accent': tokens.accent,
      '--accent': tokens.accent,
      '--radius': layout.radius === 'pill' ? '9999px' : layout.radius === 'sharp' ? '0px' : '0.5rem',
      '--theme-density': layout.density === 'compact' ? '0.86' : layout.density === 'relaxed' ? '1.14' : '1',
    };
  }, [appearance, resolvedColors, resolvedTheme, currentLayout, effectiveConfig]);

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
              {activeNavId !== 'overview' && `/${activeNavId}`}
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
          <div className={cn('overflow-y-auto', isFullscreen ? 'flex-1 min-h-0 size-full' : 'min-h-[340px] max-h-[420px]')}>
            {(() => {
              const previewHeadings: TocHeading[] = PREVIEW_HEADINGS_BY_PAGE[activeNavId] ?? PREVIEW_HEADINGS_BY_PAGE.overview ?? [];
              const tableOfContentsSlot = (
                <TableOfContents
                  headings={previewHeadings}
                  style={resolvedLayout?.tocStyle ?? 'clerk'}
                  depth={resolvedLayout?.tocDepth ?? 3}
                  label="On this page"
                />
              );
              const tocPopoverSlot = (
                <TOCPopover
                  headings={previewHeadings}
                  style={resolvedLayout?.tocStyle ?? 'clerk'}
                  depth={resolvedLayout?.tocDepth ?? 3}
                  label="On this page"
                />
              );
              const pageContent = template.PageLayout({
                article: contentSlot,
                tableOfContents: tableOfContentsSlot,
                tocPopover: tocPopoverSlot,
                breadcrumb: (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
                    <span>Docs</span>
                    <span>/</span>
                    <span className="text-foreground font-medium capitalize">{activeNavId}</span>
                  </div>
                ),
              });
              return template.ReaderLayout({
                header: headerElement,
                navigation: sidebarTreeSlot,
                content: pageContent,
                brand: brandSlot,
                searchFull: searchFullSlot,
                searchButton: searchButtonSlot,
                tools: toolsSlot,
                navLinks: navLinksSlot,
                navTabs: navTabsSlot,
                navAnchors: navAnchorsSlot,
                sidebarTree: sidebarTreeSlot,
              });
            })()}
          </div>
        </DocumentationThemeProvider>
      </div>
    </div>
  );
}
