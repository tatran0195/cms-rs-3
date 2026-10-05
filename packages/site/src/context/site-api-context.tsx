import { createContext, type ReactNode, useContext } from 'react';
import type { SearchAnswer, SiteSearchHit } from '../types';

export interface SiteApiConfig {
  search?: (options: { projectId: string; query: string; language?: string; version?: string; limit?: number }) => Promise<SiteSearchHit[]>;
  answer?: (options: { projectId: string; query: string; language?: string; version?: string }) => Promise<SearchAnswer>;
  trackAnalytics?: (projectId: string, event: unknown) => Promise<void>;
}

const defaultSearch = async (options: {
  projectId: string;
  query: string;
  language?: string;
  version?: string;
  limit?: number;
}): Promise<SiteSearchHit[]> => {
  const params = new URLSearchParams({ q: options.query });
  if (options.language) params.set('lang', options.language);
  if (options.version) params.set('version', options.version);
  if (options.limit) params.set('limit', String(options.limit));

  const res = await fetch(`/api/v1/search?${params.toString()}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.hits ?? json;
};

const SiteApiContext = createContext<SiteApiConfig>({
  search: defaultSearch,
});

export function SiteApiProvider({ children, config }: { children: ReactNode; config?: SiteApiConfig }) {
  return (
    <SiteApiContext value={config ?? { search: defaultSearch }}>
      {children}
    </SiteApiContext>
  );
}

export function useSiteApi(): SiteApiConfig {
  return useContext(SiteApiContext);
}
