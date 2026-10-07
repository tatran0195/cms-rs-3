import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { createSiteRouter } from './router';
import './styles.css';

declare global {
  interface Window {
    __SITE__?: any;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
    },
  },
});

function readBootstrap(): any {
  if (typeof document === 'undefined') return undefined;

  const scriptTag = document.getElementById('__bootstrap__') || document.getElementById('__SITE_BOOTSTRAP__');

  if (scriptTag?.textContent) {
    try {
      return JSON.parse(scriptTag.textContent);
    } catch {
      // Ignore malformed bootstrap JSON
    }
  }

  if (typeof window !== 'undefined' && window.__SITE__) {
    return window.__SITE__;
  }

  return undefined;
}

const bootstrapSite = readBootstrap();

const router = createSiteRouter({
  queryClient,
  bootstrapSite,
});

const rootElement = document.getElementById('root');
if (rootElement && !rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </React.StrictMode>,
  );
}
