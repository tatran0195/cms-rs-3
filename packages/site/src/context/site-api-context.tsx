import { createContext, type ReactNode, useContext } from 'react';
import type { SearchAnswer, SiteSearchHit } from '../types';

export interface SiteApiConfig {
  search?: (options: { projectId: string; query: string; language?: string; version?: string; limit?: number }) => Promise<SiteSearchHit[]>;
  answer?: (options: { projectId: string; query: string; language?: string; version?: string }) => Promise<SearchAnswer>;
  trackAnalytics?: (projectId: string, event: unknown) => Promise<void>;
}

const SiteApiContext = createContext<SiteApiConfig>({});

export function SiteApiProvider({ children, config }: { children: ReactNode; config?: SiteApiConfig }) {
  return (
    <SiteApiContext value={config ?? {}}>
      {children}
    </SiteApiContext>
  );
}

export function useSiteApi(): SiteApiConfig {
  return useContext(SiteApiContext);
}
