'use client';

import type { DocsLayoutSlots } from '../types';
import { Container } from './slots/container';
import { Header } from './slots/header';
import { Sidebar } from './slots/sidebar';

export function SpaciousReaderShell(slots: DocsLayoutSlots) {
  const hasGranular = Boolean(slots.brand);

  return (
    <Container
      banner={slots.banner}
      header={<Header mobileHeader={slots.header} hasGranular={hasGranular} />}
      sidebar={
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
      }
      content={slots.content}
      footer={slots.footer}
      overlays={slots.overlays}
      navLinks={slots.navLinks}
      searchButton={slots.searchButton}
      tools={slots.tools}
    />
  );
}

export { SpaciousPage } from './page';
export * from './slots/container';
export * from './slots/header';
export * from './slots/sidebar';
