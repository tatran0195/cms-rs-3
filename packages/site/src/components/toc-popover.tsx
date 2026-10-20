import { cn } from '@cms/design-system/lib/utils';
import { ChevronDown } from 'lucide-react';
import { type ComponentProps, useEffect, useRef, useState } from 'react';
import { TableOfContents, type TocHeading } from './toc';

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
 * ProgressCircle ported directly from Fumadocs TOC slot
 * (packages/radix-ui/src/layouts/docs/page/slots/toc.tsx)
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

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');

export interface TOCPopoverProps {
  headings?: TocHeading[];
  label?: string;
  style?: 'normal' | 'clerk' | 'block';
  depth?: number;
  className?: string;
}

/**
 * Mobile and tablet collapsible TOC Popover (`[grid-area:toc-popover]`)
 * Modeled directly after Fumadocs `TOCPopover` (`packages/radix-ui/src/layouts/docs/page/slots/toc.tsx`):
 * - Sticky bar positioned below the mobile header at `--fd-docs-row-2`
 * - Displays ProgressCircle indicating reading completion
 * - Displays active heading title or "On this page" with smooth slide transition
 * - Rotating chevron trigger that expands/collapses the full heading outline
 * - Smooth scroll jump to target heading on click with automatic popover dismiss
 */
export function TOCPopover({ headings = [], label = 'On this page', style = 'clerk', depth = 3, className }: TOCPopoverProps) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const items = headings
    .map((h) => {
      const d = h.depth ?? h.level ?? 1;
      const id = h.id && !/^h\d+-\d+$/.test(h.id) ? h.id : slugify(h.text) || h.id;
      return { ...h, depth: d, id };
    })
    .filter((heading) => heading.depth <= depth);

  const [activeIds, setActiveIds] = useState<string[]>(() => (items[0]?.id ? [items[0].id] : []));

  // Keep activeIds in sync if items list updates
  useEffect(() => {
    if (items.length > 0 && !items.some((i) => activeIds.includes(i.id))) {
      setActiveIds([items[0]?.id ?? '']);
    }
  }, [items, activeIds]);

  const key = items.map((i) => i.id).join('|');

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [open]);

  // Viewport scroll spy detection matching desktop TOC
  // biome-ignore lint/correctness/useExhaustiveDependencies: key is the stable signature of items.
  useEffect(() => {
    if (typeof window === 'undefined' || items.length === 0) {
      return;
    }
    const elements = items
      .map((heading) => ({
        id: heading.id,
        element: document.getElementById(heading.id) || document.getElementById(slugify(heading.text)),
      }))
      .filter((entry): entry is { id: string; element: HTMLElement } => Boolean(entry.element));
    if (elements.length === 0) return;

    const scrollParent = elements[0]?.element.closest('[data-spacious-scroll-container], .overflow-y-auto') ?? null;
    const scrollTarget: EventTarget = scrollParent ?? window;

    let rafId: number | null = null;
    const onScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const firstId = elements[0]?.id;
        if (!firstId) return;

        const viewportTop = scrollParent ? scrollParent.getBoundingClientRect().top : 0;
        const viewportBottom = scrollParent ? viewportTop + scrollParent.clientHeight : window.innerHeight;

        const isAtBottom = scrollParent
          ? scrollParent.scrollHeight - scrollParent.scrollTop - scrollParent.clientHeight < 30
          : window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 30;

        if (isAtBottom && elements.length > 0) {
          const visibleBottomIds = elements
            .filter(({ element }) => {
              const rect = element.getBoundingClientRect();
              return rect.bottom > viewportTop && rect.top < viewportBottom;
            })
            .map((e) => e.id);
          const lastId = elements[elements.length - 1]?.id ?? firstId;
          const result: string[] = visibleBottomIds.length > 0 ? visibleBottomIds : [lastId];
          setActiveIds(result);
          return;
        }

        const visibleIds: string[] = [];
        let closestAboveId = firstId;

        for (const { id, element } of elements) {
          const rect = element.getBoundingClientRect();
          if (rect.bottom > viewportTop && rect.top < viewportBottom) {
            visibleIds.push(id);
          } else if (rect.bottom <= viewportTop) {
            closestAboveId = id;
          }
        }

        const nextActiveIds: string[] = visibleIds.length > 0 ? visibleIds : [closestAboveId];
        setActiveIds(nextActiveIds);
      });
    };

    scrollTarget.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    return () => {
      scrollTarget.removeEventListener('scroll', onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [key]);

  if (items.length === 0) {
    return null;
  }

  const primaryActiveId = activeIds[0] ?? items[0]?.id;
  const activeIndex = items.findIndex((item) => item.id === primaryActiveId);
  const activeHeading = activeIndex !== -1 ? items[activeIndex] : items[0];
  const progressRatio = items.length > 0 ? (Math.max(0, activeIndex) + 1) / items.length : 0;

  return (
    <div
      ref={popoverRef}
      data-toc-popover=""
      className={cn(
        'sticky top-[var(--fd-docs-row-2,0px)] z-20 [grid-area:toc-popover] h-[var(--fd-toc-popover-height,2.5rem)] xl:hidden w-full',
        className,
      )}
    >
      <header className={cn('border-b border-border/70 backdrop-blur-md transition-colors bg-background/85', open && 'shadow-lg bg-background')}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          data-toc-popover-trigger=""
          aria-expanded={open}
          className="flex w-full h-10 items-center text-xs text-muted-foreground gap-2.5 px-4 text-start focus-visible:outline-none md:px-6 cursor-pointer select-none"
        >
          <ProgressCircle
            value={progressRatio}
            max={1}
            className={cn('shrink-0 text-muted-foreground/60 transition-colors', open && 'text-primary')}
          />
          <span className="grid flex-1 overflow-hidden">
            <span className={cn('truncate font-medium transition-all text-xs', open ? 'text-foreground' : 'text-foreground/90')}>
              {open || !activeHeading ? label : activeHeading.text}
            </span>
          </span>
          <ChevronDown className={cn('size-4 shrink-0 transition-transform duration-200 text-muted-foreground', open && 'rotate-180')} />
        </button>

        {open && (
          <div
            data-toc-popover-content=""
            className="flex flex-col px-4 py-2 max-h-[50vh] overflow-y-auto border-t border-border/60 bg-background/95 md:px-6"
          >
            <TableOfContents
              headings={items}
              label={label}
              style={style}
              depth={depth}
              activeIds={activeIds}
              onActiveIdsChange={setActiveIds}
              onSelect={(id) => {
                setActiveIds([id]);
                setOpen(false);
              }}
              className="static max-h-none overflow-visible"
            />
          </div>
        )}
      </header>
    </div>
  );
}
