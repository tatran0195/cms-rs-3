import { cn } from '@cms/design-system/lib/utils';
import { AlignLeft } from 'lucide-react';
import { useEffect, useState } from 'react';

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
}

/**
 * "On this page" table of contents with scroll-spy.
 * Supports configurable TOC styles ('normal', 'clerk', 'block') and depth filtering.
 */
export function TableOfContents({
  headings,
  label,
  style = 'normal',
  depth = 3,
  className,
}: TableOfContentsProps) {
  const items = headings
    .map((h) => {
      const d = h.depth ?? h.level ?? 1;
      const id = h.id && !/^h\d+-\d+$/.test(h.id) ? h.id : slugify(h.text) || h.id;
      return { ...h, depth: d, id };
    })
    .filter((heading) => heading.depth <= depth);

  const key = items.map((heading) => heading.id).join('|');
  const [activeId, setActiveId] = useState('');

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` is the stable signature of `items`.
  useEffect(() => {
    if (typeof window === 'undefined' || items.length === 0) {
      return;
    }
    const elements = items
      .map((heading) => document.getElementById(heading.id) || document.getElementById(slugify(heading.text)))
      .filter((el): el is HTMLElement => Boolean(el));
    if (elements.length === 0) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          setActiveId(visible[0].target.id);
        }
      },
      // Trigger when a heading reaches the top third of the viewport.
      { rootMargin: '0px 0px -70% 0px', threshold: 0 },
    );
    for (const element of elements) {
      observer.observe(element);
    }
    return () => observer.disconnect();
  }, [key]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      data-toc-style={style}
      className={cn(
        'sticky top-[calc(var(--site-header-h,4rem)+3rem)] max-h-[calc(100vh-var(--site-header-h,4rem)-4rem)] overflow-y-auto',
        className,
      )}
    >
      <div className="mb-3 flex items-center gap-2 font-semibold text-foreground text-sm">
        <AlignLeft className="size-3.5 text-muted-foreground rtl:-scale-x-100" aria-hidden />
        {label}
      </div>

      {style === 'clerk' ? (
        <div className="relative ps-3">
          {/* Continuous vertical track line */}
          <div className="absolute start-0 top-1.5 bottom-1.5 w-px bg-border/70" aria-hidden="true" />
          <ul className="space-y-0.5 text-sm">
            {items.map((heading) => {
              const active = activeId === heading.id;
              return (
                <li key={heading.id} className="relative">
                  {active && (
                    <span
                      data-toc-indicator="clerk"
                      className="absolute -start-3 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-full bg-primary ring-2 ring-primary/20 transition-all"
                      aria-hidden="true"
                    />
                  )}
                  <a
                    className={cn(
                      'block py-1 leading-snug transition-colors text-xs',
                      active ? 'font-semibold text-primary' : 'text-muted-foreground hover:text-foreground',
                    )}
                    style={{ paddingInlineStart: Math.max(0, heading.depth - 2) * 10 }}
                    href={`#${heading.id}`}
                    aria-current={active ? 'location' : undefined}
                  >
                    {heading.text}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ) : style === 'block' ? (
        <ul className="space-y-0.5 text-sm">
          {items.map((heading) => {
            const active = activeId === heading.id;
            return (
              <li key={heading.id}>
                <a
                  data-toc-item="block"
                  className={cn(
                    'block py-1 px-2.5 rounded-md leading-snug transition-colors text-xs',
                    active
                      ? 'bg-primary/10 font-semibold text-primary'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                  )}
                  style={{ marginInlineStart: Math.max(0, heading.depth - 2) * 8 }}
                  href={`#${heading.id}`}
                  aria-current={active ? 'location' : undefined}
                >
                  {heading.text}
                </a>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="space-y-0.5 text-sm">
          {items.map((heading) => {
            const active = activeId === heading.id;
            return (
              <li key={heading.id}>
                <a
                  data-toc-item="normal"
                  className={cn(
                    'block py-1 leading-snug transition-colors text-xs',
                    active ? 'font-medium text-primary' : 'text-muted-foreground hover:text-foreground',
                  )}
                  style={{ paddingInlineStart: Math.max(0, heading.depth - 2) * 10 }}
                  href={`#${heading.id}`}
                  aria-current={active ? 'location' : undefined}
                >
                  {heading.text}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
