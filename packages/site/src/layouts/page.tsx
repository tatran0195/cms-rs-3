'use client';

import type { ComponentProps, ReactNode } from 'react';
import { DocumentationPageLayout } from '../components/documentation-theme-provider';
import type { DocsPageSlots } from './types';

export {
  DocsBody,
  DocsDescription,
  DocsTitle,
  EditOnGitHub,
  PageBreadcrumb,
  PageFooter,
  PageLastUpdate,
} from './docs/page';

export interface DocsPageProps extends DocsPageSlots, Omit<ComponentProps<'article'>, keyof DocsPageSlots> {
  children?: ReactNode;
}

export function DocsPage({ children, ...props }: DocsPageProps) {
  return <DocumentationPageLayout {...props}>{children}</DocumentationPageLayout>;
}
