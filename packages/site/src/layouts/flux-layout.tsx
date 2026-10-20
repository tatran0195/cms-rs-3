'use client';

import { createContext } from 'react';
import { FluxPage, FluxProgressCircle, FluxReaderLayoutComponent, FluxTOC, TabDropdown } from './flux';
import type { DocsLayoutTemplate } from './types';

export * from './flux';

export const FluxLayoutContext = createContext<{
  hasPageTOC: boolean;
  setHasPageTOC: (has: boolean) => void;
}>({
  hasPageTOC: false,
  setHasPageTOC: () => {
    // Default no-op
  },
});

export const FluxTOCPopover = FluxTOC;
export const ProgressCircle = FluxProgressCircle;
export const FluxTabDropdown = TabDropdown;

export const fluxLayoutTemplate: DocsLayoutTemplate = {
  id: 'flux',
  ReaderLayout: FluxReaderLayoutComponent,
  ProjectPreviewLayout: ({ mobileNavigation, navigation, content }) => (
    <div id="fd-flux-layout" className="flex flex-col min-h-screen">
      {mobileNavigation}
      {navigation}
      {content}
    </div>
  ),
  StudioPreviewLayout: ({ header, navigation, content }) => (
    <div id="fd-flux-layout" className="flex flex-col min-h-screen">
      {header}
      {navigation}
      {content}
    </div>
  ),
  PageLayout: (slots) => <FluxPage {...slots} />,
};

export const FluxLayoutTemplate = fluxLayoutTemplate;
