import { QueryClient, type QueryClientConfig, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { CmsClientProvider } from '@cms/sdk/react';
import { cmsClient } from '../../services/cms-client';

const queryClientConfig: QueryClientConfig = {
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
};

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient(queryClientConfig));
  return (
    <QueryClientProvider client={queryClient}>
      <CmsClientProvider client={cmsClient}>{children}</CmsClientProvider>
    </QueryClientProvider>
  );
}
