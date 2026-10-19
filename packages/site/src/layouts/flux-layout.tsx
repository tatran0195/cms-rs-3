import { ScrollArea } from '@cms/design-system/components/ui/scroll-area';
import { cn } from '@cms/design-system/lib/utils';
import { Check, ChevronDown, ChevronsUpDown, PanelLeft, Tablet, X } from 'lucide-react';
import { type ComponentProps, type ReactNode, useEffect, useRef, useState } from 'react';
import type { DocsLayoutTemplate } from './types';

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg role="img" viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

interface ProgressCircleProps extends Omit<ComponentProps<'svg'>, 'strokeWidth'> {
  value: number;
  strokeWidth?: number;
  size?: number;
  min?: number;
  max?: number;
}

function clamp(input: number, min: number, max: number): number {
  if (input < min) return min;
  if (input > max) return max;
  return input;
}

/**
 * ProgressCircle ported directly from Fumadocs Flux TOC slot
 * (packages/radix-ui/src/layouts/flux/page/slots/toc.tsx)
 */
function ProgressCircle({ value, strokeWidth = 1.5, size = 18, min = 0, max = 100, style, ...restSvgProps }: ProgressCircleProps) {
  const normalizedValue = clamp(value, min, max);
  const radius = size / 2 - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const progress = (normalizedValue / max) * circumference;
  const circleProps = {
    cx: size / 2,
    cy: size / 2,
    r: radius,
    fill: 'none',
    strokeWidth,
  };

  return (
    <svg
      role="progressbar"
      viewBox={`0 0 ${size} ${size}`}
      aria-valuenow={normalizedValue}
      aria-valuemin={min}
      aria-valuemax={max}
      style={{ width: size, height: size, ...style }}
      {...restSvgProps}
    >
      <circle {...circleProps} className="stroke-current/25" />
      <circle
        {...circleProps}
        stroke="currentColor"
        strokeDasharray={circumference}
        strokeDashoffset={circumference - progress}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-all"
      />
    </svg>
  );
}

export interface FluxTOCItem {
  title: string;
  url: string;
  depth: number;
}

const DEFAULT_FLUX_TOC: FluxTOCItem[] = [
  { title: 'Introduction', url: '#introduction', depth: 2 },
  { title: 'Installation', url: '#installation', depth: 2 },
  { title: 'Usage', url: '#usage', depth: 2 },
  { title: 'Configuration', url: '#configuration', depth: 3 },
  { title: 'Deployment', url: '#deployment', depth: 2 },
];

/**
 * PageTOCPopover ported directly from Fumadocs Flux layout
 * (packages/radix-ui/src/layouts/flux/page/slots/toc.tsx)
 * Features upward-expanding popover, dynamic progress ring, and active heading indicator line
 */
function PageTOCPopover({
  items = DEFAULT_FLUX_TOC,
  activeTitle = 'Overview',
  onSelect,
}: {
  items?: FluxTOCItem[];
  activeTitle?: string;
  onSelect?: (item: FluxTOCItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState('#usage');
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [open]);

  const activeIndex = items.findIndex((i) => i.url === selectedUrl);
  const progressRatio = items.length > 0 ? (Math.max(0, activeIndex) + 1) / items.length : 0.6;

  return (
    <div ref={popoverRef} className="relative flex-1 min-w-0" data-toc-popover="">
      {/* Upward expanding popover card */}
      {open && (
        <div
          data-toc-popover-content=""
          className="absolute bottom-full mb-2 end-0 w-52 sm:w-56 rounded-2xl border border-border/80 bg-popover/95 text-popover-foreground shadow-2xl backdrop-blur-md p-3 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          <div className="relative py-1">
            {/* Connected track line matching Fumadocs */}
            <div className="absolute start-1.5 top-2.5 bottom-2.5 w-px bg-border/80" aria-hidden="true" />

            <div className="space-y-1 text-xs">
              {items.map((item) => {
                const isActive = item.url === selectedUrl;
                const isNested = item.depth > 2;

                return (
                  <button
                    key={item.url}
                    type="button"
                    onClick={() => {
                      setSelectedUrl(item.url);
                      onSelect?.(item);
                      setOpen(false);
                    }}
                    className={cn(
                      'relative flex items-center w-full text-start py-1 transition-colors rounded-md hover:text-foreground cursor-pointer',
                      isNested ? 'ps-6 text-muted-foreground/80' : 'ps-4',
                      isActive ? 'font-semibold text-primary' : 'text-muted-foreground',
                    )}
                  >
                    {isActive && <span className="absolute start-0 top-1/2 -translate-y-1/2 size-2 rounded-full bg-primary ring-2 ring-primary/20" />}
                    <span className="truncate">{item.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-label="Table of Contents"
        className={cn(
          'flex w-full h-8 items-center text-xs text-muted-foreground gap-2 px-2.5 rounded-xl border border-border/60 bg-muted/30 hover:bg-muted/60 hover:text-foreground transition-all cursor-pointer',
          open && 'border-primary/50 text-foreground bg-muted/80 shadow-xs',
        )}
      >
        <ProgressCircle
          value={progressRatio}
          max={1}
          size={16}
          className={cn('shrink-0 transition-colors', open ? 'text-primary' : 'text-primary/70')}
        />
        <span className="truncate font-medium">{activeTitle}</span>
        <ChevronDown className={cn('ms-auto shrink-0 size-3.5 transition-transform duration-200', open && 'rotate-180')} />
      </button>
    </div>
  );
}

/**
 * TabDropdown component ported directly from Fumadocs Flux
 * (packages/radix-ui/src/layouts/flux/slots/tab-dropdown.tsx)
 */
function TabDropdown({
  navTabs,
  activeTab = 'Framework',
  tabs = ['Framework', 'Showcase'],
  onSelectTab,
}: {
  navTabs?: ReactNode;
  activeTab?: string;
  tabs?: string[];
  onSelectTab?: (tab: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(activeTab);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [open]);

  if (navTabs) {
    return <div className="min-w-0 flex-1">{navTabs}</div>;
  }

  return (
    <div ref={dropdownRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className="flex items-center gap-1.5 w-full rounded-xl overflow-hidden px-2.5 py-1 border border-border/80 bg-background/60 shadow-xs text-xs text-start transition-colors hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground cursor-pointer"
      >
        <Tablet className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium">{selected}</span>
        <ChevronsUpDown className="shrink-0 ms-auto size-3 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute bottom-full mb-1.5 left-0 w-40 rounded-xl border border-border/80 bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-md p-1.5 z-50 animate-in fade-in slide-in-from-bottom-1 duration-150">
          {tabs.map((tab) => {
            const isActive = tab === selected;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setSelected(tab);
                  onSelectTab?.(tab);
                  setOpen(false);
                }}
                className={cn(
                  'flex items-center gap-2 w-full rounded-lg px-2 py-1.5 text-xs text-start transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer',
                  isActive && 'bg-accent/80 font-medium text-accent-foreground',
                )}
              >
                <Tablet className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate font-medium flex-1">{tab}</span>
                <Check className={cn('size-3 text-primary shrink-0', !isActive && 'invisible')} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Flux Layout (`flux`)
 * Modeled accurately after upstream Fumadocs Flux layout:
 * (packages/radix-ui/src/layouts/flux/index.tsx)
 * - Minimalist reading canvas with no top desktop header
 * - NavigationPanel dock fixed at bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2
 *   - Row 1: Brand title on left, PageTOCPopover with circular progress on right portal slot
 *   - Row 2: TabDropdown on left, GitHub link in center divider, Search/Sidebar/Theme tools on right
 * - Modal drawer overlay for hierarchical navigation tree
 * - Distraction-free measure in #nd-page
 */
function FluxReaderLayoutComponent(slots: Parameters<DocsLayoutTemplate['ReaderLayout']>[0]) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const hasGranular = Boolean(slots.brand);

  const defaultBrand = (
    <div className="flex items-center gap-2">
      <span className="size-5 rounded-full border border-primary/40 bg-gradient-to-br from-primary/60 to-background shadow-xs shrink-0" />
      <span className="font-semibold text-sm tracking-tight text-foreground">My Docs</span>
    </div>
  );

  return (
    <div id="nd-flux-layout" data-documentation-layout="flux" className="flex min-h-screen flex-col bg-background relative">
      {slots.banner}

      {/* Mobile top header fallback when granular slots not provided */}
      {!hasGranular && slots.header}

      {/* Main Reading Canvas */}
      <div className="mx-auto flex w-full max-w-[920px] flex-1 min-w-0 flex-col px-4 pt-6 pb-36 sm:px-8 sm:pt-10" data-theme-region="content-shell">
        <div className="min-w-0 flex-1">{slots.content}</div>
      </div>

      {/* Floating Bottom Navigation Dock (Fumadocs NavigationPanel) */}
      <aside
        data-flux-nav-panel="true"
        className="fixed bottom-4 sm:bottom-6 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-[380px] -translate-x-1/2 flex-col gap-1 rounded-2xl border border-border/80 bg-popover/95 p-1 text-popover-foreground shadow-2xl backdrop-blur-md transition-all duration-200 hover:shadow-primary/5"
        data-theme-region="navigation-panel"
      >
        {/* Head: Brand + Page TOC Popover Slot */}
        <div className="flex flex-row items-center ps-2.5 pe-1 pt-1 pb-0.5 gap-2 min-h-11">
          <div className="flex min-w-0 items-center gap-2 shrink-0">{slots.brand ?? defaultBrand}</div>
          <div id="flux-layout-slot" className="flex-1 min-w-0">
            <PageTOCPopover activeTitle="Overview" />
          </div>
        </div>

        {/* Tools row: TabDropdown + Link + Search/Sidebar/ThemeSwitch */}
        <div className="flex flex-row items-center gap-1.5 overflow-x-auto overflow-y-hidden px-1.5 py-1 border-t border-border/50">
          <TabDropdown navTabs={slots.navTabs} />

          <div className="flex flex-row items-center text-muted-foreground border-x border-border/50 px-1 empty:hidden">
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub repository"
              className="grid size-7 place-items-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <GithubIcon className="size-4" />
            </a>
          </div>

          <div className="flex flex-row items-center text-muted-foreground gap-1">
            {slots.searchButton}
            <button
              type="button"
              onClick={() => setDrawerOpen(!drawerOpen)}
              className="grid size-7 place-items-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              aria-label={drawerOpen ? 'Close Navigation' : 'Open Navigation'}
              aria-expanded={drawerOpen}
            >
              <PanelLeft className="size-3.5" />
            </button>
            {slots.tools}
          </div>
        </div>
      </aside>

      {/* Navigation Rail / Drawer Overlay (Fumadocs Flux Sidebar) */}
      <div
        className={cn(
          'fixed inset-0 py-10 z-30 backdrop-blur-md bg-background/60 transition-all duration-200',
          drawerOpen ? 'opacity-100 pointer-events-auto' : 'pointer-events-none opacity-0',
        )}
      >
        <button
          type="button"
          aria-label="Close Navigation"
          tabIndex={-1}
          className="fixed inset-0 size-full cursor-default border-0 bg-transparent"
          onClick={() => setDrawerOpen(false)}
        />
        <div className="relative z-10 mx-auto w-full max-w-[400px] overflow-y-auto py-12 px-4 lg:text-sm">
          <aside
            id="nd-sidebar"
            className="w-full rounded-2xl border border-border bg-card/95 p-6 shadow-2xl backdrop-blur-lg"
            data-theme-region="sidebar"
          >
            <div className="mb-4 flex items-center justify-between border-border/60 border-b pb-3">
              <span className="font-semibold text-sm">Navigation</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="grid size-7 place-items-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                aria-label="Close Navigation"
              >
                <X className="size-4" />
              </button>
            </div>
            <ScrollArea className="flex-1">
              <div data-theme-region="sidebar-content">
                {slots.navAnchors}
                {slots.sidebarTree ?? slots.navigation}
              </div>
            </ScrollArea>
          </aside>
        </div>
      </div>

      {slots.footer}
      {slots.overlays}
    </div>
  );
}

export const FluxLayoutTemplate: DocsLayoutTemplate = {
  id: 'flux',
  ReaderLayout: (slots) => <FluxReaderLayoutComponent {...slots} />,

  ProjectPreviewLayout: ({ mobileNavigation, content }) => (
    <>
      {mobileNavigation}
      <div
        id="nd-flux-layout"
        className="flex min-h-0 flex-1 flex-col bg-background p-4 relative"
        data-documentation-layout="flux-preview"
        data-theme-region="preview-shell"
      >
        <div className="min-w-0 flex-1 overflow-y-auto pb-16">{content}</div>
        <aside
          data-flux-nav-panel="true"
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center justify-between gap-3 rounded-full border border-border/80 bg-popover/90 px-4 py-2 shadow-lg backdrop-blur-md"
        >
          <div className="text-xs font-medium">Flux Navigation</div>
        </aside>
      </div>
    </>
  ),

  StudioPreviewLayout: ({ content }) => (
    <div id="nd-flux-layout" className="bg-background p-3 relative" data-documentation-layout="flux-studio" data-theme-region="preview-shell">
      <div className="mx-auto max-w-[44rem] min-h-[20rem] overflow-hidden pb-12">
        <div className="min-w-0">{content}</div>
      </div>
      <div
        data-flux-nav-panel="true"
        className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border/80 bg-popover/90 px-3 py-1 shadow-md"
      >
        <span className="size-1.5 rounded-full bg-primary" />
        <span className="text-[10px] text-muted-foreground font-medium">Flux Dock</span>
      </div>
    </div>
  ),

  PageLayout: ({ article, tableOfContents, breadcrumb, footer }) => (
    <div className="flex flex-1 items-start gap-8 w-full min-w-0 justify-center" data-documentation-layout="flux-page" data-theme-region="page-shell">
      <article id="nd-page" className="flex flex-col gap-6 w-full min-w-0 max-w-[760px] pb-32">
        {breadcrumb && <div className="mb-2">{breadcrumb}</div>}
        {article}
        {footer}
      </article>
      {tableOfContents && (
        <aside className="sticky top-6 hidden xl:block w-[240px] shrink-0 self-start" data-theme-region="toc">
          {tableOfContents}
        </aside>
      )}
    </div>
  ),
};
