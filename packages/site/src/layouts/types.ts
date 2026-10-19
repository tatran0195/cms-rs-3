import type { DocsLayoutId } from '@cms/shared/themes';
import type { ReactNode } from 'react';

export interface DocsLayoutSlots {
  banner?: ReactNode;
  header: ReactNode;
  navigation: ReactNode;
  content: ReactNode;
  footer?: ReactNode;
  overlays?: ReactNode;

  // Granular slots for authentic Fumadocs layouts:
  brand?: ReactNode;
  searchFull?: ReactNode;
  searchButton?: ReactNode;
  tools?: ReactNode;
  navLinks?: ReactNode;
  navTabs?: ReactNode;
  navAnchors?: ReactNode;
  sidebarTree?: ReactNode;
  mobileNav?: ReactNode;
}

export interface ProjectPreviewSlots {
  mobileNavigation: ReactNode;
  navigation: ReactNode;
  content: ReactNode;
  header?: ReactNode;
  brand?: ReactNode;
  tools?: ReactNode;
}

export interface StudioPreviewSlots {
  header: ReactNode;
  navigation: ReactNode;
  content: ReactNode;
  brand?: ReactNode;
  tools?: ReactNode;
}

export interface DocsPageSlots {
  article: ReactNode;
  tableOfContents: ReactNode;
  breadcrumb?: ReactNode;
  footer?: ReactNode;
}

export interface DocsLayoutTemplate {
  id: DocsLayoutId;
  ReaderLayout: (slots: DocsLayoutSlots) => ReactNode;
  ProjectPreviewLayout: (slots: ProjectPreviewSlots) => ReactNode;
  StudioPreviewLayout: (slots: StudioPreviewSlots) => ReactNode;
  PageLayout: (slots: DocsPageSlots) => ReactNode;
}

