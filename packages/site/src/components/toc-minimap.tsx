import { cn } from '@cms/design-system/lib/utils';
import { Text } from 'lucide-react';
import { type ComponentProps, useEffect, useRef, useState } from 'react';
import type { TocHeading } from './toc';

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');

export interface TOCMinimapProps extends ComponentProps<'aside'> {
  headings?: TocHeading[];
  label?: string;
  depth?: number;
}

/**
 * Interactive hover-expand TOC minimap for Glass layout
 * Modeled directly after Fumadocs Glass TOC (`packages/radix-ui/src/layouts/glass/page/slots/toc.tsx`):
 * - Displays a sleek, minimalist rail of depth-proportional indicator bars in resting state
 * - Smoothly expands to full 240px width with headings and "On this page" title upon pointer hover / touch
 * - Tracks active section with scroll spy and primary color glow
 */
export function TOCMinimap({ headings = [], label = 'On this page', depth = 3, className, ...props }: TOCMinimapProps) {
  const [hover, setHover] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeId, setActiveId] = useState('');
  const exitTimerRef = useRef<number | null>(null);

  const items = headings
    .map((h) => {
      const d = h.depth ?? h.level ?? 1;
      const id = h.id && !/^h\d+-\d+$/.test(h.id) ? h.id : slugify(h.text) || h.id;
      return { ...h, depth: d, id };
    })
    .filter((heading) => heading.depth <= depth);

  const key = items.map((i) => i.id).join('|');
  const open = hover || mobileOpen;

  // Scroll spy detection
  // biome-ignore lint/correctness/useExhaustiveDependencies: key is the stable signature of items.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined' || items.length === 0) {
      return;
    }
    const elements = items
      .map((heading) => document.getElementById(heading.id) || document.getElementById(slugify(heading.text)))
      .filter((el): el is HTMLElement => Boolean(el));
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
    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [key]);

  if (items.length === 0) {
    return null;
  }

  const handleHeadingClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    setActiveId(id);
    setMobileOpen(false);
    const el = document.getElementById(id) || document.getElementById(slugify(id));
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (typeof window !== 'undefined' && window.history) {
        window.history.replaceState(null, '', `#${id}`);
      }
    }
  };

  return (
    <>
      {/* Mobile backdrop mask */}
      <button
        type="button"
        aria-label="Close outline"
        className={cn(
          'fixed inset-0 z-20 backdrop-blur-xs transition-opacity duration-300 xl:hidden border-0 p-0',
          open ? 'opacity-100 bg-background/40' : 'opacity-0 pointer-events-none',
        )}
        onClick={() => setMobileOpen(false)}
      />

      <aside
        id="nd-toc-glass"
        data-theme-region="toc"
        data-toc-open={open ? 'true' : 'false'}
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse') {
            if (exitTimerRef.current) window.clearTimeout(exitTimerRef.current);
            setHover(true);
          }
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') {
            if (exitTimerRef.current) window.clearTimeout(exitTimerRef.current);
            exitTimerRef.current = window.setTimeout(() => setHover(false), 200);
          }
        }}
        onPointerDown={(e) => {
          if (!mobileOpen && (e.pointerType === 'touch' || e.pointerType === 'pen')) {
            setMobileOpen(true);
          }
        }}
        className={cn(
          'sticky top-8 z-30 flex flex-col transition-[width,padding,background-color] duration-300 [grid-area:toc] self-start',
          'max-xl:fixed max-xl:top-1/2 max-xl:-translate-y-1/2 max-xl:end-2 max-xl:rounded-2xl max-xl:border max-xl:border-border/80 max-xl:bg-card/90 max-xl:backdrop-blur-md max-xl:shadow-xl',
          open
            ? 'w-[240px] p-4 bg-card/85 backdrop-blur-md rounded-2xl border border-border/70 shadow-lg'
            : 'w-10 p-2 items-center cursor-pointer max-xl:w-8 max-xl:p-1.5',
          className,
        )}
        {...props}
      >
        <div className="flex flex-col w-full">
          <h3
            className={cn(
              'inline-flex items-center gap-1.5 text-xs text-muted-foreground font-semibold transition-[opacity,height] overflow-hidden',
              open ? 'opacity-100 h-6 mb-2' : 'opacity-0 h-0 pointer-events-none',
            )}
          >
            <Text className="size-3.5 shrink-0" />
            {label}
          </h3>

          <ul className="space-y-1.5 w-full">
            {items.map((heading) => {
              const active = activeId === heading.id;
              const barWidth = Math.max(8, (heading.depth - 1) * 8 + 8);
              return (
                <li key={heading.id} className="relative w-full">
                  <a
                    href={`#${heading.id}`}
                    onClick={(e) => handleHeadingClick(e, heading.id)}
                    className={cn(
                      'flex items-center gap-2 transition-all text-xs cursor-pointer',
                      active ? 'text-primary font-semibold' : 'text-muted-foreground hover:text-foreground',
                      !open && 'justify-center py-1',
                    )}
                  >
                    <span
                      style={{ width: open ? 4 : barWidth }}
                      className={cn(
                        'h-1 rounded-full shrink-0 transition-all duration-300',
                        active ? 'bg-primary ring-2 ring-primary/20' : 'bg-muted-foreground/40',
                      )}
                    />
                    <span
                      className={cn(
                        'truncate transition-opacity duration-200',
                        open ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden pointer-events-none',
                      )}
                      style={{ paddingInlineStart: Math.max(0, heading.depth - 2) * 6 }}
                    >
                      {heading.text}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
    </>
  );
}
