import type { ReactNode } from 'react';
import { LocalizedProductProviders } from '@/shared/components/LocalizedProductProviders';

/** Dashboard and auth providers kept out of public marketing and reader chunks. */
export function AppProviders({ children }: { children: ReactNode }) {
  return <LocalizedProductProviders>{children}</LocalizedProductProviders>;
}
