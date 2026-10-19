import { ScrollArea } from '@cms/design-system/components/ui/scroll-area';
import { cn } from '@cms/design-system/lib/utils';
import { Check, ChevronDown, ChevronsUpDown, PanelLeft, Search, Tablet, X } from 'lucide-react';
import { type ComponentProps, createContext, isValidElement, type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TableOfContents } from '../components/toc';
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
export function ProgressCircle({ value, strokeWidth = 1.5, size = 18, min = 0, max = 100, style, className, ...restSvgProps }: ProgressCircleProps) {
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
      className={className}
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
        className="transition-all duration-300"
      />
    </svg>
  );
}

export interface FluxTOCItem {
  id: string;
  title: string;
  url: string;
  depth: number;
}

const DEFAULT_FLUX_TOC: FluxTOCItem[] = [
  { id: 'overview', title: 'Overview', url: '#overview', depth: 2 },
  { id: 'introduction', title: 'Introduction', url: '#introduction', depth: 2 },
  { id: 'installation', title: 'Installation', url: '#installation', depth: 3 },
  { id: 'theme-configuration', title: 'Theme Configuration', url: '#theme-configuration', depth: 3 },
];

export const FluxLayoutContext = createContext<{
  hasPageTOC: boolean;
  setHasPageTOC: (has: boolean) => void;
}>({
  hasPageTOC: false,
  setHasPageTOC: () => {
    // Default no-op
  },
});

/**
 * FluxTOCPopover ported directly from Fumadocs Flux layout
 * (packages/radix-ui/src/layouts/flux/page/slots/toc.tsx)
 * Features upward-expanding popover, dynamic progress ring, and active heading tracking
 */
export function FluxTOCPopover({
  headings,
  fallbackContent,
  activeTitle: defaultTitle,
  style = 'clerk',
}: {
  headings?: FluxTOCItem[];
  fallbackContent?: ReactNode;
  activeTitle?: string;
  style?: 'normal' | 'clerk' | 'block';
}) {
  const [open, setOpen] = useState(false);
  const items = headings && headings.length > 0 ? headings : DEFAULT_FLUX_TOC;
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? '');
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  // Synchronize activeId when items list changes
  useEffect(() => {
    if (items.length > 0 && !items.some((i) => i.id === activeId)) {
      setActiveId(items[0]?.id ?? '');
    }
  }, [items, activeId]);

  // Close when clicking outside headerRef
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [open]);

  // Scroll spy: observe headings on page
  useEffect(() => {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined' || items.length === 0) return;
    const elements = items.map((item) => document.getElementById(item.id)).filter((el): el is HTMLElement => Boolean(el));

    if (elements.length === 0) return;

    const scrollParent = elements[0]?.closest('.overflow-y-auto') ?? null;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          setActiveId(visible[0].target.id);
        }
      },
      { root: scrollParent, rootMargin: '0px 0px -70% 0px', threshold: 0 },
    );

    for (const el of elements) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [items]);

  const activeIndex = items.findIndex((i) => i.id === activeId);
  const progressRatio = items.length > 0 ? (Math.max(0, activeIndex) + 1) / items.length : 0.4;
  const activeHeading = items[activeIndex] ?? items[0];

  return (
    <div ref={containerRef} className="relative h-9 min-w-0 flex-1" data-toc-popover="" data-toc-style={style}>
      <header
        ref={headerRef}
        className={cn(
          'absolute w-full bottom-0 border rounded-xl transition-all duration-200 bg-secondary text-secondary-foreground backdrop-blur-sm z-50',
          open && 'shadow-2xl bg-popover text-popover-foreground border-border',
        )}
      >
        {/* Upward expanding TOC content */}
        {open && (
          <div
            data-toc-popover-content=""
            className="flex flex-col px-2.5 max-h-[50vh] overflow-y-auto py-2.5 animate-in fade-in slide-in-from-bottom-2 duration-150"
          >
            {fallbackContent ? (
              <div className="text-xs">{fallbackContent}</div>
            ) : (
              <TableOfContents
                headings={items.map((item) => ({ id: item.id, text: item.title, depth: item.depth }))}
                label="On this page"
                style={style}
                depth={3}
                activeId={activeId}
                onSelect={(id) => {
                  setActiveId(id);
                  setOpen(false);
                }}
                className="static max-h-none overflow-visible"
              />
            )}
          </div>
        )}

        {/* Trigger at the bottom */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          aria-expanded={open}
          aria-label="Table of Contents"
          data-toc-popover-trigger=""
          className={cn(
            'flex w-full h-8.5 items-center text-xs text-muted-foreground gap-2 px-2.5 text-start focus-visible:outline-none cursor-pointer select-none transition-colors hover:text-foreground',
            open && 'text-popover-foreground',
          )}
        >
          <ProgressCircle
            value={progressRatio}
            max={1}
            size={16}
            className={cn('shrink-0 transition-colors', open ? 'text-primary' : 'text-primary/70')}
          />
          <span className="truncate font-medium flex-1">{activeHeading?.title ?? defaultTitle ?? 'On this page'}</span>
          <ChevronDown className={cn('ms-auto shrink-0 size-3.5 transition-transform duration-200', open && 'rotate-180')} />
        </button>
      </header>
    </div>
  );
}

/**
 * TabDropdown component ported directly from Fumadocs Flux
 * (packages/radix-ui/src/layouts/flux/slots/tab-dropdown.tsx)
 */
export function FluxTabDropdown({
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

  return (
    <div ref={dropdownRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className="flex items-center gap-1.5 w-full rounded-xl overflow-hidden px-2.5 py-1.5 border border-border/80 bg-background/60 shadow-2xs text-xs text-start transition-colors hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground cursor-pointer"
      >
        <Tablet className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium flex-1">{selected}</span>
        <ChevronsUpDown className="shrink-0 ms-auto size-3.5 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute bottom-full mb-1.5 left-0 w-48 rounded-xl border border-border/80 bg-popover/95 text-popover-foreground shadow-2xl backdrop-blur-md p-1.5 z-50 animate-in fade-in slide-in-from-bottom-1 duration-150">
          {navTabs ? (
            <div className="p-1">{navTabs}</div>
          ) : (
            tabs.map((tab) => {
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
                  <Check className={cn('size-3.5 text-primary shrink-0', !isActive && 'invisible')} />
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Portals the page's TableOfContents directly into #flux-layout-slot
 * inside the bottom navigation dock, matching Fumadocs Flux behavior.
 */
function FluxPageTOCPortal({ tableOfContents }: { tableOfContents: ReactNode }) {
  const { setHasPageTOC } = useContext(FluxLayoutContext);
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHasPageTOC(true);
    const el = document.getElementById('flux-layout-slot');
    if (el) {
      setSlot(el);
    }
    return () => {
      setHasPageTOC(false);
    };
  }, [setHasPageTOC]);

  if (!tableOfContents) return null;

  let headings: FluxTOCItem[] | undefined;
  let style: 'normal' | 'clerk' | 'block' = 'clerk';
  if (isValidElement(tableOfContents)) {
    const props = tableOfContents.props as {
      headings?: Array<{ id: string; text: string; depth?: number }>;
      style?: 'normal' | 'clerk' | 'block';
    };
    if (props.style) {
      style = props.style;
    }
    if (Array.isArray(props.headings)) {
      headings = props.headings.map((h) => ({
        id: h.id,
        title: h.text,
        url: `#${h.id}`,
        depth: h.depth ?? 2,
      }));
    }
  }

  if (slot) {
    return createPortal(<FluxTOCPopover headings={headings} style={style} fallbackContent={headings ? undefined : tableOfContents} />, slot);
  }

  // Fallback for isolated tests or SSR where #flux-layout-slot is not in DOM
  return (
    <div className="contents" data-flux-toc-fallback="">
      {tableOfContents}
    </div>
  );
}

/**
 * Flux Layout (`flux`)
 * Modeled accurately after upstream Fumadocs Flux layout:
 * (packages/radix-ui/src/layouts/flux/index.tsx)
 * - Minimalist reading canvas with no top desktop header
 * - NavigationPanel dock fixed at bottom-0 sm:bottom-6 left-1/2 -translate-x-1/2
 *   - Row 1: Brand title on left, PageTOCPopover with circular progress on right portal slot
 *   - Row 2: TabDropdown on left, GitHub link in center divider, Search/Sidebar/Theme tools on right
 * - Modal drawer overlay for hierarchical navigation tree
 * - Distraction-free reading canvas
 */
function FluxReaderLayoutComponent(slots: Parameters<DocsLayoutTemplate['ReaderLayout']>[0]) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hasPageTOC, setHasPageTOC] = useState(false);
  const hasGranular = Boolean(slots.brand);

  const defaultBrand = (
    <div className="inline-flex items-center gap-2 text-sm font-semibold">
      <span className="size-5 rounded-full border border-primary/40 bg-gradient-to-br from-primary/60 to-background shadow-2xs shrink-0" />
      <span className="tracking-tight text-foreground truncate max-w-[120px]">My Docs</span>
    </div>
  );

  return (
    <FluxLayoutContext.Provider value={{ hasPageTOC, setHasPageTOC }}>
      <div id="nd-flux-layout" data-documentation-layout="flux" className="flex min-h-screen flex-col bg-background relative overflow-x-clip">
        {slots.banner}

        {/* Mobile top header fallback when granular slots not provided */}
        {!hasGranular && slots.header}

        {/* Main Reading Canvas */}
        <div
          className="mx-auto flex w-full max-w-[1200px] flex-1 min-w-0 flex-col px-4 pt-6 pb-36 sm:px-8 sm:pt-10"
          data-theme-region="content-shell"
        >
          <div className="min-w-0 flex-1">{slots.content}</div>
        </div>

        {/* Floating Bottom Navigation Dock (Fumadocs NavigationPanel) */}
        <aside
          data-flux-nav-panel="true"
          className="fixed left-1/2 -translate-x-1/2 bottom-0 z-40 w-full sm:w-[380px] sm:max-w-[380px] sm:bottom-6 sm:rounded-2xl border-t sm:border border-border/80 bg-popover/95 text-popover-foreground shadow-2xl backdrop-blur-md transition-all duration-200"
          data-theme-region="navigation-panel"
        >
          {/* Row 1: Head / Brand + TOC Popover Portal Slot */}
          <div className="flex flex-row items-center ps-2.5 p-1 gap-2 min-h-11">
            <div className="flex min-w-0 items-center gap-2 shrink-0">{slots.brand ?? defaultBrand}</div>
            <div id="flux-layout-slot" className="flex-1 min-w-0">
              {!hasPageTOC && <FluxTOCPopover />}
            </div>
          </div>

          {/* Row 2: TabDropdown + Link + Tools (Search/Sidebar/ThemeSwitch) */}
          <div className="flex flex-row gap-1.5 overflow-x-auto overflow-y-hidden p-2 sm:p-1 border-t sm:border-t-0 border-border/40">
            <div className="flex flex-row items-center gap-2 min-w-0 flex-1">
              <FluxTabDropdown navTabs={slots.navTabs} />
            </div>

            <div className="flex flex-row items-center text-muted-foreground border-x border-border/50 px-0.5 empty:hidden">
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub repository"
                className="grid size-7 place-items-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <GithubIcon className="size-4" />
              </a>
            </div>

            <div className="flex flex-row items-center text-muted-foreground gap-1 empty:hidden">
              {slots.searchButton ?? (
                <button
                  type="button"
                  aria-label="Search"
                  className="grid size-7 place-items-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  <Search className="size-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setDrawerOpen((v) => !v)}
                className="grid size-7 place-items-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer overflow-hidden"
                aria-label={drawerOpen ? 'Close Navigation' : 'Open Navigation'}
                aria-expanded={drawerOpen}
              >
                {drawerOpen ? <X className="size-3.5" /> : <PanelLeft className="size-3.5" />}
              </button>
              {slots.tools}
            </div>
          </div>
        </aside>

        {/* Sidebar Drawer Overlay (Fumadocs Flux Sidebar) */}
        <div
          className={cn(
            'fixed inset-0 py-10 z-30 backdrop-blur-md bg-background/60 transition-opacity duration-200',
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

        {slots.footer && <div className="pb-24 sm:pb-28">{slots.footer}</div>}
        {slots.overlays}
      </div>
    </FluxLayoutContext.Provider>
  );
}

export const FluxLayoutTemplate: DocsLayoutTemplate = {
  id: 'flux',
  ReaderLayout: (slots) => <FluxReaderLayoutComponent {...slots} />,

  ProjectPreviewLayout: ({ mobileNavigation, content, brand, tools }) => (
    <>
      {mobileNavigation}
      <div
        id="nd-flux-layout"
        className="flex min-h-0 flex-1 flex-col bg-background p-4 relative"
        data-documentation-layout="flux-preview"
        data-theme-region="preview-shell"
      >
        <div className="min-w-0 flex-1 overflow-y-auto pb-20">{content}</div>
        <aside
          data-flux-nav-panel="true"
          className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[340px] flex flex-col rounded-2xl border border-border/80 bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-md p-1"
        >
          <div className="flex items-center justify-between px-2 py-1 min-h-8">
            <span className="text-xs font-semibold">{brand ?? 'My Docs'}</span>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg border border-border/60 bg-muted/40 text-[11px] text-muted-foreground">
              <span className="size-2 rounded-full bg-primary" />
              <span>Overview</span>
            </div>
          </div>
          <div className="flex items-center justify-between px-2 py-1 border-t border-border/40 text-xs text-muted-foreground">
            <span className="text-[11px]">Framework</span>
            <div className="flex items-center gap-1">{tools}</div>
          </div>
        </aside>
      </div>
    </>
  ),

  StudioPreviewLayout: ({ content, brand }) => (
    <div
      id="nd-flux-layout"
      className="bg-background p-3 relative flex flex-col h-full"
      data-documentation-layout="flux-studio"
      data-theme-region="preview-shell"
    >
      <div className="mx-auto w-full max-w-[44rem] flex-1 overflow-y-auto pb-16">
        <div className="min-w-0">{content}</div>
      </div>
      <div
        data-flux-nav-panel="true"
        className="absolute bottom-2 left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-[280px] flex items-center justify-between rounded-xl border border-border/80 bg-popover/95 px-3 py-1.5 shadow-lg backdrop-blur-md"
      >
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-primary" />
          <span className="text-[11px] font-semibold text-foreground">{brand ?? 'Flux'}</span>
        </div>
        <span className="text-[10px] text-muted-foreground font-medium">Overview</span>
      </div>
    </div>
  ),

  PageLayout: ({ article, tableOfContents, breadcrumb, footer }) => (
    <div className="flex flex-1 items-start w-full min-w-0 justify-center" data-documentation-layout="flux-page" data-theme-region="page-shell">
      {/* Portalled TOC to #flux-layout-slot */}
      {tableOfContents ? <FluxPageTOCPortal tableOfContents={tableOfContents} /> : null}
      <main className="grid [grid-area:main] justify-items-center w-full" data-layout-main="">
        <article id="nd-page" className="flex flex-col gap-6 w-full min-w-0 max-w-[900px] px-4 py-6 md:px-6 md:pt-8 xl:px-8 xl:pt-14 pb-32">
          {breadcrumb && <div className="mb-2">{breadcrumb}</div>}
          {article}
          {footer}
        </article>
      </main>
    </div>
  ),
};
