'use client';

import { cn } from '@cms/design-system/lib/utils';
import { ChevronDown } from 'lucide-react';
import { type ComponentProps, createContext, type ReactNode, use, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TableOfContentsInner, type TOCItemType, TOCProvider, useItems } from '../../../../components/toc';

const TocPopoverContext = createContext<{
  open: boolean;
  setOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
} | null>(null);

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

export function ProgressCircle({ value, strokeWidth = 1.5, size = 18, min = 0, max = 100, style, ...restSvgProps }: ProgressCircleProps) {
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

export interface TOCProps {
  headings?: FluxTOCItem[];
  fallbackContent?: ReactNode;
  activeTitle?: string;
  style?: 'normal' | 'clerk' | 'block';
  onSelect?: (id: string) => void;
}

export function TOC({ headings = [], fallbackContent, activeTitle: defaultTitle, style = 'clerk', onSelect }: TOCProps) {
  const toc: TOCItemType[] = useMemo(
    () =>
      headings.map((item) => ({
        title: item.title,
        url: item.url.startsWith('#') ? item.url : `#${item.id}`,
        depth: item.depth,
      })),
    [headings],
  );

  return (
    <TOCProvider toc={toc}>
      <PageTOCPopover>
        <PageTOCPopoverContent>
          {fallbackContent ? (
            <div className="text-xs">{fallbackContent}</div>
          ) : (
            <TableOfContentsInner label="" style={style} onSelect={onSelect} className="static max-h-none overflow-visible w-full text-xs" />
          )}
        </PageTOCPopoverContent>
        <PageTOCPopoverTrigger defaultTitle={defaultTitle} />
      </PageTOCPopover>
    </TOCProvider>
  );
}

function PageTOCPopover({ children }: { children: ReactNode }) {
  const [container, setContainer] = useState<HTMLElement | null>(() => {
    if (typeof document !== 'undefined') {
      return document.getElementById('flux-layout-slot');
    }
    return null;
  });

  useEffect(() => {
    if (container) return;
    const find = () => {
      const el = document.getElementById('flux-layout-slot');
      if (el) {
        setContainer(el);
        return true;
      }
      return false;
    };
    if (find()) return;

    const interval = setInterval(() => {
      if (find()) clearInterval(interval);
    }, 50);

    return () => clearInterval(interval);
  }, [container]);

  if (!container) return null;
  return createPortal(<PageTOCPopoverPhysical>{children}</PageTOCPopoverPhysical>, container);
}

function PageTOCPopoverPhysical({ className, children, ...rest }: ComponentProps<'div'>) {
  const ref = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [open]);

  return (
    <TocPopoverContext.Provider value={{ open, setOpen }}>
      <div data-toc-popover="" className={cn('relative h-9 animate-fade-in min-w-0 flex-1', className)} {...rest}>
        <header
          ref={ref}
          className={cn(
            'absolute w-full bottom-0 border rounded-xl transition-colors bg-secondary text-secondary-foreground backdrop-blur-sm',
            open && 'shadow-lg bg-popover/90 text-popover-foreground',
          )}
        >
          {children}
        </header>
      </div>
    </TocPopoverContext.Provider>
  );
}

function PageTOCPopoverTrigger({ defaultTitle = 'On this page', className, ...props }: ComponentProps<'button'> & { defaultTitle?: string }) {
  const context = use(TocPopoverContext);
  const open = context?.open ?? false;
  const setOpen = context?.setOpen;
  const items = useItems();
  const selectedIdx = items.findIndex((item) => item.active);
  const lastActiveIdx = items.findLastIndex((item) => item.active);
  const progressRatio = items.length > 0 ? (Math.max(0, lastActiveIdx) + 1) / items.length : 0;
  const activeHeading = selectedIdx !== -1 ? items[selectedIdx] : undefined;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setOpen?.((v) => !v);
      }}
      aria-expanded={open}
      aria-label="Table of Contents"
      data-toc-popover-trigger=""
      className={cn(
        'flex w-full h-8.5 items-center text-sm text-muted-foreground gap-2.5 px-2 text-start focus-visible:outline-none cursor-pointer select-none [&_svg]:size-4',
        className,
      )}
      {...props}
    >
      <ProgressCircle value={progressRatio} max={1} size={18} className={cn('shrink-0 transition-colors', open && 'text-primary')} />
      <span className={cn('truncate font-medium flex-1 text-xs sm:text-sm', open && 'text-foreground')}>
        {activeHeading?.original.title ?? defaultTitle}
      </span>
      <ChevronDown className={cn('ms-auto shrink-0 size-4 text-muted-foreground transition-transform duration-200', open && 'rotate-180')} />
    </button>
  );
}

function PageTOCPopoverContent({ children, className, ...props }: ComponentProps<'div'>) {
  const context = use(TocPopoverContext);
  const open = context?.open ?? false;

  if (!open) return null;

  return (
    <div
      data-toc-popover-content=""
      className={cn('flex flex-col px-2 max-h-[50vh] overflow-y-auto [scrollbar-width:thin] py-2', className)}
      {...props}
    >
      {children}
    </div>
  );
}
