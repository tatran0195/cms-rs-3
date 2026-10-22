import { cn } from '@cms/design-system/lib/utils';
import { useT } from '@cms/i18n/react';
import {
  DOCS_LAYOUT_IDS,
  type DocsLayoutId,
  resolveDocsLayout,
  resolveTheme,
  type ThemeConfig,
  type ThemeOwnedProjectConfig,
} from '@cms/shared/themes';
import { DocumentationThemeProvider, projectThemeStyle, projectThemeVariables } from '@cms/site';
import { getDocsLayoutTemplate } from '@cms/site/layouts';
import type { ProjectConfig } from '@cms/validators';
import {
  Book,
  Check,
  Code2,
  Copy,
  Folder,
  Layers,
  Moon,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Rocket,
  Search,
  Server,
  Sparkles,
  Sun,
  Terminal,
} from 'lucide-react';
import { type CSSProperties, useMemo, useState } from 'react';

export interface DocsLayoutSandboxProps {
  currentLayout?: DocsLayoutId;
  onSelectLayout: (layout: DocsLayoutId) => void;
  config?: ProjectConfig;
  theme?: ThemeConfig;
  appearance?: 'light' | 'dark' | 'system';
  className?: string;
}

interface SandboxOptions {
  themeMode: 'light' | 'dark';
  collapsibleSidebar: boolean;
  searchExpanded: boolean;
  tabMode: 'auto' | 'top' | 'sidebar';
}

export function DocsLayoutSandbox({
  currentLayout = 'spacious',
  onSelectLayout,
  config,
  theme,
  appearance = 'light',
  className,
}: DocsLayoutSandboxProps) {
  const t = useT();
  const initialMode = appearance === 'dark' ? 'dark' : 'light';
  const [activeLayout, setActiveLayout] = useState<DocsLayoutId>(resolveDocsLayout(currentLayout));
  const [options, setOptions] = useState<SandboxOptions>({
    themeMode: initialMode,
    collapsibleSidebar: true,
    searchExpanded: true,
    tabMode: 'auto',
  });
  const [codeTab, setCodeTab] = useState<'npm' | 'pnpm' | 'yarn'>('npm');
  const [copied, setCopied] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeNavId, setActiveNavId] = useState<string>('overview');

  // Build effective config by merging props with live sandbox options
  const effectiveConfig: ProjectConfig = useMemo(() => {
    const baseTheme = theme ?? (config?.theme as ThemeConfig | undefined);
    return {
      ...(config ?? {}),
      theme: {
        ...(baseTheme ?? {}),
        layout: {
          ...(baseTheme?.layout ?? {}),
          docsLayout: activeLayout,
        },
      },
      styling: {
        ...(config?.styling ?? {}),
        theme: options.themeMode,
      },
    };
  }, [config, theme, activeLayout, options.themeMode]);

  const resolvedTheme = useMemo(() => resolveTheme(effectiveConfig as ThemeOwnedProjectConfig), [effectiveConfig]);

  const template = getDocsLayoutTemplate(activeLayout);

  const toggleThemeMode = () => {
    setOptions((prev) => ({
      ...prev,
      themeMode: prev.themeMode === 'light' ? 'dark' : 'light',
    }));
  };

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed((prev) => !prev);
  };

  const handleApply = () => {
    onSelectLayout(activeLayout);
  };

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const codeSnippets: Record<'npm' | 'pnpm' | 'yarn', string> = {
    npm: 'npm i @cms/site fumadocs-core',
    pnpm: 'pnpm add @cms/site fumadocs-core',
    yarn: 'yarn add @cms/site fumadocs-core',
  };

  // Mock slots for the sandbox preview
  const brandSlot = (
    <div className="flex items-center gap-2">
      <span className="size-6 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center text-primary font-bold text-xs shadow-2xs">
        F
      </span>
      <span className="font-semibold text-sm tracking-tight text-foreground">Fumadocs</span>
    </div>
  );

  const searchFullSlot = (
    <div className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg border border-border/70 bg-background/80 text-muted-foreground text-xs shadow-2xs cursor-pointer hover:border-primary/50 transition-colors">
      <Search className="size-3.5" />
      <span className="flex-1">Search documentation...</span>
      <kbd className="px-1.5 py-0.5 rounded border border-border/80 bg-muted text-[10px] font-mono">⌘K</kbd>
    </div>
  );

  const searchButtonSlot = (
    <button
      type="button"
      className="grid size-8 place-items-center rounded-lg border border-border/70 bg-card/60 text-muted-foreground hover:text-foreground shadow-2xs cursor-pointer"
      aria-label="Search"
    >
      <Search className="size-3.5" />
    </button>
  );

  const toolsSlot = (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={toggleThemeMode}
        className="grid size-8 place-items-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        aria-label="Toggle Theme"
      >
        {options.themeMode === 'dark' ? <Sun className="size-4 text-amber-400" /> : <Moon className="size-4" />}
      </button>
      <a
        href="https://github.com/fuma-nama/fumadocs"
        target="_blank"
        rel="noopener noreferrer"
        className="grid size-8 place-items-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        aria-label="GitHub"
      >
        <Code2 className="size-4" />
      </a>
    </div>
  );

  const navLinksSlot = (
    <nav className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
      <span className="text-foreground font-semibold hover:text-primary cursor-pointer">Guide</span>
      <span className="hover:text-foreground cursor-pointer">Components</span>
      <span className="hover:text-foreground cursor-pointer">API Reference</span>
    </nav>
  );

  const navTabsSlot = (
    <div className="flex items-center gap-2 text-xs">
      <button type="button" className="px-2.5 py-1 rounded-md transition-colors bg-primary/10 text-primary font-semibold">
        Core Guide
      </button>
      <button type="button" className="px-2.5 py-1 rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-muted/50">
        API Reference
      </button>
      <button type="button" className="px-2.5 py-1 rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-muted/50">
        Configuration
      </button>
    </div>
  );

  const navAnchorsSlot = (
    <div className="mb-3 space-y-1">
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium text-primary bg-primary/10">
        <Book className="size-3.5" />
        <span>Documentation</span>
      </div>
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer">
        <Terminal className="size-3.5" />
        <span>CLI Reference</span>
      </div>
    </div>
  );

  const sidebarTreeSlot = (
    <div className={cn('space-y-3 text-xs', sidebarCollapsed && 'hidden md:hidden')}>
      <div>
        <div className="flex items-center gap-1.5 px-2 py-1 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
          <Folder className="size-3" />
          <span>Framework</span>
        </div>
        <div className="mt-1 space-y-0.5">
          <button
            type="button"
            onClick={() => setActiveNavId('overview')}
            className={cn(
              'flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-start font-medium transition-colors cursor-pointer',
              activeNavId === 'overview'
                ? 'bg-primary/15 text-primary font-semibold'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
            )}
          >
            <Book className="size-3.5 shrink-0" />
            <span>Overview</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveNavId('quick-start')}
            className={cn(
              'flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-start transition-colors cursor-pointer',
              activeNavId === 'quick-start'
                ? 'bg-primary/15 text-primary font-semibold'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
            )}
          >
            <Rocket className="size-3.5 shrink-0" />
            <span>Quick Start</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveNavId('theming')}
            className={cn(
              'flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-start transition-colors cursor-pointer',
              activeNavId === 'theming'
                ? 'bg-primary/15 text-primary font-semibold'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
            )}
          >
            <Palette className="size-3.5 shrink-0" />
            <span>Themes & Layouts</span>
          </button>
        </div>
      </div>
      <div>
        <div className="flex items-center gap-1.5 px-2 py-1 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
          <Server className="size-3" />
          <span>API Reference</span>
        </div>
        <div className="mt-1 space-y-0.5">
          <button
            type="button"
            onClick={() => setActiveNavId('intro')}
            className={cn(
              'flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-start transition-colors cursor-pointer',
              activeNavId === 'intro' ? 'bg-primary/15 text-primary font-semibold' : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
            )}
          >
            <Terminal className="size-3.5 shrink-0" />
            <span>REST API Overview</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveNavId('auth')}
            className={cn(
              'flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-start transition-colors cursor-pointer',
              activeNavId === 'auth' ? 'bg-primary/15 text-primary font-semibold' : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
            )}
          >
            <Layers className="size-3.5 shrink-0" />
            <span>Authentication</span>
          </button>
        </div>
      </div>
    </div>
  );

  // Authentic Fumadocs DemoContent parity matching upstream demo.tsx
  const demoArticleSlot = (
    <div className="space-y-6 text-foreground">
      {/* Title & Description */}
      <div className="space-y-2 border-b border-border/60 pb-5">
        <div className="flex items-center gap-2 text-xs text-primary font-medium">
          <span>Documentation</span>
          <span>/</span>
          <span>Layouts</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{activeLayout.charAt(0).toUpperCase() + activeLayout.slice(1)} Layout</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">{t(`settings.theme.layout.${activeLayout}.description`)}</p>
      </div>

      {/* Feature Callout (with dynamic semantic styling) */}
      <div
        className="rounded-xl border p-4 text-xs leading-relaxed space-y-1.5 shadow-2xs"
        data-theme-component="callout"
        style={
          {
            '--callout-color': 'var(--theme-info, var(--primary))',
            borderColor: 'color-mix(in oklab, var(--theme-info, var(--primary)) 35%, transparent)',
            background: 'color-mix(in oklab, var(--theme-info, var(--primary)) 8%, transparent)',
          } as CSSProperties
        }
      >
        <div className="font-semibold text-primary flex items-center gap-1.5">
          <Sparkles className="size-3.5" />
          <span>Good to know</span>
        </div>
        <p className="text-muted-foreground">
          This preview runs Fumadocs&apos; CSS Grid and slot architecture. Every component reflects your active color palette, typography tokens, and
          layout geometry.
        </p>
      </div>

      {/* Interactive Cards (Quick Start & Themes) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div
          data-theme-component="card"
          className="rounded-xl border border-border/80 bg-card p-4 shadow-2xs hover:border-primary/50 transition cursor-pointer space-y-2"
        >
          <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Rocket className="size-4" />
          </div>
          <div className="font-semibold text-xs text-foreground">Quick Start</div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Create your first docs site in minutes with full Markdown and MDX support.
          </p>
        </div>
        <div
          data-theme-component="card"
          className="rounded-xl border border-border/80 bg-card p-4 shadow-2xs hover:border-primary/50 transition cursor-pointer space-y-2"
        >
          <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Palette className="size-4" />
          </div>
          <div className="font-semibold text-xs text-foreground">Themes & Palettes</div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Customize primary accents, canvas background, surfaces, and syntax code styles.
          </p>
        </div>
      </div>

      {/* Interactive Code Tabs */}
      <div className="space-y-2">
        <div className="text-xs font-semibold text-foreground">Installation</div>
        <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-2xs">
          <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-3 py-1.5">
            <div className="flex items-center gap-1 text-xs">
              {(['npm', 'pnpm', 'yarn'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setCodeTab(tab)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer',
                    codeTab === tab ? 'bg-background text-foreground font-semibold shadow-2xs' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <pre data-theme-component="code" className="p-3.5 font-mono text-[11.5px] text-(--theme-code-foreground) bg-(--theme-code) overflow-x-auto">
            <code>{codeSnippets[codeTab]}</code>
          </pre>
        </div>
      </div>

      {/* Code Snippet Box for Layout */}
      <div className="rounded-xl border border-border/80 bg-muted/50 p-3.5 font-mono text-[11px] text-foreground/90 space-y-1">
        <div className="text-muted-foreground text-[10px]"># Active layout configuration</div>
        <div>theme.layout.docsLayout = &quot;{activeLayout}&quot;</div>
      </div>
    </div>
  );

  const demoTocSlot = (
    <div className="space-y-2.5 text-xs">
      <div className="font-semibold text-foreground uppercase tracking-wider text-[11px]">On this page</div>
      <div className="space-y-1 border-l-2 border-border/60 pl-3">
        <div className="font-medium text-primary cursor-pointer">Overview</div>
        <div className="text-muted-foreground hover:text-foreground cursor-pointer">Good to know</div>
        <div className="text-muted-foreground hover:text-foreground cursor-pointer">Quick Start & Themes</div>
        <div className="text-muted-foreground hover:text-foreground cursor-pointer">Installation Tabs</div>
        <div className="text-muted-foreground hover:text-foreground cursor-pointer">Layout Configuration</div>
      </div>
    </div>
  );

  const demoFooterSlot = (
    <div className="flex items-center justify-between border-t border-border/60 pt-6 text-xs text-muted-foreground">
      <span>Built with Fumadocs Engine</span>
      <span className="text-primary font-medium cursor-pointer">Next: Components →</span>
    </div>
  );

  const contentSlot = template.PageLayout({
    article: demoArticleSlot,
    tableOfContents: demoTocSlot,
    breadcrumb: (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
        <span>Docs</span>
        <span>/</span>
        <span className="text-foreground font-medium">{activeLayout.charAt(0).toUpperCase() + activeLayout.slice(1)}</span>
      </div>
    ),
    footer: demoFooterSlot,
  });

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Interactive Controls Bar (WithControl) */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-border/80 bg-card/60 backdrop-blur-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground mr-1">Layout:</span>
          {DOCS_LAYOUT_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveLayout(id)}
              className={cn(
                'px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer',
                activeLayout === id
                  ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              {t(`settings.theme.layout.${id}.name`)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Sidebar collapse toggle */}
          <button
            type="button"
            onClick={toggleSidebarCollapse}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
            title="Toggle sidebar collapse in preview"
          >
            {sidebarCollapsed ? (
              <>
                <PanelLeftOpen className="size-3" />
                <span className="hidden sm:inline">Expand Sidebar</span>
              </>
            ) : (
              <>
                <PanelLeftClose className="size-3" />
                <span className="hidden sm:inline">Collapse Sidebar</span>
              </>
            )}
          </button>

          {/* Theme switch in sandbox */}
          <button
            type="button"
            onClick={toggleThemeMode}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
            title="Toggle theme inside preview"
          >
            {options.themeMode === 'dark' ? (
              <>
                <Sun className="size-3 text-amber-400" />
                <span>Dark</span>
              </>
            ) : (
              <>
                <Moon className="size-3" />
                <span>Light</span>
              </>
            )}
          </button>

          {/* Apply button */}
          <button
            type="button"
            onClick={handleApply}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-semibold shadow-xs hover:opacity-90 transition-opacity cursor-pointer"
          >
            <Check className="size-3" />
            <span>Apply to Project</span>
          </button>
        </div>
      </div>

      {/* macOS Story Window Container */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-muted/40 p-2 sm:p-4 shadow-xl">
        <div className="relative overflow-hidden rounded-xl border border-border bg-background shadow-lg transition-colors">
          {/* macOS Window Chrome Header */}
          <div className="flex h-9 items-center justify-between border-b border-border/70 bg-muted/40 px-3.5 backdrop-blur-xs select-none">
            <div className="flex items-center gap-2">
              <span data-window-control="close" className="size-3 rounded-full bg-[#ff5f57] border border-black/10 inline-block" />
              <span data-window-control="minimize" className="size-3 rounded-full bg-[#febc2e] border border-black/10 inline-block" />
              <span data-window-control="maximize" className="size-3 rounded-full bg-[#28c840] border border-black/10 inline-block" />
            </div>
            <div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-background/60 px-3 py-0.5 text-[11px] font-medium text-muted-foreground">
              <span>https://docs.local/preview/{activeLayout}</span>
            </div>
            <div className="size-3" />
          </div>

          {/* Live Layout Viewport Frame (wrapped in DocumentationThemeProvider with live theme variables) */}
          <DocumentationThemeProvider
            appearance={options.themeMode}
            className="size-full overflow-hidden text-sm relative [transform:translateZ(0)]"
            context="studio-preview"
            direction="ltr"
            style={{
              ...projectThemeVariables(effectiveConfig, options.themeMode),
              ...projectThemeStyle(effectiveConfig),
              transform: 'translateZ(0)',
            }}
            theme={resolvedTheme}
          >
            <div className="min-h-[500px] max-h-[640px] overflow-hidden flex flex-col">
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
    </div>
  );
}
