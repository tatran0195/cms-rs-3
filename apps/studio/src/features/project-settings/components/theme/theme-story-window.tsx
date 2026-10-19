import { cn } from '@cms/design-system/lib/utils';
import type { DocsLayoutId, ResolvedTheme } from '@cms/shared/themes';
import { DocumentationThemeProvider, projectThemeStyle, projectThemeVariables } from '@cms/site';
import { getDocsLayoutTemplate } from '@cms/site/layouts';
import type { ProjectConfig } from '@cms/validators';
import { BookOpen, Copy, Folder, Layers, Moon, Rocket, Search, Sparkles, Sun } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FumadocsLayoutOptions } from './types';

export interface ThemeStoryWindowProps {
  layoutId: DocsLayoutId;
  effectiveConfig: ProjectConfig;
  resolvedTheme: ResolvedTheme;
  appearance: 'light' | 'dark';
  options: FumadocsLayoutOptions;
  className?: string;
}

export function ThemeStoryWindow({ layoutId, effectiveConfig, resolvedTheme, appearance, options, className }: ThemeStoryWindowProps) {
  const [copied, setCopied] = useState(false);
  const [codeTab, setCodeTab] = useState<'npm' | 'pnpm' | 'yarn'>('npm');
  const [activeNavId, setActiveNavId] = useState('overview');

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

  // Mock slots corresponding to layout options
  const brandSlot = (
    <div className="flex items-center gap-2">
      <span className="size-6 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center text-primary font-bold text-xs shadow-2xs">
        {options.nav.title.charAt(0) || 'D'}
      </span>
      <span className="font-semibold text-sm tracking-tight text-foreground">{options.nav.title}</span>
    </div>
  );

  const searchFullSlot = options.searchToggle.enabled ? (
    <div className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg border border-border/70 bg-background/80 text-muted-foreground text-xs shadow-2xs cursor-pointer hover:border-primary/50 transition-colors">
      <Search className="size-3.5" />
      <span className="flex-1">Search...</span>
      <kbd className="px-1.5 py-0.5 rounded border border-border/80 bg-muted text-[10px] font-mono">Ctrl K</kbd>
    </div>
  ) : null;

  const searchButtonSlot = options.searchToggle.enabled ? (
    <button
      type="button"
      className="p-1.5 rounded-lg border border-border/70 bg-background/80 text-muted-foreground hover:text-foreground shadow-2xs cursor-pointer"
      title="Search documentation"
    >
      <Search className="size-3.5" />
    </button>
  ) : null;

  const toolsSlot = (
    <div className="flex items-center gap-1.5">
      {options.themeSwitch.enabled && (
        <span
          className="p-1.5 rounded-lg border border-border/70 bg-background/80 text-muted-foreground hover:text-foreground shadow-2xs inline-flex items-center"
          title="Toggle Theme"
        >
          {appearance === 'dark' ? <Sun className="size-3.5 text-amber-400" /> : <Moon className="size-3.5" />}
        </span>
      )}
    </div>
  );

  const navLinksSlot = (
    <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
      <span className="text-foreground hover:text-primary transition-colors cursor-pointer">Docs</span>
      <span className="hover:text-primary transition-colors cursor-pointer">Showcase</span>
      <span className="hover:text-primary transition-colors cursor-pointer">Blog</span>
    </div>
  );

  const navTabsSlot = (
    <div className="flex items-center gap-1">
      <span className="px-3 py-1 rounded-md text-xs font-semibold bg-primary text-primary-foreground shadow-2xs">Framework</span>
      <span className="px-3 py-1 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted/60 transition-colors cursor-pointer">
        Showcase
      </span>
    </div>
  );

  const navAnchorsSlot = (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="hover:text-foreground transition-colors cursor-pointer">GitHub</span>
      <span className="hover:text-foreground transition-colors cursor-pointer">Discord</span>
    </div>
  );

  const sidebarTreeSlot = (
    <div className="space-y-4 text-xs">
      <div>
        <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider">Introduction</div>
        <div className="mt-1 space-y-0.5">
          <button
            type="button"
            onClick={() => setActiveNavId('overview')}
            className={cn(
              'flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-start transition-colors cursor-pointer',
              activeNavId === 'overview'
                ? 'bg-primary/10 text-primary font-semibold'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
          >
            <BookOpen className="size-3.5" />
            <span>Overview</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveNavId('quickstart')}
            className={cn(
              'flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-start transition-colors cursor-pointer',
              activeNavId === 'quickstart'
                ? 'bg-primary/10 text-primary font-semibold'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
          >
            <Rocket className="size-3.5" />
            <span>Quick Start</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveNavId('themes')}
            className={cn(
              'flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-start transition-colors cursor-pointer',
              activeNavId === 'themes' ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
          >
            <Sparkles className="size-3.5" />
            <span>Themes</span>
          </button>
        </div>
      </div>

      <div>
        <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider">Writing</div>
        <div className="mt-1 space-y-0.5">
          <span className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer">
            <Layers className="size-3.5" />
            <span>Markdown</span>
          </span>
          <span className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer">
            <Search className="size-3.5" />
            <span>Search</span>
          </span>
        </div>
      </div>

      <div>
        <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider">Components</div>
        <div className="mt-1 space-y-0.5">
          <span className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer">
            <Folder className="size-3.5" />
            <span>Callout</span>
          </span>
          <span className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer">
            <Folder className="size-3.5" />
            <span>Cards</span>
          </span>
          <span className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer">
            <Folder className="size-3.5" />
            <span>Tabs</span>
          </span>
        </div>
      </div>
    </div>
  );

  const contentSlot = (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Overview</h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">An introduction to the documentation architecture.</p>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Introduction</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          This is a live preview of the layout. Open the pages in sidebar, search for content, or switch the theme, it works like your docs site.
        </p>
      </div>

      {/* Feature Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-border/80 bg-card p-4 hover:border-primary/40 transition-colors cursor-pointer shadow-2xs">
          <div className="flex items-center gap-2 text-primary font-semibold text-sm">
            <Rocket className="size-4" />
            <span>Quick Start</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Create your first docs site in minutes.</p>
        </div>
        <div className="rounded-xl border border-border/80 bg-card p-4 hover:border-primary/40 transition-colors cursor-pointer shadow-2xs">
          <div className="flex items-center gap-2 text-primary font-semibold text-sm">
            <Sparkles className="size-4" />
            <span>Themes</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Customize the colors and the look of your site.</p>
        </div>
      </div>

      {/* Installation block with tabs */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">Installation</h3>
        <p className="text-xs text-muted-foreground">Install the packages with your package manager:</p>

        <div className="rounded-xl border border-border bg-card/70 overflow-hidden shadow-2xs">
          <div className="flex items-center justify-between px-3 border-b border-border/70 bg-muted/40 text-xs">
            <div className="flex items-center gap-2">
              {(['npm', 'pnpm', 'yarn'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setCodeTab(tab)}
                  className={cn(
                    'py-1.5 px-2 font-mono transition-colors border-b-2 -mb-px cursor-pointer',
                    codeTab === tab
                      ? 'border-primary text-foreground font-semibold'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 py-1 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <Copy className="size-3" />
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <div className="p-3 bg-muted/20 font-mono text-xs text-foreground select-all">
            <code>{codeSnippets[codeTab]}</code>
          </div>
        </div>
      </div>

      {/* Usage block */}
      <div className="space-y-2 pb-6">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">Usage</h3>
        <p className="text-xs text-muted-foreground">Wrap your pages with the layout, it takes a page tree which is generated from your content.</p>
      </div>
    </div>
  );

  return (
    <div
      className={cn('relative overflow-hidden px-3 pt-4 pb-6 sm:px-6 sm:pt-6 sm:pb-8 bg-[#181615]', className)}
      style={{
        backgroundImage: 'radial-gradient(circle, #e29f372b 1.25px, transparent 1.25px)',
        backgroundSize: '16px 16px',
      }}
    >
      {/* macOS Window Chrome Container */}
      <div className="relative overflow-hidden rounded-xl border border-border/80 bg-background shadow-2xl transition-colors">
        {/* macOS Window Header */}
        <div className="flex h-8.5 items-center justify-between border-b border-border/70 bg-muted/50 px-3.5 backdrop-blur-xs select-none">
          <div className="flex items-center gap-2">
            <span data-window-control="close" className="size-2.5 rounded-full bg-[#ff5f57] border border-black/10 inline-block" />
            <span data-window-control="minimize" className="size-2.5 rounded-full bg-[#febc2e] border border-black/10 inline-block" />
            <span data-window-control="maximize" className="size-2.5 rounded-full bg-[#28c840] border border-black/10 inline-block" />
          </div>
          <div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-background/60 px-2.5 py-0.5 text-[10.5px] font-mono text-muted-foreground">
            <span>https://docs.local/preview/{layoutId}</span>
          </div>
          <div className="size-2.5" />
        </div>

        {/* Live Docs Template Rendering Viewport */}
        <DocumentationThemeProvider
          appearance={appearance}
          className="size-full overflow-hidden text-sm"
          context="studio-preview"
          direction="ltr"
          style={{
            ...projectThemeVariables(effectiveConfig, appearance),
            ...projectThemeStyle(effectiveConfig),
          }}
          theme={resolvedTheme}
        >
          <div className="min-h-[460px] max-h-[580px] overflow-y-auto">
            {template.ReaderLayout({
              header: (
                <div className="flex h-12 items-center justify-between px-4 border-b border-border/60 bg-background/80 backdrop-blur-xs">
                  {brandSlot}
                  {navLinksSlot}
                  <div className="flex items-center gap-2">
                    {searchButtonSlot}
                    {toolsSlot}
                  </div>
                </div>
              ),
              navigation: sidebarTreeSlot,
              content: contentSlot,
              brand: brandSlot,
              searchFull: searchFullSlot,
              searchButton: searchButtonSlot,
              tools: toolsSlot,
              navLinks: navLinksSlot,
              navTabs: navTabsSlot,
              navAnchors: navAnchorsSlot,
              sidebarTree: sidebarTreeSlot,
            })}
          </div>
        </DocumentationThemeProvider>
      </div>
    </div>
  );
}
