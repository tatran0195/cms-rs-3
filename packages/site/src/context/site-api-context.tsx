import { createContext, type ReactNode, useContext } from 'react';
import type { SiteSearchHit } from '../types';

export interface SiteApiConfig {
  search?: (options: { projectId: string; query: string; language?: string; version?: string; limit?: number }) => Promise<SiteSearchHit[]>;
  trackAnalytics?: (projectId: string, event: unknown) => Promise<void>;
}

const SiteApiContext = createContext<SiteApiConfig>({});

export function SiteApiProvider({ children, config }: { children: ReactNode; config?: SiteApiConfig }) {
  return <SiteApiContext value={config ?? {}}>{children}</SiteApiContext>;
}

export function useSiteApi(): SiteApiConfig {
  return useContext(SiteApiContext);
}
