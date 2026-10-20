'use client';

import { cn } from '@cms/design-system/lib/utils';
import { PanelLeft, X } from 'lucide-react';
import { type ComponentProps, createContext, type ReactNode, useContext, useEffect, useState } from 'react';

interface SidebarContextValue {
  open: boolean;
  setOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
}

export function SidebarProvider({ children, defaultOpen = false }: { children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  return <SidebarContext.Provider value={{ open, setOpen }}>{children}</SidebarContext.Provider>;
}

export function SidebarTrigger({ className, ...props }: ComponentProps<'button'>) {
  const { open, setOpen } = useSidebar();

  return (
    <button
      type="button"
      aria-label={open ? 'Close Navigation' : 'Open Navigation'}
      aria-expanded={open}
      aria-controls="nd-sidebar"
      onClick={() => setOpen((prev) => !prev)}
      className={cn(
        'grid size-7 place-items-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer overflow-hidden',
        open && 'bg-accent text-accent-foreground',
        className,
      )}
      {...props}
    >
      {open ? <X className="size-3.5" /> : <PanelLeft className="size-3.5" />}
    </button>
  );
}

export interface SidebarProps extends ComponentProps<'aside'> {
  banner?: ReactNode;
  footer?: ReactNode;
  navAnchors?: ReactNode;
  navigation?: ReactNode;
}

export function Sidebar({ banner, footer, navAnchors, navigation, children, className, ...props }: SidebarProps) {
  const { open, setOpen } = useSidebar();

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: backdrop dismiss
    <div
      className={cn(
        'fixed inset-0 py-10 z-30 backdrop-blur-md bg-background/60 transition-opacity duration-200',
        open ? 'opacity-100 pointer-events-auto' : 'pointer-events-none opacity-0',
      )}
      onClick={() => setOpen(false)}
    >
      {/* Scrollable Container strictly bounded from top-0 to bottom-26 so it never overlaps dock panel */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: stop propagation */}
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: stop propagation */}
      <div
        className="absolute top-0 min-h-0 inset-x-0 bottom-26 overflow-y-auto fd-scroll-container py-16 px-4 lg:text-sm [mask-image:linear-gradient(to_bottom,transparent,white_3.5rem,white_calc(100%-3.5rem),transparent)] [-webkit-mask-image:linear-gradient(to_bottom,transparent,white_3.5rem,white_calc(100%-3.5rem),transparent)]"
        onClick={(e) => e.stopPropagation()}
      >
        <aside
          id="nd-sidebar"
          data-theme-region="sidebar"
          className={cn('mx-auto w-full sm:max-w-[400px] flex flex-col p-4', className)}
          onClickCapture={(e) => {
            if ((e.target as HTMLElement).closest('a')) {
              setOpen(false);
            }
          }}
          {...props}
        >
          {banner && <div className="mb-4">{banner}</div>}

          <div className="flex flex-col gap-1" data-theme-region="sidebar-content">
            {navAnchors}
            {navigation ?? children}
          </div>

          {footer && <div className="mt-4">{footer}</div>}
        </aside>
      </div>
    </div>
  );
}
