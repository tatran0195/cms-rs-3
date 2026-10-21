'use client';

import type { DocsLayoutSlots } from '../types';
import { Container } from './slots/container';
import { Header } from './slots/header';
import { Sidebar } from './slots/sidebar';

export function NotebookReaderShell(slots: DocsLayoutSlots) {
  const hasGranular = Boolean(slots.brand);

  return (
    <div className="flex min-h-screen flex-col bg-background w-full">
      {slots.banner}

      <Container>
        {/* Left Sidebar [grid-area:sidebar] */}
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
        <Header navLinks={slots.navLinks} searchButton={slots.searchButton} tools={slots.tools} />

        {/* Content slots rendered with contents so toc-popover, main, and toc snap to grid areas */}
        <div className="notebook-paper contents" data-theme-region="content-slot">
          {slots.content}
        </div>
      </Container>

      {slots.footer}
      {slots.overlays}
    </div>
  );
}

export { NotebookPage } from './page';
export * from './slots/container';
export * from './slots/header';
export * from './slots/sidebar';
