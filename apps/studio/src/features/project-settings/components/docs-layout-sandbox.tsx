import { cn } from '@cms/design-system/lib/utils';
import { useT } from '@cms/i18n/react';
import { DOCS_LAYOUT_IDS, type DocsLayoutId } from '@cms/shared/themes';
import { getDocsLayoutTemplate } from '@cms/site/layouts';
import {
  BookOpen,
  Code2,
  ExternalLink,
  Laptop,
  Maximize2,
  Minimize2,
  Moon,
  PanelLeft,
  RotateCcw,
  Search,
  Sliders,
  Sun,
  Terminal,
} from 'lucide-react';
import { useState } from 'react';

export interface DocsLayoutSandboxProps {
  currentLayout?: DocsLayoutId;
  onSelectLayout: (layout: DocsLayoutId) => void;
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
  className,
}: DocsLayoutSandboxProps) {
  const t = useT();
  const [activeLayout, setActiveLayout] = useState<DocsLayoutId>(currentLayout);
  const [options, setOptions] = useState<SandboxOptions>({
    themeMode: 'light',
    collapsibleSidebar: true,
    searchExpanded: true,
    tabMode: 'auto',
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'guide' | 'api' | 'config'>('guide');

  const template = getDocsLayoutTemplate(activeLayout);

  const toggleThemeMode = () => {
    setOptions((prev) => ({
      ...prev,
      themeMode: prev.themeMode === 'light' ? 'dark' : 'light',
    }));
  };

  const handleApply = () => {
    onSelectLayout(activeLayout);
  };

  // Mock slots for the sandbox preview
  const brandSlot = (
    <div className="flex items-center gap-2">
      <span className="size-6 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center text-primary font-bold text-xs shadow-2xs">
        F
      </span>
      <span className="font-semibold text-sm tracking-tight text-foreground">
        Fumadocs
      </span>
    </div>
  );

  const searchFullSlot = (
    <div className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg border border-border/70 bg-background/80 text-muted-foreground text-xs shadow-2xs cursor-pointer hover:border-primary/50 transition-colors">
      <Search className="size-3.5" />
      <span className="flex-1">Search documentation...</span>
      <kbd className="px-1.5 py-0.5 rounded border border-border/80 bg-muted text-[10px] font-mono">
        ⌘K
      </kbd>
    </div>
  );

  const searchButtonSlot = (
    <button
      type="button"
      className="grid size-8 place-items-center rounded-lg border border-border/70 bg-card/60 text-muted-foreground hover:text-foreground shadow-2xs"
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
        {options.themeMode === 'dark' ? (
          <Sun className="size-4 text-amber-400" />
        ) : (
          <Moon className="size-4" />
        )}
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
      <span className="text-foreground font-semibold hover:text-primary cursor-pointer">
        Guide
      </span>
      <span className="hover:text-foreground cursor-pointer">Components</span>
      <span className="hover:text-foreground cursor-pointer">API Reference</span>
    </nav>
  );

  const navTabsSlot = (
    <div className="flex items-center gap-2 text-xs">
      <button
        type="button"
        onClick={() => setActiveTab('guide')}
        className={cn(
          'px-2.5 py-1 rounded-md transition-colors',
          activeTab === 'guide'
            ? 'bg-primary/10 text-primary font-semibold'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        )}
      >
        Core Guide
      </button>
      <button
        type="button"
        onClick={() => setActiveTab('api')}
        className={cn(
          'px-2.5 py-1 rounded-md transition-colors',
          activeTab === 'api'
            ? 'bg-primary/10 text-primary font-semibold'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        )}
      >
        API Reference
      </button>
      <button
        type="button"
        onClick={() => setActiveTab('config')}
        className={cn(
          'px-2.5 py-1 rounded-md transition-colors',
          activeTab === 'config'
            ? 'bg-primary/10 text-primary font-semibold'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        )}
      >
        Configuration
      </button>
    </div>
  );

  const navAnchorsSlot = (
    <div className="mb-3 space-y-1">
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium text-primary bg-primary/10">
        <BookOpen className="size-3.5" />
        <span>Documentation</span>
      </div>
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer">
        <Terminal className="size-3.5" />
        <span>CLI Reference</span>
      </div>
    </div>
  );

  const sidebarTreeSlot = (
    <div className="space-y-3 text-xs">
      <div>
        <div className="px-2 py-1 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
          Getting Started
        </div>
        <div className="mt-1 space-y-0.5">
          <div className="px-2.5 py-1.5 rounded-md font-medium text-primary bg-primary/10 cursor-pointer">
            Overview
          </div>
          <div className="px-2.5 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 cursor-pointer">
            Quick Start
          </div>
          <div className="px-2.5 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 cursor-pointer">
            Layouts & Theming
          </div>
        </div>
      </div>
      <div>
        <div className="px-2 py-1 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
          Components
        </div>
        <div className="mt-1 space-y-0.5">
          <div className="px-2.5 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 cursor-pointer">
            Callouts
          </div>
          <div className="px-2.5 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 cursor-pointer">
            Interactive Cards
          </div>
          <div className="px-2.5 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 cursor-pointer">
            Code Blocks
          </div>
        </div>
      </div>
    </div>
  );

  const demoArticleSlot = (
    <div className="space-y-6 text-foreground">
      <div className="space-y-2 border-b border-border/60 pb-5">
        <div className="flex items-center gap-2 text-xs text-primary font-medium">
          <span>Documentation</span>
          <span>/</span>
          <span>Layouts</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          {activeLayout.charAt(0).toUpperCase() + activeLayout.slice(1)} Layout
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t(`settings.theme.layout.${activeLayout}.description`)}
        </p>
      </div>

      {/* Feature Callout */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-xs leading-relaxed space-y-1">
        <div className="font-semibold text-primary flex items-center gap-1.5">
          <span>⚡ Authentic Fumadocs Engine</span>
        </div>
        <p className="text-muted-foreground">
          This preview runs Fumadocs&apos; CSS Grid and slot architecture.
          Desktop layout uses internal scroll containers and persistent rails.
        </p>
      </div>

      {/* Feature Grid Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-2xs space-y-1">
          <div className="font-semibold text-xs text-foreground">
            Responsive CSS Grid
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Multi-track CSS grid aligning sidebar, header, main, and TOC areas.
          </p>
        </div>
        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-2xs space-y-1">
          <div className="font-semibold text-xs text-foreground">
            Collapsible Sidebar
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Supports smooth drawer animation with edge hover preview.
          </p>
        </div>
      </div>

      {/* Code Snippet Box */}
      <div className="rounded-xl border border-border/80 bg-muted/60 p-3 font-mono text-[11px] text-foreground/90 space-y-1">
        <div className="text-muted-foreground text-[10px]"># Layout configuration</div>
        <div>theme.layout.docsLayout = &quot;{activeLayout}&quot;</div>
      </div>
    </div>
  );

  const demoTocSlot = (
    <div className="space-y-2 text-xs">
      <div className="font-semibold text-foreground uppercase tracking-wider text-[11px]">
        On this page
      </div>
      <div className="space-y-1 border-l-2 border-border/60 pl-3">
        <div className="font-medium text-primary cursor-pointer">Overview</div>
        <div className="text-muted-foreground hover:text-foreground cursor-pointer">
          Authentic Fumadocs Engine
        </div>
        <div className="text-muted-foreground hover:text-foreground cursor-pointer">
          Responsive CSS Grid
        </div>
        <div className="text-muted-foreground hover:text-foreground cursor-pointer">
          Collapsible Sidebar
        </div>
      </div>
    </div>
  );

  const contentSlot = template.PageLayout({
    article: demoArticleSlot,
    tableOfContents: demoTocSlot,
  });

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Interactive Controls Bar (WithControl) */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-border/80 bg-card/60 backdrop-blur-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground mr-1">
            Layout:
          </span>
          {DOCS_LAYOUT_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveLayout(id)}
              className={cn(
                'px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer',
                activeLayout === id
                  ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              {t(`settings.theme.layout.${id}.name`)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
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
            Apply to Project
          </button>
        </div>
      </div>

      {/* macOS Story Window Container */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-muted/30 via-background to-muted/50 p-2 sm:p-4 shadow-xl">
        <div
          className={cn(
            'relative overflow-hidden rounded-xl border border-border bg-background shadow-lg transition-colors',
            options.themeMode === 'dark' ? 'dark bg-zinc-950 text-zinc-100' : 'bg-white text-zinc-900'
          )}
        >
          {/* macOS Window Chrome Header */}
          <div className="flex h-9 items-center justify-between border-b border-border/70 bg-muted/40 px-3.5 backdrop-blur-xs select-none">
            <div className="flex items-center gap-2">
              <span
                data-window-control="close"
                className="size-3 rounded-full bg-[#ff5f57] border border-black/10 inline-block"
              />
              <span
                data-window-control="minimize"
                className="size-3 rounded-full bg-[#febc2e] border border-black/10 inline-block"
              />
              <span
                data-window-control="maximize"
                className="size-3 rounded-full bg-[#28c840] border border-black/10 inline-block"
              />
            </div>
            <div className="text-[11px] font-medium text-muted-foreground">
              https://docs.local/preview/{activeLayout}
            </div>
            <div className="size-3" />
          </div>

          {/* Live Layout Viewport Frame */}
          <div className="min-h-[480px] max-h-[620px] overflow-hidden flex flex-col">
            {template.ReaderLayout({
              header: (
                <div className="flex h-12 items-center justify-between px-4 border-b border-border/60">
                  {brandSlot}
                  {toolsSlot}
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
        </div>
      </div>
    </div>
  );
}
