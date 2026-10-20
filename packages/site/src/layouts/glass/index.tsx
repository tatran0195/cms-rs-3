'use client';

import { useSidebar } from '../../context/sidebar-context';
import type { DocsLayoutSlots } from '../types';
import { Header } from './slots/header';
import { Sidebar } from './slots/sidebar';

export function GlassReaderShell(slots: DocsLayoutSlots) {
  const hasGranular = Boolean(slots.brand);
  const { collapsed } = useSidebar();

  return (
    <div
      id="fd-glass-layout"
      data-sidebar-collapsed={collapsed ? 'true' : 'false'}
      data-documentation-layout="glass"
      className="flex min-h-screen flex-col bg-background relative"
    >
      {slots.banner}

      <Header mobileHeader={slots.header} searchFull={slots.searchFull} tools={slots.tools} hasGranular={hasGranular} />

      <div
        className="mx-auto flex w-full max-w-[var(--theme-content-max,100%)] flex-1 px-4 pt-2 pb-12 sm:px-6 lg:gap-8"
        data-theme-region="content-shell"
      >
        <Sidebar
          brand={slots.brand}
          navTabs={slots.navTabs}
          navAnchors={slots.navAnchors}
          navigation={slots.navigation}
          sidebarTree={slots.sidebarTree}
          sidebarTools={slots.sidebarTools}
          tools={slots.tools}
          hasGranular={hasGranular}
        />

        <div className="min-w-0 flex-1 pt-4 md:pt-6">{slots.content}</div>
      </div>

      {slots.footer}
      {slots.overlays}
    </div>
  );
}

export * from './page';
export * from './slots/header';
export * from './slots/sidebar';
