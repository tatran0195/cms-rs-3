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
