'use client';

import type { DocsLayoutSlots } from '../types';
import { Container } from './slots/container';
import { Header } from './slots/header';
import { Sidebar } from './slots/sidebar';

export function DocsStandardReaderShell(slots: DocsLayoutSlots) {
  const hasGranular = Boolean(slots.brand);

  return (
    <div className="flex min-h-screen flex-col bg-background w-full">
      {slots.banner}

      <Container>
        {/* Desktop Sticky Sidebar [grid-area:sidebar] */}
        <Sidebar
          brand={slots.brand}
          searchFull={slots.searchFull}
          navTabs={slots.navTabs}
          navAnchors={slots.navAnchors}
          navigation={slots.navigation}
          sidebarTree={slots.sidebarTree}
          sidebarTools={slots.sidebarTools}
          tools={slots.tools}
          hasGranular={hasGranular}
        />

        {/* Top Header [grid-area:header] */}
        <Header mobileHeader={slots.header} navLinks={slots.navLinks} tools={slots.tools} hasGranular={hasGranular} />

        {/* Content slots rendered with contents so toc-popover, main, and toc snap to grid areas */}
        <div className="contents" data-theme-region="content-slot">
          {slots.content}
        </div>

        {/* Footer in [grid-area:footer] - strictly after sidebar columns */}
        {slots.footer && (
          <div className="[grid-area:footer] w-full min-w-0" data-theme-region="footer-slot">
            {slots.footer}
          </div>
        )}
      </Container>

      {slots.overlays}
    </div>
  );
}

export { DocsPage } from './page';
export * from './slots/container';
export * from './slots/header';
export * from './slots/sidebar';
