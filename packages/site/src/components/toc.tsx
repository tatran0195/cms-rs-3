'use client';

import { cn } from '@cms/design-system/lib/utils';
import { Text } from 'lucide-react';
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  type RefObject,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

export type TocHeading = { id: string; text: string; depth?: number; level?: number };

export interface TOCItemType {
  title: ReactNode;
  url: string;
  depth: number;
  _step?: number;
}

export type TableOfContentsType = TOCItemType[];

export interface TOCItemInfo {
  id: string;
  active: boolean;
  t: number;
  fallback: boolean;
  original: TOCItemType;
}

export function isEqualShallow(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return b.length === a.length && a.every((v, i) => isEqualShallow(v, b[i]));
  }
  return false;
}

export function mergeRefs<T>(...refs: (React.Ref<T> | undefined)[]) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === 'function') ref(node);
      else (ref as React.MutableRefObject<T | null>).current = node;
    }
  };
}

export const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');

function getItemId(url: string) {
  if (url.startsWith('#')) return url.slice(1);
  return null;
}

type ChangeListener = (items: TOCItemInfo[]) => void;

/**
 * Ported 1:1 from Fumadocs Core Observer (packages/core/src/toc.tsx)
 * Uses browser IntersectionObserver with threshold: 0.9 and closest-top fallback
 */
export class Observer {
  items: TOCItemInfo[];
  activeAnchors: string[] = [];
  activeAnchor: string | undefined;
  private observer: IntersectionObserver | null = null;
  private readonly listeners = new Set<ChangeListener>();

  constructor(
    toc: TOCItemType[],
    readonly single: boolean = false,
    initialActiveIds: string[] = [],
  ) {
    this.items = [];
    for (const item of toc) {
      const id = getItemId(item.url);
      if (id) {
        const isActive = initialActiveIds.includes(id);
        this.items.push({ id, active: isActive, fallback: false, t: 0, original: item });
        if (isActive) this.activeAnchors.push(id);
      }
    }
    if (this.activeAnchors.length > 0) {
      this.activeAnchor = this.activeAnchors[0];
    }
  }

  listen(listener: ChangeListener) {
    this.listeners.add(listener);
  }

  unlisten(listener: ChangeListener) {
    this.listeners.delete(listener);
  }

  subscribe = (listener: ChangeListener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  watch(options?: IntersectionObserverInit) {
    if (this.observer || typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return;

    this.observer = new IntersectionObserver(this.callback.bind(this), options);
    for (const item of this.items) {
      const element = document.getElementById(item.id) || document.getElementById(slugify(item.id));
      if (!element) continue;
      this.observer.observe(element);
    }
  }

  unwatch() {
    this.observer?.disconnect();
    this.observer = null;
  }

  private callback(entries: IntersectionObserverEntry[]) {
    if (entries.length === 0) return;

    let hasActive = false;
    const updated = this.items.map((item) => {
      const entry = entries.find((e) => e.target.id === item.id || e.target.id === slugify(item.id));
      let active = entry ? entry.isIntersecting : item.active && !item.fallback;
      if (this.single && hasActive) active = false;

      const currentItem =
        item.active !== active
          ? {
              ...item,
              t: Date.now(),
              active,
              fallback: false,
            }
          : item;

      if (active) hasActive = true;
      return currentItem;
    });

    if (!hasActive && entries[0]?.rootBounds) {
      const viewTop = entries[0].rootBounds.top;
      let min = Number.MAX_VALUE;
      let fallbackIdx = -1;

      for (let i = 0; i < updated.length; i++) {
        const item = updated[i];
        if (!item) continue;
        const element = document.getElementById(item.id) || document.getElementById(slugify(item.id));
        if (!element) continue;

        const d = Math.abs(viewTop - element.getBoundingClientRect().top);
        if (d < min) {
          fallbackIdx = i;
          min = d;
        }
      }

      const target = fallbackIdx !== -1 ? updated[fallbackIdx] : undefined;
      if (target) {
        updated[fallbackIdx] = {
          ...target,
          active: true,
          fallback: true,
          t: Date.now(),
        };
      }
    }

    this.update(updated);
  }

  update(next: TOCItemInfo[]) {
    let latest: TOCItemInfo | undefined;
    const activeAnchors: string[] = [];
    for (const item of next) {
      if (!item.active) continue;

      activeAnchors.push(item.id);
      if (!latest || item.t > latest.t) latest = item;
    }

    this.items = next;
    this.activeAnchors = activeAnchors;
    this.activeAnchor = latest?.id;
    for (const listener of this.listeners) listener(next);
  }

  setActive(activeIds: string[]) {
    const updated = this.items.map((item) => ({
      ...item,
      active: activeIds.includes(item.id),
      fallback: false,
      t: Date.now(),
    }));
    this.update(updated);
  }
}

const ObserverContext = createContext<Observer | null>(null);
const ScrollContext = createContext<RefObject<HTMLElement | null> | null>(null);
const TOCContext = createContext<TOCItemType[]>([]);

export interface AnchorProviderProps {
  toc: TOCItemType[];
  single?: boolean;
  activeIds?: string[];
  children?: ReactNode;
}

export function AnchorProvider({ toc, single = false, activeIds = [], children }: AnchorProviderProps) {
  const activeIdsKey = activeIds.join(',');
  const observer = useMemo(() => new Observer(toc, single, activeIdsKey ? activeIdsKey.split(',') : []), [toc, single, activeIdsKey]);

  useEffect(() => {
    observer.watch({
      threshold: 0.9,
    });

    return () => observer.unwatch();
  }, [observer]);

  return <ObserverContext.Provider value={observer}>{children}</ObserverContext.Provider>;
}

export function TOCProvider({ toc, activeIds, children, ...props }: AnchorProviderProps) {
  return (
    <TOCContext.Provider value={toc}>
      <AnchorProvider toc={toc} activeIds={activeIds} {...props}>
        {children}
      </AnchorProvider>
    </TOCContext.Provider>
  );
}

export function useObserver() {
  const observer = use(ObserverContext);
  if (!observer) throw new Error('Component must be used under the <AnchorProvider /> component.');
  return observer;
}

export function useObserverValue<T>(get: (observer: Observer) => T): T {
  const observer = useObserver();
  const getSnapshot = () => get(observer);
  return useSyncExternalStore(observer.subscribe, getSnapshot, getSnapshot);
}

export function useTOC() {
  const observer = useObserver();
  return useMemo(
    () => ({
      get() {
        return observer.items;
      },
      listen: observer.listen.bind(observer),
      unlisten: observer.unlisten.bind(observer),
    }),
    [observer],
  );
}

export function useTOCListener(listener: ChangeListener) {
  const observer = useObserver();
  const listenerRef = useRef(listener);
  listenerRef.current = listener;

  useEffect(() => {
    const callback = (items: TOCItemInfo[]) => listenerRef.current(items);
    return observer.subscribe(callback);
  }, [observer]);
}

export function useActiveAnchor(): string | undefined {
  return useObserverValue((observer) => observer.activeAnchor);
}

export function useActiveAnchors(): string[] {
  return useObserverValue((observer) => observer.activeAnchors);
}

export function useItems(): TOCItemInfo[] {
  return useObserverValue((observer) => observer.items);
}

export function useTOCItems(): TOCItemType[] {
  return use(TOCContext);
}

export interface PrimitiveTOCItemProps extends Omit<ComponentProps<'a'>, 'onSelect'> {
  autoScroll?: boolean;
  onActiveChange?: (v: boolean) => void;
  onSelect?: (id: string) => void;
}

export function PrimitiveTOCItem({ ref, onActiveChange, autoScroll = true, onSelect, href, ...props }: PrimitiveTOCItemProps) {
  const id = href ? getItemId(href) : null;
  const containerRef = use(ScrollContext);
  const anchorRef = useRef<HTMLAnchorElement>(null);
  const isMountedRef = useRef(false);
  const observer = useObserver();
  const active = useObserverValue((obs) => id !== null && obs.activeAnchors.includes(id));
  const prevActiveRef = useRef(active);

  if (prevActiveRef.current !== active) {
    prevActiveRef.current = active;
    onActiveChange?.(active);
  }

  useEffect(() => {
    if (id === null) return;
    const callback = () => {
      const anchor = anchorRef.current;
      const container = containerRef?.current;
      if (autoScroll && observer.activeAnchor === id && anchor && container && typeof anchor.scrollIntoView === 'function') {
        anchor.scrollIntoView({
          behavior: isMountedRef.current ? 'smooth' : 'instant',
          block: 'center',
        });
      }
    };
    callback();
    isMountedRef.current = true;
    return observer.subscribe(callback);
  }, [autoScroll, id, observer, containerRef]);

  return (
    <a
      ref={mergeRefs(anchorRef, ref)}
      href={href}
      data-active={String(active)}
      aria-current={active ? 'location' : undefined}
      onClick={(e) => {
        if (id) {
          e.preventDefault();
          onSelect?.(id);
          const el = document.getElementById(id) || document.getElementById(slugify(id));
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            if (typeof window !== 'undefined' && window.history) {
              window.history.replaceState(null, '', `#${id}`);
            }
          }
        }
      }}
      {...props}
    />
  );
}

export function TOCScrollArea({ ref, className, children, ...props }: ComponentProps<'div'>) {
  const viewRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={mergeRefs(viewRef, ref)}
      className={cn(
        'relative min-h-0 text-sm ms-px overflow-auto overscroll-contain [scrollbar-width:none] [mask-image:linear-gradient(to_bottom,transparent,white_16px,white_calc(100%-16px),transparent)] py-3',
        className,
      )}
      {...props}
    >
      <ScrollContext.Provider value={viewRef}>{children}</ScrollContext.Provider>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 CLERK STYLE                                */
/* -------------------------------------------------------------------------- */

interface ComputedSVG {
  width: number;
  height: number;
  content: ReactNode;
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

export function ClerkTOCItems({ ref, className, children, ...props }: ComponentProps<'div'>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const items = useTOCItems();
  const [svg, setSvg] = useState<ComputedSVG | null>(null);

  const onPrint = useCallback(() => {
    const container = containerRef.current;
    if (!container || container.clientHeight === 0) return;
    if (items.length === 0) {
      setSvg(null);
      return;
    }
    let w = 0;
    let h = 0;
    let d = '';
    const positions: [top: number, bottom: number, x: number][] = [];
    const output: ReactNode[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item) continue;
      const element: HTMLElement | null = container.querySelector(`a[href="${item.url}"]`);
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
        const [, upperBottom, upperX] = i > 0 ? (positions[i - 1] ?? [0, 0, 0]) : [0, 0, 0];
        d += ` L ${upperX} ${upperBottom} ${x} ${top} L${x} ${bottom}`;
      }

      positions.push([top, bottom, x]);
    }

    output.unshift(<path key="path" d={d} className="stroke-primary" strokeWidth="1" fill="none" />);

    setSvg({
      content: output,
      width: w,
      height: h,
      d,
      positions,
    });
  }, [items]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (typeof ResizeObserver === 'undefined') {
      onPrint();
      return;
    }

    const observer = new ResizeObserver(onPrint);
    observer.observe(container);
    onPrint();
    return () => {
      observer.unobserve(container);
    };
  }, [onPrint]);

  return (
    <div ref={mergeRefs(containerRef, ref)} className={cn('relative flex flex-col', className)} {...props}>
      {svg && <ClerkThumbTrack computed={svg} />}
      {children}
    </div>
  );
}

function ClerkThumbTrack({ computed }: { computed: ComputedSVG }) {
  const ref = useRef<HTMLDivElement>(null);
  const tocInfo = useTOC();

  function calculate(items: TOCItemInfo[]) {
    const out: Record<string, string> = {};
    const startIdx = items.findIndex((item) => item.active);
    if (startIdx === -1) return out;

    const endIdx = items.findLastIndex((item) => item.active);
    const startPos = computed.positions[startIdx];
    const endPos = computed.positions[endIdx];
    if (startPos && endPos) {
      out['--track-top'] = `${startPos[0]}px`;
      out['--track-bottom'] = `${endPos[1]}px`;
    }
    return out;
  }

  useTOCListener((items) => {
    const element = ref.current;
    if (!element) return;

    for (const [k, v] of Object.entries(calculate(items))) {
      element.style.setProperty(k, v);
    }
  });

  return (
    <div
      ref={ref}
      className="absolute top-0 inset-s-0 origin-center rtl:-scale-x-100 pointer-events-none"
      style={{
        width: computed.width,
        height: computed.height,
        ...calculate(tocInfo.get()),
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${computed.width} ${computed.height}`}
        className="absolute transition-[clip-path]"
        style={{
          width: computed.width,
          height: computed.height,
          clipPath: 'polygon(0 var(--track-top,0), 100% var(--track-top,0), 100% var(--track-bottom,0), 0 var(--track-bottom,0))',
        }}
      >
        {computed.content}
      </svg>
    </div>
  );
}

export function ClerkTOCItem({ item, onSelect, ...props }: PrimitiveTOCItemProps & { item: TOCItemType; onSelect?: (id: string) => void }) {
  const items = useTOCItems();
  const index = items.indexOf(item);
  const isFirst = index === 0;
  const isLast = index === items.length - 1;

  const l1 = getClerkLineOffset(item.depth);
  const l0 = isFirst ? l1 : getClerkLineOffset(items[index - 1]?.depth ?? item.depth);
  const l2 = isLast ? l1 : getClerkLineOffset(items[index + 1]?.depth ?? item.depth);

  const id = getItemId(item.url) ?? '';

  return (
    <PrimitiveTOCItem
      href={item.url}
      data-toc-item="clerk"
      onClick={() => {
        onSelect?.(id);
      }}
      className={cn(
        'prose prose-sm relative py-1.5 scroll-m-4 text-xs text-muted-foreground hover:text-foreground transition-colors wrap-anywhere data-[active=true]:text-primary select-none cursor-pointer',
        isFirst && 'pt-0',
        isLast && 'pb-0',
        props.className,
      )}
      style={{
        paddingInlineStart: getClerkItemOffset(item.depth),
        ...props.style,
      }}
      {...props}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className={cn(
          'absolute -top-1.5 inset-s-0 bottom-0 h-[calc(100%+0.375rem)] -z-1 rtl:-scale-x-100 pointer-events-none',
          l1 !== l2 && 'h-full bottom-1.5',
        )}
        style={{
          width: Math.max(l0, l1) + 9,
        }}
      >
        {l0 !== l1 && <path d={`M ${l0 + 0.5} 0 L ${l0 + 0.5} 0 ${l1 + 0.5} 12`} strokeWidth="1" fill="none" className="stroke-foreground/10" />}
        <line x1={l1 + 0.5} y1={l0 === l1 ? '6' : '12'} x2={l1 + 0.5} y2="100%" strokeWidth="1" className="stroke-foreground/10" />
      </svg>
      {item.title}
    </PrimitiveTOCItem>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 BLOCK STYLE                                */
/* -------------------------------------------------------------------------- */

function getBlockItemOffset(depth: number): number {
  if (depth <= 2) return 8;
  if (depth === 3) return 20;
  return 32;
}

export function BlockTOCItems({ ref, className, children, ...props }: ComponentProps<'div'>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const blockRef = useRef<HTMLDivElement>(null);
  const tocInfo = useTOC();

  useEffect(() => {
    const container = containerRef.current;
    const block = blockRef.current;
    if (!container || !block) return;
    const positions = new Map<string, [top: number, bottom: number]>();
    let height = 0;

    const update = (items: TOCItemInfo[]) => {
      let top = -1;
      let bottom = -1;
      for (const item of items) {
        if (!item.active) continue;
        const pos = positions.get(item.original.url);
        if (!pos) continue;
        if (top === -1) top = pos[0];
        bottom = pos[1];
      }

      if (top !== -1) block.style.clipPath = `inset(${top}px 0 ${height - bottom}px round 8px)`;
      else block.style.clipPath = 'inset(0 0 100% round 8px)';
    };

    if (typeof ResizeObserver === 'undefined') {
      update(tocInfo.get());
      return;
    }

    const observer = new ResizeObserver(() => {
      positions.clear();
      for (const anchor of container.getElementsByTagName('a')) {
        const href = anchor.getAttribute('href');
        if (href) positions.set(href, [anchor.offsetTop, anchor.offsetTop + anchor.offsetHeight]);
      }
      height = container.clientHeight;
      update(tocInfo.get());
    });

    observer.observe(container);
    tocInfo.listen(update);
    return () => {
      observer.disconnect();
      tocInfo.unlisten(update);
    };
  }, [tocInfo]);

  return (
    <div ref={mergeRefs(containerRef, ref)} className={cn('relative flex flex-col', className)} {...props}>
      <div
        ref={blockRef}
        className="absolute inset-0 bg-primary/10 rounded-lg pointer-events-none transition-[clip-path] duration-300 ease-out"
        style={{ clipPath: 'inset(0 0 100% round 8px)' }}
      />
      {children}
    </div>
  );
}

export function BlockTOCItem({ item, onSelect, ...props }: PrimitiveTOCItemProps & { item: TOCItemType; onSelect?: (id: string) => void }) {
  const id = getItemId(item.url) ?? '';
  return (
    <PrimitiveTOCItem
      href={item.url}
      data-toc-item="block"
      onClick={() => onSelect?.(id)}
      className={cn(
        'group prose relative py-1 px-2.5 rounded-md leading-snug transition-colors text-xs cursor-pointer block select-none text-muted-foreground hover:text-foreground data-[active=true]:text-primary data-[active=true]:font-medium',
        props.className,
      )}
      style={{
        paddingInlineStart: getBlockItemOffset(item.depth),
        ...props.style,
      }}
      {...props}
    >
      {item.title}
    </PrimitiveTOCItem>
  );
}

/* -------------------------------------------------------------------------- */
/*                                NORMAL STYLE                                */
/* -------------------------------------------------------------------------- */

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

export function NormalTOCItems({ ref, className, children, ...props }: ComponentProps<'div'>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const items = useTOCItems();
  const [svg, setSvg] = useState<ComputedSVG | null>(null);

  const onPrint = useCallback(() => {
    const container = containerRef.current;
    if (!container || container.clientHeight === 0) return;
    if (items.length === 0) {
      setSvg(null);
      return;
    }
    let w = 0;
    let h = 0;
    let d = '';
    const positions: [top: number, bottom: number, x: number][] = [];
    const output: ReactNode[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item) continue;
      const element: HTMLElement | null = container.querySelector(`a[href="${item.url}"]`);
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
        const [, upperBottom, upperX] = i > 0 ? (positions[i - 1] ?? [0, 0, 0]) : [0, 0, 0];
        d += ` C ${upperX} ${top - 4} ${x} ${upperBottom + 4} ${x} ${top} L${x} ${bottom}`;
      }

      positions.push([top, bottom, x]);
    }

    output.unshift(<path key="path" d={d} className="stroke-primary" strokeWidth="1" fill="none" />);

    setSvg({
      content: output,
      width: w,
      height: h,
      d,
      positions,
    });
  }, [items]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (typeof ResizeObserver === 'undefined') {
      onPrint();
      return;
    }

    const observer = new ResizeObserver(onPrint);
    observer.observe(container);
    onPrint();
    return () => {
      observer.unobserve(container);
    };
  }, [onPrint]);

  return (
    <div ref={mergeRefs(containerRef, ref)} className={cn('relative flex flex-col', className)} {...props}>
      {svg && <NormalThumbTrack computed={svg} />}
      {children}
    </div>
  );
}

function NormalThumbTrack({ computed }: { computed: ComputedSVG }) {
  const ref = useRef<HTMLDivElement>(null);
  const tocInfo = useTOC();

  function calculate(items: TOCItemInfo[]) {
    const out: Record<string, string> = {};
    const activeItem = items.find((item) => item.active);
    if (!activeItem) return out;
    const index = items.indexOf(activeItem);
    const pos = computed.positions[index];
    if (pos) {
      out['--thumb-x'] = `${pos[2]}px`;
      out['--thumb-y'] = `${(pos[0] + pos[1]) / 2}px`;
    }
    return out;
  }

  useTOCListener((items) => {
    const element = ref.current;
    if (!element) return;

    for (const [k, v] of Object.entries(calculate(items))) {
      element.style.setProperty(k, v);
    }
  });

  return (
    <div
      ref={ref}
      className="absolute top-0 inset-s-0 origin-center rtl:-scale-x-100 pointer-events-none"
      style={{
        width: computed.width,
        height: computed.height,
        ...calculate(tocInfo.get()),
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${computed.width} ${computed.height}`}
        className="absolute"
        style={{
          width: computed.width,
          height: computed.height,
        }}
      >
        <path d={computed.d} className="stroke-foreground/10" strokeWidth="1" fill="none" />
        <circle
          cx="0"
          cy="0"
          r="2.5"
          className="fill-primary transition-transform duration-200"
          style={{
            transform: 'translate(var(--thumb-x, -10px), var(--thumb-y, -10px))',
          }}
        />
      </svg>
    </div>
  );
}

export function NormalTOCItem({ item, onSelect, ...props }: PrimitiveTOCItemProps & { item: TOCItemType; onSelect?: (id: string) => void }) {
  const id = getItemId(item.url) ?? '';
  return (
    <PrimitiveTOCItem
      href={item.url}
      data-toc-item="normal"
      onClick={() => onSelect?.(id)}
      className={cn(
        'prose prose-sm relative py-1.5 scroll-m-4 text-xs text-muted-foreground hover:text-foreground transition-colors wrap-anywhere data-[active=true]:text-primary select-none cursor-pointer',
        props.className,
      )}
      style={{
        paddingInlineStart: getNormalItemOffset(item.depth),
        ...props.style,
      }}
      {...props}
    >
      {item.title}
    </PrimitiveTOCItem>
  );
}

/* -------------------------------------------------------------------------- */
/*                         MAIN TableOfContents                               */
/* -------------------------------------------------------------------------- */

export interface TableOfContentsProps {
  headings: TocHeading[];
  label?: string;
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

export function TableOfContentsInner({
  label,
  style = 'clerk',
  className,
  controlledActiveId,
  controlledActiveIds,
  onActiveChange,
  onActiveIdsChange,
  onSelect,
}: {
  label?: string;
  style?: 'normal' | 'clerk' | 'block';
  className?: string;
  controlledActiveId?: string;
  controlledActiveIds?: string[];
  onActiveChange?: (id: string) => void;
  onActiveIdsChange?: (ids: string[]) => void;
  onSelect?: (id: string) => void;
}) {
  const items = useTOCItems();
  const observer = useObserver();

  // If controlled, sync to observer
  useEffect(() => {
    if (controlledActiveIds && controlledActiveIds.length > 0) {
      observer.setActive(controlledActiveIds);
    } else if (controlledActiveId) {
      observer.setActive([controlledActiveId]);
    } else if (observer.activeAnchors.length === 0 && items.length > 0 && items[0]?.url) {
      const firstId = getItemId(items[0].url);
      if (firstId) observer.setActive([firstId]);
    }
  }, [controlledActiveIds, controlledActiveId, observer, items]);

  useTOCListener((updatedItems) => {
    const active = updatedItems.filter((i) => i.active).map((i) => i.id);
    if (active.length > 0) {
      onActiveIdsChange?.(active);
      const latest = observer.activeAnchor;
      if (latest) onActiveChange?.(latest);
    }
  });

  return (
    <div data-toc-style={style} className={cn('w-full select-none', className)}>
      {Boolean(label) && (
        <h3 id="toc-title" className="mb-2 flex items-center gap-1.5 font-medium text-muted-foreground text-sm">
          <Text className="size-4 shrink-0 rtl:-scale-x-100" aria-hidden />
          {label}
        </h3>
      )}

      <TOCScrollArea>
        {style === 'clerk' && (
          <ClerkTOCItems>
            {items.map((item) => (
              <ClerkTOCItem key={item.url} item={item} onSelect={onSelect} />
            ))}
          </ClerkTOCItems>
        )}
        {style === 'block' && (
          <BlockTOCItems>
            {items.map((item) => (
              <BlockTOCItem key={item.url} item={item} onSelect={onSelect} />
            ))}
          </BlockTOCItems>
        )}
        {style === 'normal' && (
          <NormalTOCItems>
            {items.map((item) => (
              <NormalTOCItem key={item.url} item={item} onSelect={onSelect} />
            ))}
          </NormalTOCItems>
        )}
      </TOCScrollArea>
    </div>
  );
}

export function TableOfContents({
  headings,
  label,
  style = 'clerk',
  depth = 3,
  className,
  single = false,
  activeId: controlledActiveId,
  activeIds: controlledActiveIds,
  onActiveChange,
  onActiveIdsChange,
  onSelect,
}: TableOfContentsProps) {
  const toc: TOCItemType[] = useMemo(
    () =>
      headings
        .map((h) => {
          const d = h.depth ?? h.level ?? 1;
          const id = h.id && !/^h\d+-\d+$/.test(h.id) ? h.id : slugify(h.text) || h.id;
          return { title: h.text, url: `#${id}`, depth: d };
        })
        .filter((heading) => heading.depth <= depth),
    [headings, depth],
  );

  const initialActiveIds = useMemo(() => {
    if (controlledActiveIds && controlledActiveIds.length > 0) return controlledActiveIds;
    if (controlledActiveId) return [controlledActiveId];
    return [];
  }, [controlledActiveIds, controlledActiveId]);

  return (
    <TOCProvider toc={toc} single={single} activeIds={initialActiveIds}>
      <TableOfContentsInner
        label={label}
        style={style}
        className={className}
        controlledActiveId={controlledActiveId}
        controlledActiveIds={controlledActiveIds}
        onActiveChange={onActiveChange}
        onActiveIdsChange={onActiveIdsChange}
        onSelect={onSelect}
      />
    </TOCProvider>
  );
}
