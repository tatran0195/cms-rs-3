import type { DocsLayoutId } from '@cms/shared/themes';
import type { ReactNode } from 'react';

export interface DocsLayoutSlots {
  banner?: ReactNode;
  header: ReactNode;
  navigation: ReactNode;
  content: ReactNode;
  footer?: ReactNode;
  overlays?: ReactNode;
}

export interface ProjectPreviewSlots {
  mobileNavigation: ReactNode;
  navigation: ReactNode;
  content: ReactNode;
}

export interface StudioPreviewSlots {
  header: ReactNode;
  navigation: ReactNode;
  content: ReactNode;
}

export interface DocsPageSlots {
  article: ReactNode;
  tableOfContents: ReactNode;
}

export interface DocsLayoutTemplate {
  id: DocsLayoutId;
  ReaderLayout: (slots: DocsLayoutSlots) => ReactNode;
  ProjectPreviewLayout: (slots: ProjectPreviewSlots) => ReactNode;
  StudioPreviewLayout: (slots: StudioPreviewSlots) => ReactNode;
  PageLayout: (slots: DocsPageSlots) => ReactNode;
}
