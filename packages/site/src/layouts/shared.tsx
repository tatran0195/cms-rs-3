import type { ReactNode } from 'react';
import type { DocsLayoutSlots } from './types';

/**
 * Standard reader outer frame wrapper: places top-level banner, header, body,
 * footer, and modal/drawer overlays in consistent stacking order.
 */
export function renderReaderFrame(slots: DocsLayoutSlots, body: ReactNode): ReactNode {
  return (
    <>
      {slots.banner}
      {slots.header}
      {body}
      {slots.footer}
      {slots.overlays}
    </>
  );
}

/**
 * Fumadocs signature bottom dock: combines language switcher, external icons,
 * and theme toggle into a sleek bordered pill.
 */
export function SidebarDock({ tools }: { tools?: ReactNode }) {
  if (!tools) return null;
  return (
    <div
      data-sidebar-dock="true"
      className="flex items-center justify-between border border-border/60 bg-muted/40 p-1 rounded-xl text-muted-foreground text-sm empty:hidden"
    >
      {tools}
    </div>
  );
}
