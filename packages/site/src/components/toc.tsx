import { cn } from '@cms/design-system/lib/utils';
import { Text } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type TocHeading = { id: string; text: string; depth?: number; level?: number };

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');

export interface TableOfContentsProps {
  headings: TocHeading[];
  label: string;
  style?: 'normal' | 'clerk' | 'block';
  depth?: number;
  className?: string;
  single?: boolean;
  activeId?: string;
  activeIds?: string[];
  onActiveChange?: (id: string) => void;
  onActiveIdsChange?: (ids: string[]) => void;
  onSelect?: (id: string) => void;
}

interface ComputedSVG {
  width: number;
  height: number;
  d: string;
  positions: [top: number, bottom: number, x: number][];
}

const CLERK_BASE = 8;
function getClerkItemOffset(depth: number): number {
  if (depth <= 2) return 12 + CLERK_BASE;
  if (depth === 3) return 24 + CLERK_BASE;
  return 36 + CLERK_BASE;
}

function getClerkLineOffset(depth: number): number {
  if (depth <= 2) return CLERK_BASE;
  if (depth === 3) return 12 + CLERK_BASE;
  return 24 + CLERK_BASE;
}

const NORMAL_BASE = 8;
function getNormalItemOffset(depth: number): number {
  if (depth <= 2) return 12 + NORMAL_BASE;
  if (depth === 3) return 24 + NORMAL_BASE;
  return 36 + NORMAL_BASE;
}

function getNormalLineOffset(depth: number): number {
  if (depth <= 2) return NORMAL_BASE;
  if (depth === 3) return 8 + NORMAL_BASE;
  return 16 + NORMAL_BASE;
}

function getBlockItemOffset(depth: number): number {
  if (depth <= 2) return 8;
  if (depth === 3) return 20;
  return 32;
}

/**
 * 100% Fumadocs-parity TableOfContents component:
 * - 'clerk': dynamic continuous SVG track with angled level-transitions & single active polygon clip-path
 * - 'block': sliding active highlight block with dynamic round inset clip-path
 * - 'normal': cubic bezier track curves with traveling SVG thumb dot along path
 * - Top & bottom fade gradient mask matching Fumadocs TOCScrollArea
 * - Single-active item tracking by default to ensure diagonal tree edges are never highlighted
 * - Robust reading-line scroll-spy & click locking to eliminate smooth scroll jitter
 */
export function TableOfContents({
  headings,
  label,
  style = 'clerk',
  depth = 3,
  className,
  single,
  activeId: controlledActiveId,
  activeIds: controlledActiveIds,
  onActiveChange,
  onActiveIdsChange,
  onSelect,
}: TableOfContentsProps) {
  const items = useMemo(
    () =>
      headings
        .map((h) => {
          const d = h.depth ?? h.level ?? 1;
          const id = h.id && !/^h\d+-\d+$/.test(h.id) ? h.id : slugify(h.text) || h.id;
          return { ...h, depth: d, id };
        })
        .filter((heading) => heading.depth <= depth),
    [headings, depth],
  );

  const [internalActiveIds, setInternalActiveIds] = useState<string[]>(() => {
    if (controlledActiveIds && controlledActiveIds.length > 0) return controlledActiveIds;
    if (controlledActiveId) return [controlledActiveId];
    return items[0]?.id ? [items[0].id] : [];
  });

  const isControlled = (controlledActiveIds && controlledActiveIds.length > 0) || controlledActiveId !== undefined;
  const isSingle = single ?? (controlledActiveIds === undefined || controlledActiveIds.length <= 1);

  const activeIds = useMemo(() => {
    if (controlledActiveIds && controlledActiveIds.length > 0) return controlledActiveIds;
    if (controlledActiveId) return [controlledActiveId];
    return internalActiveIds;
  }, [controlledActiveIds, controlledActiveId, internalActiveIds]);

  const setActiveId = useCallback(
    (id: string) => {
      setInternalActiveIds([id]);
      onActiveChange?.(id);
      onActiveIdsChange?.([id]);
    },
    [onActiveChange, onActiveIdsChange],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const blockRef = useRef<HTMLDivElement>(null);
  const [clerkSvg, setClerkSvg] = useState<ComputedSVG | null>(null);
  const [normalSvg, setNormalSvg] = useState<ComputedSVG | null>(null);
  const isClickScrollingRef = useRef(false);
  const clickScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync default active heading when uncontrolled and items list changes
  useEffect(() => {
    if (!isControlled && items.length > 0) {
      setInternalActiveIds((prev) => {
        if (prev.length > 0 && items.some((i) => prev.includes(i.id))) {
          return prev;
        }
        return [items[0]?.id ?? ''];
      });
    }
  }, [isControlled, items]);

  // Reading-line scroll spy detection matching Fumadocs single-active item tracking
  const key = items.map((heading) => heading.id).join('|');
  // biome-ignore lint/correctness/useExhaustiveDependencies: key is the stable signature of items
  useEffect(() => {
    if (typeof window === 'undefined' || items.length === 0 || isControlled) {
      return;
    }
    const itemElements = items
      .map((item) => ({
        id: item.id,
        element: document.getElementById(item.id) || document.getElementById(slugify(item.text)),
      }))
      .filter((entry): entry is { id: string; element: HTMLElement } => Boolean(entry.element));

    if (itemElements.length === 0) {
      return;
    }

    const firstElement = itemElements[0]?.element;
    if (!firstElement) {
      return;
    }

    const scrollParent = firstElement.closest('[data-spacious-scroll-container], .overflow-y-auto') ?? null;
    const scrollTarget: EventTarget = scrollParent ?? window;

    let rafId: number | null = null;
    const updateActive = () => {
      if (isClickScrollingRef.current) return;

      const isAtBottom = scrollParent
        ? scrollParent.scrollHeight - scrollParent.scrollTop - scrollParent.clientHeight < 30
        : window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 30;

      if (isAtBottom && itemElements.length > 0) {
        const lastId = itemElements[itemElements.length - 1]?.id;
        if (lastId) {
          setInternalActiveIds([lastId]);
          onActiveChange?.(lastId);
          onActiveIdsChange?.([lastId]);
          return;
        }
      }

      const containerTop = scrollParent ? scrollParent.getBoundingClientRect().top : 0;
      const readingLine = containerTop + 80;

      let activeHeadingId = itemElements[0]?.id;
      for (const { id, element } of itemElements) {
        const top = element.getBoundingClientRect().top;
        if (top <= readingLine) {
          activeHeadingId = id;
        } else {
          break;
        }
      }

      if (activeHeadingId) {
        setInternalActiveIds([activeHeadingId]);
        onActiveChange?.(activeHeadingId);
        onActiveIdsChange?.([activeHeadingId]);
      }
    };

    const onScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        updateActive();
      });
    };

    scrollTarget.addEventListener('scroll', onScroll, { passive: true });
    updateActive();

    return () => {
      scrollTarget.removeEventListener('scroll', onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (clickScrollTimeoutRef.current) clearTimeout(clickScrollTimeoutRef.current);
    };
  }, [key, isControlled, onActiveChange, onActiveIdsChange]);

  // Compute Clerk SVG geometry strictly matching Fumadocs upstream clerk.tsx
  const computeClerkSvg = useCallback(() => {
    const container = containerRef.current;
    if (!container || container.clientHeight === 0 || items.length === 0) {
      setClerkSvg(null);
      return;
    }
    let w = 0;
    let h = 0;
    let d = '';
    const positions: [top: number, bottom: number, x: number][] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item) continue;
      const element: HTMLElement | null = container.querySelector(`a[href="#${item.id}"]`);
      if (!element) continue;

      const styles = getComputedStyle(element);
      const x = getClerkLineOffset(item.depth) + 0.5;
      const top = element.offsetTop + Number.parseFloat(styles.paddingTop);
      const bottom = element.offsetTop + element.clientHeight - Number.parseFloat(styles.paddingBottom);

      w = Math.max(x + 8, w);
      h = Math.max(h, bottom);

      if (i === 0) {
        d += ` M${x} ${top} L${x} ${bottom}`;
      } else {
        const [, upperBottom, upperX] = positions[i - 1] ?? [0, 0, 0];
        d += ` L ${upperX} ${upperBottom} ${x} ${top} L${x} ${bottom}`;
      }
      positions.push([top, bottom, x]);
    }

    setClerkSvg({ width: w, height: h, d, positions });
  }, [items]);

  // Compute Normal SVG geometry strictly matching Fumadocs upstream default.tsx
  const computeNormalSvg = useCallback(() => {
    const container = containerRef.current;
    if (!container || container.clientHeight === 0 || items.length === 0) {
      setNormalSvg(null);
      return;
    }
    let w = 0;
    let h = 0;
    let d = '';
    const positions: [top: number, bottom: number, x: number][] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item) continue;
      const element: HTMLElement | null = container.querySelector(`a[href="#${item.id}"]`);
      if (!element) continue;

      const styles = getComputedStyle(element);
      const x = getNormalLineOffset(item.depth) + 0.5;
      const top = element.offsetTop + Number.parseFloat(styles.paddingTop);
      const bottom = element.offsetTop + element.clientHeight - Number.parseFloat(styles.paddingBottom);

      w = Math.max(x + 8, w);
      h = Math.max(h, bottom);

      if (i === 0) {
        d += ` M${x} ${top} L${x} ${bottom}`;
      } else {
        const [, upperBottom, upperX] = positions[i - 1] ?? [0, 0, 0];
        d += ` C ${upperX} ${top - 4} ${x} ${upperBottom + 4} ${x} ${top} L${x} ${bottom}`;
      }
      positions.push([top, bottom, x]);
    }

    setNormalSvg({ width: w, height: h, d, positions });
  }, [items]);

  const activeIndices = useMemo(() => {
    const indices: number[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item && activeIds.includes(item.id)) {
        indices.push(i);
      }
    }
    return indices;
  }, [items, activeIds]);

  const startIdx = activeIndices.length > 0 ? (activeIndices[0] ?? -1) : -1;
  const endIdx = isSingle ? startIdx : activeIndices.length > 0 ? (activeIndices[activeIndices.length - 1] ?? -1) : -1;

  // ResizeObserver for dynamic SVG track & block updates
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onResize = () => {
      if (style === 'clerk') computeClerkSvg();
      else if (style === 'normal') computeNormalSvg();
      else if (style === 'block' && blockRef.current) {
        const startItem = startIdx >= 0 ? items[startIdx] : undefined;
        const endItem = endIdx >= 0 ? items[endIdx] : undefined;
        const startAnchor: HTMLElement | null = startItem ? container.querySelector(`a[href="#${startItem.id}"]`) : null;
        const endAnchor: HTMLElement | null = endItem ? container.querySelector(`a[href="#${endItem.id}"]`) : null;
        if (startAnchor && endAnchor) {
          const top = startAnchor.offsetTop;
          const bottom = endAnchor.offsetTop + endAnchor.offsetHeight;
          blockRef.current.style.clipPath = `inset(${top}px 0 ${container.clientHeight - bottom}px round 8px)`;
        } else {
          blockRef.current.style.clipPath = 'inset(0 0 100% round 8px)';
        }
      }
    };

    if (typeof ResizeObserver === 'undefined') {
      onResize();
      return;
    }

    const observer = new ResizeObserver(onResize);
    observer.observe(container);
    onResize();

    return () => {
      observer.disconnect();
    };
  }, [style, computeClerkSvg, computeNormalSvg, startIdx, endIdx, items]);

  // Update block pill clip-path on activeId change
  useEffect(() => {
    if (style !== 'block' || !blockRef.current || !containerRef.current) return;
    const container = containerRef.current;
    const startItem = startIdx >= 0 ? items[startIdx] : undefined;
    const endItem = endIdx >= 0 ? items[endIdx] : undefined;
    const startAnchor: HTMLElement | null = startItem ? container.querySelector(`a[href="#${startItem.id}"]`) : null;
    const endAnchor: HTMLElement | null = endItem ? container.querySelector(`a[href="#${endItem.id}"]`) : null;
    if (startAnchor && endAnchor) {
      const top = startAnchor.offsetTop;
      const bottom = endAnchor.offsetTop + endAnchor.offsetHeight;
      blockRef.current.style.clipPath = `inset(${top}px 0 ${container.clientHeight - bottom}px round 8px)`;
    } else {
      blockRef.current.style.clipPath = 'inset(0 0 100% round 8px)';
    }
  }, [style, startIdx, endIdx, items]);

  if (items.length === 0) {
    return null;
  }

  const handleHeadingClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    isClickScrollingRef.current = true;
    if (clickScrollTimeoutRef.current) {
      clearTimeout(clickScrollTimeoutRef.current);
    }
    clickScrollTimeoutRef.current = setTimeout(() => {
      isClickScrollingRef.current = false;
    }, 800);

    setActiveId(id);
    onSelect?.(id);
    const el = document.getElementById(id) || document.getElementById(slugify(id));
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (typeof window !== 'undefined' && window.history) {
        window.history.replaceState(null, '', `#${id}`);
      }
    }
  };

  return (
    <div
      data-toc-style={style}
      className={cn(
        'sticky top-[calc(var(--site-header-h,4rem)+3rem)] max-h-[calc(100vh-var(--site-header-h,4rem)-4rem)] overflow-y-auto select-none',
        className,
      )}
    >
      <h3 id="toc-title" className="mb-2 flex items-center gap-1.5 font-medium text-muted-foreground text-sm">
        <Text className="size-4 shrink-0 rtl:-scale-x-100" aria-hidden />
        {label}
      </h3>

      {/* Masked scroll container matching Fumadocs TOCScrollArea */}
      <div className="relative min-h-0 text-sm ms-px overflow-auto overscroll-contain [scrollbar-width:none] [mask-image:linear-gradient(to_bottom,transparent,white_16px,white_calc(100%-16px),transparent)] py-3">
        <div ref={containerRef} className="relative flex flex-col">
          {/* Clerk style: authentic SVG track + animated active clipped stroke matching Fumadocs clerk.tsx */}
          {style === 'clerk' &&
            (() => {
              const clerkStartPos = startIdx >= 0 && clerkSvg ? clerkSvg.positions[startIdx] : undefined;
              const clerkEndPos = endIdx >= 0 && clerkSvg ? clerkSvg.positions[endIdx] : undefined;
              return (
                <>
                  {clerkSvg && (
                    <div
                      className="absolute top-0 start-0 origin-center rtl:-scale-x-100 pointer-events-none"
                      style={
                        {
                          width: clerkSvg.width,
                          height: clerkSvg.height,
                          '--track-top': clerkStartPos ? `${clerkStartPos[0]}px` : '0px',
                          '--track-bottom': clerkEndPos ? `${clerkEndPos[1]}px` : '0px',
                        } as React.CSSProperties
                      }
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox={`0 0 ${clerkSvg.width} ${clerkSvg.height}`}
                        className="absolute transition-[clip-path] duration-200 ease-out"
                        style={{
                          width: clerkSvg.width,
                          height: clerkSvg.height,
                          clipPath:
                            clerkStartPos && clerkEndPos
                              ? 'polygon(0 var(--track-top, 0px), 100% var(--track-top, 0px), 100% var(--track-bottom, 0px), 0 var(--track-bottom, 0px))'
                              : 'polygon(0 0, 100% 0, 100% 0, 0 0)',
                        }}
                      >
                        <path d={clerkSvg.d} className="stroke-primary" strokeWidth="1" fill="none" />
                      </svg>
                    </div>
                  )}

                  {items.map((item, index) => {
                    const isFirst = index === 0;
                    const isLast = index === items.length - 1;
                    const active = activeIds.includes(item.id);
                    const prevItem = index > 0 ? items[index - 1] : undefined;
                    const nextItem = index < items.length - 1 ? items[index + 1] : undefined;
                    const l1 = getClerkLineOffset(item.depth);
                    const l0 = prevItem ? getClerkLineOffset(prevItem.depth) : l1;
                    const l2 = nextItem ? getClerkLineOffset(nextItem.depth) : l1;

                    return (
                      <a
                        key={item.id}
                        href={`#${item.id}`}
                        data-active={active ? 'true' : 'false'}
                        aria-current={active ? 'location' : undefined}
                        onClick={(e) => handleHeadingClick(e, item.id)}
                        className={cn(
                          'prose prose-sm relative py-1.5 scroll-m-4 text-xs transition-colors wrap-anywhere block cursor-pointer select-none isolate',
                          active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                          isFirst && 'pt-0',
                          isLast && 'pb-0',
                        )}
                        style={{
                          paddingInlineStart: getClerkItemOffset(item.depth),
                        }}
                      >
                        {/* Background SVG track line */}
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className={cn(
                            'absolute -top-1.5 start-0 bottom-0 h-[calc(100%+0.375rem)] -z-1 rtl:-scale-x-100 pointer-events-none',
                            l1 !== l2 && 'h-full bottom-1.5',
                          )}
                          style={{ width: Math.max(l0, l1) + 9 }}
                        >
                          {l0 !== l1 && (
                            <path d={`M ${l0 + 0.5} 0 L ${l0 + 0.5} 0 ${l1 + 0.5} 12`} strokeWidth="1" fill="none" className="stroke-foreground/10" />
                          )}
                          <line x1={l1 + 0.5} y1={l0 === l1 ? '6' : '12'} x2={l1 + 0.5} y2="100%" strokeWidth="1" className="stroke-foreground/10" />
                        </svg>

                        {item.text}
                      </a>
                    );
                  })}
                </>
              );
            })()}

          {/* Block style: sliding rounded highlight card matching Fumadocs block.tsx */}
          {style === 'block' && (
            <>
              <div
                ref={blockRef}
                className="absolute inset-0 bg-primary/10 rounded-lg pointer-events-none transition-[clip-path] duration-300 ease-out"
                style={{ clipPath: 'inset(0 0 100% round 8px)' }}
              />
              {items.map((item, index) => {
                const isFirst = index === 0;
                const isLast = index === items.length - 1;
                const active = activeIds.includes(item.id);
                return (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    data-toc-item="block"
                    data-active={active ? 'true' : 'false'}
                    aria-current={active ? 'location' : undefined}
                    onClick={(e) => handleHeadingClick(e, item.id)}
                    className={cn(
                      'group prose relative py-1 px-2.5 rounded-md leading-snug transition-colors text-xs cursor-pointer block select-none',
                      active ? 'text-primary' : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground',
                      isFirst && 'pt-0',
                      isLast && 'pb-0',
                    )}
                    style={{
                      paddingInlineStart: getBlockItemOffset(item.depth),
                    }}
                  >
                    {item.text}
                  </a>
                );
              })}
            </>
          )}

          {/* Normal style: cubic bezier curves & traveling thumb dot matching Fumadocs default.tsx */}
          {style === 'normal' &&
            (() => {
              const normalStartPos = startIdx >= 0 && normalSvg ? normalSvg.positions[startIdx] : undefined;
              const normalEndPos = endIdx >= 0 && normalSvg ? normalSvg.positions[endIdx] : undefined;
              return (
                <>
                  {normalSvg && (
                    <div
                      className="absolute top-0 start-0 origin-center rtl:-scale-x-100 pointer-events-none"
                      style={
                        {
                          width: normalSvg.width,
                          height: normalSvg.height,
                          '--track-top': normalStartPos ? `${normalStartPos[0]}px` : '0px',
                          '--track-bottom': normalEndPos ? `${normalEndPos[1]}px` : '0px',
                        } as React.CSSProperties
                      }
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox={`0 0 ${normalSvg.width} ${normalSvg.height}`}
                        className="absolute transition-[clip-path] duration-200 ease-out"
                        style={{
                          width: normalSvg.width,
                          height: normalSvg.height,
                          clipPath:
                            normalStartPos && normalEndPos
                              ? 'polygon(0 var(--track-top, 0px), 100% var(--track-top, 0px), 100% var(--track-bottom, 0px), 0 var(--track-bottom, 0px))'
                              : 'polygon(0 0, 100% 0, 100% 0, 0 0)',
                        }}
                      >
                        <path d={normalSvg.d} className="stroke-primary" strokeWidth="1" fill="none" />
                      </svg>
                    </div>
                  )}

                  {items.map((item, index) => {
                    const isFirst = index === 0;
                    const isLast = index === items.length - 1;
                    const active = activeIds.includes(item.id);
                    const prevItem = index > 0 ? items[index - 1] : undefined;
                    const nextItem = index < items.length - 1 ? items[index + 1] : undefined;
                    const l1 = getNormalLineOffset(item.depth);
                    const l0 = prevItem ? getNormalLineOffset(prevItem.depth) : l1;
                    const l2 = nextItem ? getNormalLineOffset(nextItem.depth) : l1;

                    return (
                      <a
                        key={item.id}
                        href={`#${item.id}`}
                        data-toc-item="normal"
                        data-active={active ? 'true' : 'false'}
                        aria-current={active ? 'location' : undefined}
                        onClick={(e) => handleHeadingClick(e, item.id)}
                        className={cn(
                          'prose prose-sm relative py-1.5 scroll-m-4 text-xs transition-colors wrap-anywhere block cursor-pointer select-none isolate',
                          active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                          isFirst && 'pt-0',
                          isLast && 'pb-0',
                        )}
                        style={{
                          paddingInlineStart: getNormalItemOffset(item.depth),
                        }}
                      >
                        {/* Curved background SVG */}
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className={cn(
                            'absolute -top-1.5 start-0 bottom-0 h-[calc(100%+0.375rem)] -z-1 rtl:-scale-x-100 pointer-events-none',
                            l1 !== l2 && 'h-full bottom-1.5',
                          )}
                          style={{ width: Math.max(l0, l1) + 9 }}
                        >
                          {l0 !== l1 && (
                            <path
                              d={`M ${l0 + 0.5} 0 C ${l0 + 0.5} 8 ${l1 + 0.5} 4 ${l1 + 0.5} 12`}
                              strokeWidth="1"
                              fill="none"
                              className="stroke-foreground/10"
                            />
                          )}
                          <line x1={l1 + 0.5} y1={l0 === l1 ? '6' : '12'} x2={l1 + 0.5} y2="100%" strokeWidth="1" className="stroke-foreground/10" />
                        </svg>

                        {item.text}
                      </a>
                    );
                  })}
                </>
              );
            })()}
        </div>
      </div>
    </div>
  );
}
