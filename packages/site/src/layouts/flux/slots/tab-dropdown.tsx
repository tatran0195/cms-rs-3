'use client';

import { cn } from '@cms/design-system/lib/utils';
import { Check, ChevronsUpDown } from 'lucide-react';
import { type ComponentProps, type ReactNode, useEffect, useRef, useState } from 'react';

export interface TabDropdownProps extends ComponentProps<'button'> {
  navTabs?: ReactNode;
  activeTab?: string;
  tabs?: string[];
  onSelectTab?: (tab: string) => void;
  placeholder?: ReactNode;
}

export function TabDropdown({
  navTabs,
  activeTab = 'Framework',
  tabs = ['Framework', 'Showcase'],
  onSelectTab,
  placeholder,
  className,
  ...props
}: TabDropdownProps) {
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
    return <div className="flex-1 min-w-0">{navTabs}</div>;
  }

  return (
    <div ref={dropdownRef} className="relative flex-1 min-w-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className={cn(
          'flex w-full items-center gap-1.5 rounded-lg p-1 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none cursor-pointer',
          className,
        )}
        {...props}
      >
        <span className="truncate">{selected || placeholder}</span>
        <ChevronsUpDown className="ms-auto size-3 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        // biome-ignore lint/a11y/noStaticElementInteractions: popover content
        // biome-ignore lint/a11y/noNoninteractiveElementInteractions: popover content
        <div
          className="absolute start-0 bottom-full mb-2 w-48 rounded-xl border border-border bg-popover p-1 shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          {tabs.map((tab) => {
            const isCurrent = tab === selected;
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
                  'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-start transition-colors cursor-pointer',
                  isCurrent ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <span className="truncate flex-1">{tab}</span>
                {isCurrent && <Check className="size-3 text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
