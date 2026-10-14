import React, { createContext, useContext, type ReactNode } from 'react';
import type { CmsClient } from '../client';

const CmsContext = createContext<CmsClient | null>(null);

export interface CmsClientProviderProps {
  client: CmsClient;
  children?: ReactNode;
}


export function CmsClientProvider({ client, children }: CmsClientProviderProps) {
  return <CmsContext.Provider value={client}>{children}</CmsContext.Provider>;
}

export function useCmsClient(): CmsClient {
  const client = useContext(CmsContext);
  if (!client) {
    throw new Error('useCmsClient must be used within a CmsClientProvider');
  }
  return client;
}
